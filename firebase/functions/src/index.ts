import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest, type Request } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import type { Response } from "express";
import {
  ADMIN_TOKEN, BOLNA_AGENT_ID, BOLNA_API_KEY, BOLNA_FROM_NUMBER, CALL_END_HOUR, CALL_START_HOUR, CALL_TIMEZONE,
  MAX_CONCURRENT_CALLS, REGION, TOOL_TOKEN, WEBHOOK_TOKEN,
} from "./config";
import { body, onlyPost, requireToken } from "./http";
import * as reg from "./registrants";
import { saveExecution, type BolnaExecution } from "./webhook";
import { runSeed, type SeedPayload } from "./seed";
import { dispatch, launchEvent as launch, onCallStatus, queueStats, sweep, type DialerDeps } from "./queue";
import { normaliseEventId, upsertEvent as upsert, type EventInput } from "./events";
import { PRESETS, runImport, type ColumnMapping, type Row } from "./importer";
import { parseCsv } from "./csv";
import type { Status } from "./logic";

setGlobalOptions({ region: REGION, invoker: "public", maxInstances: 10, memory: "256MiB", timeoutSeconds: 30 });

const dialerDeps = (): DialerDeps => ({
  apiKey: BOLNA_API_KEY.value(),
  agentId: BOLNA_AGENT_ID.value(),
  fromNumber: BOLNA_FROM_NUMBER.value(),
  maxConcurrent: Math.max(1, MAX_CONCURRENT_CALLS.value()),
  window: { startHour: CALL_START_HOUR.value(), endHour: CALL_END_HOUR.value(), timezone: CALL_TIMEZONE.value() },
});

const fail = (res: Response, err: unknown, where: string) => {
  logger.error(where, err);
  // Tool replies are read aloud by the agent: keep them speakable.
  res.status(200).json({ ok: false, message: "The system had a hiccup saving that. Carry on; an organiser will follow up." });
};

/** Admin endpoints: token-protected, JSON errors with real messages. */
const admin = (handler: (b: Record<string, unknown>, req: Request) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    if (!onlyPost(req, res) || !requireToken(req, res, ADMIN_TOKEN.value())) return;
    try {
      res.json({ ok: true, ...(await handler(body(req), req) as object) });
    } catch (err) {
      logger.warn("admin endpoint error", { path: req.path, err: String(err) });
      res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
    }
  };

// ------------------------------------------------------------------ Riya's tools

/** Custom tool: lookup_registrant { registrant_id } */
export const lookupRegistrant = onRequest({ secrets: [TOOL_TOKEN] }, async (req, res) => {
  if (!onlyPost(req, res) || !requireToken(req, res, TOOL_TOKEN.value())) return;
  try {
    res.json(await reg.lookupRegistrant(body(req).registrant_id));
  } catch (err) { fail(res, err, "lookupRegistrant"); }
});

/** Custom tool: update_registrant { registrant_id, field, value } */
export const updateRegistrant = onRequest({ secrets: [TOOL_TOKEN] }, async (req, res) => {
  if (!onlyPost(req, res) || !requireToken(req, res, TOOL_TOKEN.value())) return;
  try {
    const b = body(req);
    res.json(await reg.updateRegistrant(b.registrant_id, b.field, b.value));
  } catch (err) { fail(res, err, "updateRegistrant"); }
});

/** Custom tool: release_seat { registrant_id, reason }. Promotes waitlist #1 and queues their call. */
export const releaseSeat = onRequest({ secrets: [TOOL_TOKEN, BOLNA_API_KEY], timeoutSeconds: 60 }, async (req, res) => {
  if (!onlyPost(req, res) || !requireToken(req, res, TOOL_TOKEN.value())) return;
  try {
    const b = body(req);
    res.json(await reg.releaseSeat(b.registrant_id, b.reason, dialerDeps()));
  } catch (err) { fail(res, err, "releaseSeat"); }
});

// ------------------------------------------------------------------ Bolna webhook + dialer

/** Bolna agent webhook: one POST per call status change. Frees dialer slots on terminal statuses. */
export const bolnaWebhook = onRequest({ secrets: [WEBHOOK_TOKEN, BOLNA_API_KEY], timeoutSeconds: 60 }, async (req, res) => {
  if (!onlyPost(req, res) || !requireToken(req, res, WEBHOOK_TOKEN.value(), { allowQuery: true })) return;
  try {
    const payload = body(req) as BolnaExecution;
    const saved = await saveExecution(payload);
    const freed = await onCallStatus(saved.executionId, String(payload.status ?? ""));
    const next = freed ? await dispatch(dialerDeps()) : null;
    res.json({ ok: true, ...saved, slotFreed: freed, dialled: next?.dialled ?? 0 });
  } catch (err) {
    logger.error("bolnaWebhook", err);
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

/** Safety net: every minute, recover stuck slots and keep the queue moving. */
export const dialerTick = onSchedule(
  { schedule: "every 1 minutes", timeZone: "Asia/Kolkata", secrets: [BOLNA_API_KEY], timeoutSeconds: 120, retryCount: 0 },
  async () => {
    const recovered = await sweep();
    const d = await dispatch(dialerDeps());
    if (recovered || d.dialled) logger.info("dialerTick", { recovered, ...d });
  },
);

// ------------------------------------------------------------------ admin: events, import, launch

/**
 * Create/update an event. Body: { eventId?, lumaUrl?, event?: { name, date, venue, capacity, enabled, timezone, maxTeamSize } }.
 * With lumaUrl, details come from the public Luma page; `event` fields override them.
 */
export const upsertEvent = onRequest({ secrets: [ADMIN_TOKEN], timeoutSeconds: 60 }, admin((b) =>
  upsert({
    eventId: b.eventId ? String(b.eventId) : undefined,
    lumaUrl: b.lumaUrl ? String(b.lumaUrl) : undefined,
    event: (b.event ?? {}) as EventInput,
    dryRun: b.dryRun === true,
  })));

/**
 * Import guests. Body: { eventId, csv? | rows?, mapping?: ColumnMapping | "luma", lumaUrl?, event?, dryRun? }.
 * If lumaUrl/event is given, the event is created or updated first.
 */
export const importGuests = onRequest({ secrets: [ADMIN_TOKEN], timeoutSeconds: 300, memory: "512MiB" }, admin(async (b) => {
  let eventId = normaliseEventId(b.eventId);
  let eventResult: unknown = null;
  if (b.lumaUrl || b.event) {
    const r = await upsert({
      eventId: eventId || undefined,
      lumaUrl: b.lumaUrl ? String(b.lumaUrl) : undefined,
      event: (b.event ?? {}) as EventInput,
      dryRun: b.dryRun === true,
    });
    eventId = r.eventId;
    eventResult = r;
  }
  if (!eventId) throw new Error("Pass eventId (or lumaUrl to create the event).");

  const rows: Row[] = typeof b.csv === "string" ? parseCsv(b.csv) : Array.isArray(b.rows) ? (b.rows as Row[]) : [];
  if (!rows.length) return { event: eventResult, imported: null, message: "No rows given; event saved only." };
  if (rows.length > 5000) throw new Error("At most 5000 rows per import.");

  const mapping: ColumnMapping | undefined =
    typeof b.mapping === "string" ? PRESETS[b.mapping] : (b.mapping as ColumnMapping | undefined) ?? PRESETS.luma;
  if (!mapping?.phone || !mapping?.name) throw new Error(`Mapping needs at least "name" and "phone". Presets: ${Object.keys(PRESETS).join(", ")}.`);
  const missing = [mapping.phone, ...(Array.isArray(mapping.name) ? mapping.name : [mapping.name])]
    .filter((c) => !(c in rows[0]));
  if (missing.length && !("first_name" in rows[0])) {
    throw new Error(`Columns not found in the rows: ${missing.join(", ")}. Found: ${Object.keys(rows[0]).join(", ")}.`);
  }
  if (b.dryRun === true && eventResult && (eventResult as { created: boolean }).created) {
    return { event: eventResult, imported: null, message: "Dry run: the event doesn't exist yet, so guests can't be planned. Run without dryRun to create it." };
  }
  return { event: eventResult, imported: await runImport(eventId, rows, mapping, b.dryRun === true) };
}));

/**
 * Queue a Riya call to every guest of an event. Body: { eventId, statuses?: ["registered"], dryRun?, force? }.
 * The dialer keeps at most MAX_CONCURRENT_CALLS (2) calls running and only dials inside calling hours.
 */
export const launchEvent = onRequest({ secrets: [ADMIN_TOKEN, BOLNA_API_KEY], timeoutSeconds: 120 }, admin(async (b) => {
  const eventId = normaliseEventId(b.eventId);
  if (!eventId) throw new Error("Pass eventId.");
  const statuses = Array.isArray(b.statuses) ? (b.statuses as Status[]) : undefined;
  return launch(eventId, { statuses, dryRun: b.dryRun === true, force: b.force === true }, dialerDeps());
}));

/** Queue counts, optionally for one event. Body: { eventId? } */
export const dialerStatus = onRequest({ secrets: [ADMIN_TOKEN] }, admin(async (b) =>
  ({ counts: await queueStats(b.eventId ? normaliseEventId(b.eventId) : undefined), maxConcurrent: MAX_CONCURRENT_CALLS.value() })));

/** Seeding endpoint used by scripts/seed.ts. */
export const adminSeed = onRequest({ secrets: [ADMIN_TOKEN] }, admin(async (b) => runSeed(b as SeedPayload)));
