/**
 * Generic guest importer: rows + column mapping → registrants for one event.
 * planImport() is pure (unit-tested); runImport() applies the plan to Firestore.
 */
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { toE164 } from "./bolna";
import { COL } from "./config";
import { eventFrom, firestore, refs, registrantFrom } from "./db";
import { normalise, type AgentField, type EventInfo, type Registrant, type Status } from "./logic";

/** Which source column feeds each registrant field. `name` may list several columns to join. */
export interface ColumnMapping {
  name: string | string[];
  phone: string;
  email?: string;
  status?: string;
  externalId?: string;
  teamName?: string;
  teamSize?: string;
  foodPref?: string;
  tshirtSize?: string;
  language?: string;
}

/** Luma "Download guests as CSV" export. */
export const PRESETS: Record<string, ColumnMapping> = {
  luma: { name: ["name"], phone: "phone_number", email: "email", status: "approval_status", externalId: "api_id" },
};

export type Row = Record<string, unknown>;

/** Source status (Luma approval_status etc.) → our status; null means "decide by capacity". */
export function mapGuestStatus(raw: unknown): Status | "skip" | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return null;
  if (["approved", "going", "registered", "confirmed", "accepted", "attending"].includes(s)) return "registered";
  if (["waitlist", "waitlisted", "pending_approval", "pending", "on_waitlist"].includes(s)) return "waitlist";
  if (["declined", "not_going", "rejected", "cancelled", "canceled"].includes(s)) return "declined";
  if (["invited", "invite_sent"].includes(s)) return "skip";
  return null;
}

export function guestId(eventId: string, key: string): string {
  return `${eventId}-${createHash("sha1").update(`${eventId}|${key}`).digest("hex").slice(0, 8).toUpperCase()}`;
}

const cell = (row: Row, col?: string) => (col ? String(row[col] ?? "").trim() : "");

export interface PlannedGuest {
  id: string;
  isNew: boolean;
  data: Record<string, unknown>;
}

export interface ImportPlan {
  guests: PlannedGuest[];
  skipped: { row: number; reason: string }[];
  warnings: string[];
  stats: { rows: number; created: number; updated: number; skipped: number; registered: number; waitlisted: number; invalidPhones: number };
}

const OPTIONAL: [keyof ColumnMapping, AgentField, string][] = [
  ["teamName", "team_name", "teamName"],
  ["teamSize", "team_size", "teamSize"],
  ["foodPref", "food_pref", "foodPref"],
  ["tshirtSize", "tshirt_size", "tshirtSize"],
  ["language", "language", "language"],
];

/**
 * Pure planning. Existing guests keep their status and answers (only identity fields refresh).
 * New guests: explicit source status wins; otherwise registered while seats remain, then waitlist.
 */
export function planImport(event: EventInfo, rows: Row[], mapping: ColumnMapping, existing: Registrant[]): ImportPlan {
  const plan: ImportPlan = {
    guests: [], skipped: [], warnings: [],
    stats: { rows: rows.length, created: 0, updated: 0, skipped: 0, registered: 0, waitlisted: 0, invalidPhones: 0 },
  };
  const byId = new Map(existing.map((r) => [r.id, r]));
  let held = existing.filter((r) => !["waitlist", "cancelled", "declined"].includes(r.status)).length;
  let rank = existing.reduce((m, r) => Math.max(m, r.waitlistRank ?? 0), 0);
  const seen = new Set<string>();
  const nameCols = Array.isArray(mapping.name) ? mapping.name : [mapping.name];

  rows.forEach((row, i) => {
    const n = i + 2; // spreadsheet row number (header is row 1)
    let name = nameCols.map((c) => cell(row, c)).filter(Boolean).join(" ");
    // Luma-style exports sometimes leave "name" empty but fill first/last.
    if (!name) name = [cell(row, "first_name"), cell(row, "last_name")].filter(Boolean).join(" ");
    const rawPhone = cell(row, mapping.phone);
    const phone = toE164(rawPhone);
    const email = cell(row, mapping.email).toLowerCase();
    const ext = cell(row, mapping.externalId);
    const key = ext || email || phone || "";
    if (!name) { plan.skipped.push({ row: n, reason: "missing name" }); return; }
    if (!key) { plan.skipped.push({ row: n, reason: "no phone, email or id to identify the guest" }); return; }
    const id = guestId(event.id, key);
    if (seen.has(id)) { plan.skipped.push({ row: n, reason: "duplicate of an earlier row" }); return; }
    seen.add(id);
    if (!phone) {
      plan.stats.invalidPhones++;
      plan.warnings.push(`Row ${n} (${name}): phone "${rawPhone}" is not a valid number; Riya can't call them.`);
    }

    const sourceStatus = mapGuestStatus(cell(row, mapping.status));
    if (sourceStatus === "skip") { plan.skipped.push({ row: n, reason: "invited only, not registered" }); return; }

    const identity: Record<string, unknown> = { name, phone: phone ?? rawPhone, email: email || null, externalId: ext || null };
    const prev = byId.get(id);
    if (prev) {
      plan.guests.push({ id, isNew: false, data: identity });
      plan.stats.updated++;
      return;
    }

    let status: Status;
    if (sourceStatus) status = sourceStatus;
    else status = held < event.capacity ? "registered" : "waitlist";
    if (status === "registered") {
      held++;
      if (held > event.capacity && sourceStatus) {
        plan.warnings.push(`Row ${n} (${name}) is registered at the source but the event is over its capacity of ${event.capacity}.`);
      }
    }
    const data: Record<string, unknown> = {
      ...identity,
      eventId: event.id,
      status,
      waitlistRank: status === "waitlist" ? ++rank : null,
      teamName: null, teamSize: null, foodPref: null, tshirtSize: null, callbackTime: null, language: null,
      notes: [],
      source: "import",
    };
    for (const [col, field, docField] of OPTIONAL) {
      const v = cell(row, mapping[col] as string | undefined);
      if (!v) continue;
      const r = normalise(field, v, event.maxTeamSize);
      if (r.ok) data[docField] = r.value;
      else plan.warnings.push(`Row ${n} (${name}): ignored ${col} "${v}" (${r.message})`);
    }
    plan.guests.push({ id, isNew: true, data });
    plan.stats.created++;
    if (status === "waitlist") plan.stats.waitlisted++; else if (status === "registered") plan.stats.registered++;
  });
  plan.stats.skipped = plan.skipped.length;
  return plan;
}

export async function runImport(eventId: string, rows: Row[], mapping: ColumnMapping, dryRun: boolean) {
  const db = firestore();
  const evSnap = await refs.event(eventId).get();
  if (!evSnap.exists) throw new Error(`Event ${eventId} does not exist.`);
  const event = eventFrom(evSnap);
  const existing = (await db.collection(COL.registrants).where("eventId", "==", eventId).get()).docs.map(registrantFrom);
  const plan = planImport(event, rows, mapping, existing);

  if (!dryRun) {
    const now = FieldValue.serverTimestamp();
    for (let i = 0; i < plan.guests.length; i += 400) {
      const batch = db.batch();
      for (const g of plan.guests.slice(i, i + 400)) {
        batch.set(refs.registrant(g.id), { ...g.data, ...(g.isNew ? { createdAt: now } : {}), updatedAt: now }, { merge: true });
      }
      await batch.commit();
    }
    await recountSeats(event);
  }
  return { eventId, dryRun, ...plan.stats, skipped: plan.skipped, warnings: plan.warnings.slice(0, 100) };
}

/** Recompute the seats summary from registrants (source of truth). */
export async function recountSeats(event: EventInfo) {
  const snap = await firestore().collection(COL.registrants).where("eventId", "==", event.id).get();
  const regs = snap.docs.map(registrantFrom);
  const held = regs.filter((r) => !["waitlist", "cancelled", "declined"].includes(r.status)).length;
  await refs.seats(event.id).set({
    eventId: event.id,
    capacity: event.capacity,
    held,
    waitlisted: regs.filter((r) => r.status === "waitlist").length,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return held;
}
