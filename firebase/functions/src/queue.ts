/**
 * Outbound dialer. Every Riya call (event launches and waitlist promotions) goes through
 * the `callQueue` collection so we never exceed Bolna's concurrent-call limit.
 *
 *   pending ──dispatch──▶ dialing ──Bolna accepted──▶ active ──webhook terminal──▶ done
 *                            │                                        └─(15 min, no webhook)─▶ timeout
 *                            └─ retryable error ▶ pending (backoff) / other error ▶ failed / ineligible ▶ skipped
 *
 * dispatch() runs after enqueueing, after every terminal webhook, and every minute (sweep).
 */
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { BolnaError, placeCall, toE164 } from "./bolna";
import { COL } from "./config";
import { eventFrom, firestore, refs, registrantFrom } from "./db";
import { callVariables, normaliseId, type EventInfo, type Note, type Status } from "./logic";

export type QueueStatus = "pending" | "dialing" | "active" | "done" | "failed" | "skipped" | "timeout";
export type QueueReason = "launch" | "waitlist_promotion" | "call_now" | "retry";

export interface QueueItem {
  id: string;
  eventId: string;
  registrantId: string;
  reason: QueueReason;
  priority: number;
  status: QueueStatus;
  attempts: number;
  notBeforeMs: number;
  createdAtMs: number;
  startedAtMs: number | null;
  /** Registrant statuses that still justify the call when it is dialled. */
  allowedStatuses: Status[];
}

export interface DialerDeps {
  apiKey: string;
  agentId: string;
  fromNumber: string;
  maxConcurrent: number;
  window: { startHour: number; endHour: number; timezone: string };
  /** Test seam; defaults to the real Bolna client. */
  placeCall?: typeof placeCall;
}

export const PRIORITY: Record<QueueReason, number> = { waitlist_promotion: 0, call_now: 0, retry: 0, launch: 10 };
const ACTIVE: QueueStatus[] = ["dialing", "active"];
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2 * 60_000;
const DIALING_STALE_MS = 3 * 60_000;
const ACTIVE_STALE_MS = 15 * 60_000;

/** Bolna execution statuses after which the line is free again. */
const TERMINAL = new Set([
  "completed", "call-disconnected", "busy", "no-answer", "failed", "canceled", "cancelled",
  "error", "balance-low", "stopped", "rejected", "not-answered",
]);
export const isTerminal = (status: string) => TERMINAL.has(String(status).toLowerCase());

// ------------------------------------------------------------------ pure helpers

export function hourIn(date: Date, timezone: string): number {
  const h = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: timezone }).format(date);
  return Number(h);
}

export function withinWindow(date: Date, w: DialerDeps["window"]): boolean {
  const h = hourIn(date, w.timezone);
  return h >= w.startHour && h < w.endHour;
}

/** Highest priority, oldest first; skips items in backoff or for disabled events. */
export function pickNext(pending: QueueItem[], enabledEvents: Set<string>, nowMs: number): QueueItem | null {
  return pending
    .filter((q) => q.notBeforeMs <= nowMs && enabledEvents.has(q.eventId))
    .sort((a, b) => a.priority - b.priority || a.createdAtMs - b.createdAtMs)[0] ?? null;
}

export const queueId = (reason: QueueReason, eventId: string, registrantId: string) =>
  reason === "launch" ? `launch_${eventId}_${registrantId}`
  : reason === "waitlist_promotion" ? `promo_${registrantId}`
  : `${reason}_${registrantId}`;

// ------------------------------------------------------------------ Firestore

const queue = () => firestore().collection(COL.callQueue);

function itemFrom(id: string, d: FirebaseFirestore.DocumentData): QueueItem {
  return {
    id,
    eventId: String(d.eventId),
    registrantId: String(d.registrantId),
    reason: d.reason,
    priority: Number(d.priority ?? 10),
    status: d.status,
    attempts: Number(d.attempts ?? 0),
    notBeforeMs: Number(d.notBeforeMs ?? 0),
    createdAtMs: Number(d.createdAtMs ?? 0),
    startedAtMs: d.startedAtMs == null ? null : Number(d.startedAtMs),
    allowedStatuses: Array.isArray(d.allowedStatuses) ? d.allowedStatuses : ["registered"],
  };
}

/**
 * Add calls to the queue. Idempotent per (reason, event, registrant): anything already
 * pending/dialing/active is left alone; finished items are re-queued only with `force`.
 */
export async function enqueue(
  items: { eventId: string; registrantId: string; reason: QueueReason; allowedStatuses: Status[] }[],
  opts: { force?: boolean } = {},
) {
  const db = firestore();
  const result = { queued: 0, alreadyQueued: 0, alreadyCalled: 0 };
  for (let i = 0; i < items.length; i += 300) {
    const chunk = items.slice(i, i + 300);
    const docRefs = chunk.map((it) => queue().doc(queueId(it.reason, it.eventId, it.registrantId)));
    const snaps = await db.getAll(...docRefs);
    const batch = db.batch();
    const now = Date.now();
    chunk.forEach((it, j) => {
      const prev = snaps[j].exists ? (snaps[j].data()!.status as QueueStatus) : null;
      if (prev && ["pending", ...ACTIVE].includes(prev)) { result.alreadyQueued++; return; }
      if (prev && !opts.force && it.reason === "launch") { result.alreadyCalled++; return; }
      batch.set(docRefs[j], {
        eventId: it.eventId,
        registrantId: it.registrantId,
        reason: it.reason,
        priority: PRIORITY[it.reason],
        allowedStatuses: it.allowedStatuses,
        status: "pending",
        attempts: 0,
        notBeforeMs: 0,
        createdAtMs: now + j, // stable FIFO within a batch
        startedAtMs: null,
        executionId: null,
        error: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      result.queued++;
    });
    await batch.commit();
  }
  return result;
}

async function claimNext(deps: DialerDeps): Promise<QueueItem | null> {
  return firestore().runTransaction(async (tx: Transaction) => {
    const active = await tx.get(queue().where("status", "in", ACTIVE));
    if (active.size >= deps.maxConcurrent) return null;
    const pendingSnap = await tx.get(queue().where("status", "==", "pending").orderBy("priority").orderBy("createdAtMs").limit(50));
    if (pendingSnap.empty) return null;
    let pending = pendingSnap.docs.map((d) => itemFrom(d.id, d.data()));
    if (!active.empty) {
      const regIds = [...new Set([...active.docs.map((d) => String(d.get("registrantId"))), ...pending.map((p) => p.registrantId)])];
      const regSnaps = await tx.getAll(...regIds.map((id) => refs.registrant(id)));
      const phoneOf = new Map(regSnaps.filter((s) => s.exists).map((s) => [s.id, toE164(String(s.get("phone") ?? ""))]));
      const busyPhones = new Set(
        active.docs.map((d) => phoneOf.get(String(d.get("registrantId")))).filter((p): p is string => !!p),
      );
      if (busyPhones.size) {
        pending = pending.filter((p) => {
          const ph = phoneOf.get(p.registrantId);
          return !ph || !busyPhones.has(ph);
        });
      }
      if (!pending.length) return null;
    }
    const eventIds = [...new Set(pending.map((p) => p.eventId))];
    const evSnaps = await tx.getAll(...eventIds.map((id) => refs.event(id)));
    const enabled = new Set(evSnaps.filter((s) => s.exists && s.get("enabled") === true).map((s) => s.id));
    const next = pickNext(pending, enabled, Date.now());
    if (!next) return null;
    tx.update(queue().doc(next.id), {
      status: "dialing",
      startedAtMs: Date.now(),
      attempts: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...next, attempts: next.attempts + 1 };
  });
}

const note = (text: string): Note => ({ at: new Date().toISOString(), text });

async function finish(item: QueueItem, status: QueueStatus, fields: Record<string, unknown> = {}) {
  await queue().doc(item.id).update({ status, ...fields, updatedAt: FieldValue.serverTimestamp() });
}

/** Dial one claimed item. Never throws. */
async function dial(item: QueueItem, deps: DialerDeps): Promise<void> {
  try {
    const [regSnap, evSnap] = await Promise.all([refs.registrant(item.registrantId).get(), refs.event(item.eventId).get()]);
    if (!regSnap.exists) return finish(item, "skipped", { error: "registrant no longer exists" });
    const reg = registrantFrom(regSnap);
    const event: EventInfo | null = evSnap.exists ? eventFrom(evSnap) : null;
    if (!event?.enabled) return finish(item, "pending", { startedAtMs: null, error: "event disabled; waiting" });
    if (!item.allowedStatuses.includes(reg.status)) {
      return finish(item, "skipped", { error: `registrant is now ${reg.status}` });
    }
    const to = toE164(reg.phone);
    const fail = async (why: string) => {
      await refs.registrant(reg.id).update({ notes: FieldValue.arrayUnion(note(`Call not placed: ${why}`)) });
      return finish(item, "failed", { error: why });
    };
    if (!to) return fail(`phone "${reg.phone}" is not a valid number`);
    if (!deps.agentId) return fail("BOLNA_AGENT_ID is not configured");
    if (!deps.apiKey) return fail("BOLNA_API_KEY is not configured");

    try {
      const { executionId, status } = await (deps.placeCall ?? placeCall)({
        apiKey: deps.apiKey, agentId: deps.agentId, to, from: deps.fromNumber || undefined,
        userData: callVariables(reg, event),
      });
      const now = FieldValue.serverTimestamp();
      await Promise.all([
        finish(item, "active", { executionId, error: null }),
        refs.call(executionId).set({
          executionId, registrantId: reg.id, eventId: event.id, agentId: deps.agentId,
          trigger: item.reason, queueId: item.id, status, queuedAt: now, updatedAt: now,
        }, { merge: true }),
        refs.registrant(reg.id).update({
          lastCall: { executionId, status, at: new Date().toISOString() },
          notes: FieldValue.arrayUnion(note(
            `${item.reason === "launch" ? "Launch" : item.reason === "waitlist_promotion" ? "Promotion" : item.reason === "retry" ? "Retry" : "Organiser"} call placed (${executionId}).`,
          )),
        }),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof BolnaError && err.retryable && item.attempts < MAX_ATTEMPTS) {
        logger.warn("Bolna call deferred", { queueId: item.id, msg });
        return finish(item, "pending", { startedAtMs: null, notBeforeMs: Date.now() + RETRY_DELAY_MS, error: msg });
      }
      return fail(msg);
    }
  } catch (err) {
    logger.error("dial failed", { queueId: item.id, err: String(err) });
    await finish(item, "pending", { startedAtMs: null, notBeforeMs: Date.now() + RETRY_DELAY_MS, error: String(err) }).catch(() => {});
  }
}

/** Fill free call slots. Safe to call any time, from anywhere. */
export async function dispatch(deps: DialerDeps): Promise<{ dialled: number; reason?: string }> {
  if (!withinWindow(new Date(), deps.window)) return { dialled: 0, reason: "outside calling hours" };
  let dialled = 0;
  for (let i = 0; i < deps.maxConcurrent + 2; i++) {
    const item = await claimNext(deps);
    if (!item) break;
    await dial(item, deps);
    dialled++;
  }
  return { dialled };
}

/** Called by the webhook: frees the slot when a queued call finishes. */
export async function onCallStatus(executionId: string, status: string): Promise<boolean> {
  if (!executionId || !isTerminal(status)) return false;
  const snap = await queue().where("executionId", "==", executionId).limit(1).get();
  if (snap.empty) return false;
  const doc = snap.docs[0];
  if (!ACTIVE.includes(doc.get("status"))) return false;
  await doc.ref.update({ status: "done", finalStatus: status, finishedAtMs: Date.now(), updatedAt: FieldValue.serverTimestamp() });
  return true;
}

/** Recover slots from crashed dials and calls whose webhook never arrived. */
export async function sweep(nowMs = Date.now()) {
  const snap = await queue().where("status", "in", ACTIVE).get();
  let recovered = 0;
  for (const d of snap.docs) {
    const started = Number(d.get("startedAtMs") ?? 0);
    if (d.get("status") === "dialing" && nowMs - started > DIALING_STALE_MS) {
      await d.ref.update({ status: "pending", startedAtMs: null, error: "dial interrupted; retrying", updatedAt: FieldValue.serverTimestamp() });
      recovered++;
    } else if (d.get("status") === "active" && nowMs - started > ACTIVE_STALE_MS) {
      await d.ref.update({ status: "timeout", finishedAtMs: nowMs, error: "no final webhook within 15 minutes", updatedAt: FieldValue.serverTimestamp() });
      recovered++;
    }
  }
  return recovered;
}

/** Queue a Riya call to every guest of an event whose status is in `statuses`. */
export async function launchEvent(
  eventId: string,
  opts: { statuses?: Status[]; dryRun?: boolean; force?: boolean },
  deps: DialerDeps,
) {
  const evSnap = await refs.event(eventId).get();
  if (!evSnap.exists) throw new Error(`Event ${eventId} does not exist.`);
  const event = eventFrom(evSnap);
  if (!event.enabled) throw new Error(`Event ${eventId} is disabled. Enable it first.`);
  const statuses: Status[] = opts.statuses?.length ? opts.statuses : ["registered"];
  const regs = (await firestore().collection(COL.registrants)
    .where("eventId", "==", eventId).where("status", "in", statuses).get()).docs.map(registrantFrom);
  const callable = regs.filter((r) => toE164(r.phone));
  const invalidPhone = regs.filter((r) => !toE164(r.phone)).map((r) => ({ id: r.id, name: r.name }));
  const summary = {
    eventId, statuses, eligible: regs.length, callable: callable.length, invalidPhone,
    sampleVariables: callable[0] ? callVariables(callable[0], event) : null,
  };
  if (opts.dryRun) return { ...summary, dryRun: true };

  const q = await enqueue(
    callable.map((r) => ({ eventId, registrantId: r.id, reason: "launch" as const, allowedStatuses: statuses })),
    { force: opts.force },
  );
  const d = await dispatch(deps);
  return { ...summary, ...q, dialledNow: d.dialled, note: d.reason ?? null, maxConcurrent: deps.maxConcurrent };
}

/** Counts for monitoring. */
export async function queueStats(eventId?: string) {
  let q: FirebaseFirestore.Query = queue();
  if (eventId) q = q.where("eventId", "==", eventId);
  const snap = await q.get();
  const counts: Record<string, number> = {};
  snap.docs.forEach((d) => { counts[d.get("status")] = (counts[d.get("status")] ?? 0) + 1; });
  return counts;
}

const ALL_STATUSES: Status[] = ["registered", "confirmed", "maybe", "declined", "waitlist", "cancelled"];

/** Enqueue a single organiser-initiated call ("call_now" or "retry") via the dialer and dispatch immediately. */
export async function queueRegistrantCall(
  rawRegistrantId: unknown,
  rawReason: unknown,
  deps: DialerDeps,
) {
  const registrantId = normaliseId(rawRegistrantId);
  if (!registrantId) throw new Error("registrantId is required.");
  const snap = await refs.registrant(registrantId).get();
  if (!snap.exists) throw new Error(`Registrant ${registrantId} not found.`);
  const reg = registrantFrom(snap);
  const eventId = reg.eventId || "HACK2026";
  const evRef = refs.event(eventId);
  const evSnap = await evRef.get();
  if (evSnap.exists && !evSnap.get("enabled")) {
    await evRef.update({ enabled: true, updatedAt: FieldValue.serverTimestamp() });
  }
  const reason: QueueReason = rawReason === "retry" ? "retry" : "call_now";
  const qId = queueId(reason, eventId, reg.id);

  const enq = await enqueue(
    [{ eventId, registrantId: reg.id, reason, allowedStatuses: ALL_STATUSES }],
    { force: true },
  );
  const d = await dispatch(deps);
  const itemSnap = await queue().doc(qId).get();
  const itemData = itemSnap.data() ?? {};
  return {
    queueId: qId,
    registrantId: reg.id,
    eventId,
    reason,
    status: (itemData.status as string) ?? "pending",
    executionId: (itemData.executionId as string | null) ?? null,
    error: (itemData.error as string | null) ?? null,
    ...enq,
    dialledNow: d.dialled,
    note: d.reason ?? null,
    maxConcurrent: deps.maxConcurrent,
  };
}
