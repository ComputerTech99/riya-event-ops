import { FieldValue } from "firebase-admin/firestore";
import { COL } from "./config";
import { firestore } from "./db";
import { normaliseId, type Status } from "./logic";
import { toE164 } from "./bolna";

/** Payload accepted by the adminSeed function (sent by scripts/seed.ts). */
export interface SeedPayload {
  events?: Array<{
    id: string; name: string; date: string; venue: string; capacity: number;
    maxTeamSize?: number; enabled?: boolean; timezone?: string; startAt?: string | null;
  }>;
  registrants?: Array<{
    id: string; eventId: string; name: string; phone: string; status?: Status;
    teamName?: string; teamSize?: number; foodPref?: string; tshirtSize?: string;
    waitlistRank?: number; callbackTime?: string; notes?: string; language?: string;
  }>;
  promptEngine?: Array<{ id: string; [k: string]: unknown }>;
}

/** Documents that describe the shape of collections the backend writes at runtime. */
const SCHEMA_DOCS: Record<string, Record<string, unknown>> = {
  [COL.calls]: {
    _schema: true,
    description: "One doc per Bolna execution id, written by bolnaWebhook (and releaseSeat when it queues a call).",
    fields: ["executionId", "registrantId", "eventId", "agentId", "status", "terminationReason", "hangupBy", "durationSec",
      "transcript", "summary", "extractedData", "recordingUrl", "userNumber", "statusHistory", "trigger", "rawJson"],
  },
  [COL.feedback]: {
    _schema: true,
    description: "Written by bolnaWebhook when a call's extracted data contains feedback or caller questions.",
    fields: ["executionId", "registrantId", "eventId", "feedback", "callerQuestions", "createdAt"],
  },
};

export async function runSeed(p: SeedPayload) {
  const db = firestore();
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  const counts = { events: 0, registrants: 0, promptEngine: 0, seats: 0, invalidPhones: [] as string[] };

  for (const e of p.events ?? []) {
    batch.set(db.collection(COL.events).doc(e.id), {
      name: e.name, date: e.date, venue: e.venue, capacity: e.capacity, maxTeamSize: e.maxTeamSize ?? 4,
      enabled: e.enabled ?? false, timezone: e.timezone ?? "Asia/Kolkata", startAt: e.startAt ?? null, updatedAt: now,
    }, { merge: true });
    counts.events++;
  }

  const held: Record<string, number> = {};
  for (const r of p.registrants ?? []) {
    const id = normaliseId(r.id);
    const status: Status = r.status ?? "registered";
    const phone = toE164(r.phone ?? "");
    if (!phone) counts.invalidPhones.push(id);
    batch.set(db.collection(COL.registrants).doc(id), {
      eventId: r.eventId,
      name: r.name,
      phone: phone ?? r.phone ?? "",
      status,
      teamName: r.teamName ?? null,
      teamSize: r.teamSize ?? null,
      foodPref: r.foodPref ?? null,
      tshirtSize: r.tshirtSize ?? null,
      waitlistRank: status === "waitlist" ? r.waitlistRank ?? null : null,
      callbackTime: r.callbackTime ?? null,
      language: r.language ?? null,
      notes: r.notes ? [{ at: new Date().toISOString(), text: r.notes }] : [],
      createdAt: now,
      updatedAt: now,
    });
    if (!["waitlist", "cancelled", "declined"].includes(status)) held[r.eventId] = (held[r.eventId] ?? 0) + 1;
    counts.registrants++;
  }

  for (const e of p.events ?? []) {
    batch.set(db.collection(COL.seats).doc(e.id), {
      eventId: e.id, capacity: e.capacity, held: held[e.id] ?? 0, released: 0, promotions: 0, updatedAt: now,
    });
    counts.seats++;
  }

  for (const doc of p.promptEngine ?? []) {
    const { id, ...rest } = doc;
    batch.set(db.collection(COL.promptEngine).doc(id), { ...rest, updatedAt: now }, { merge: true });
    counts.promptEngine++;
  }

  for (const [col, data] of Object.entries(SCHEMA_DOCS)) {
    batch.set(db.collection(col).doc("_schema"), data);
  }

  const eventIds = (p.events ?? []).map((e) => e.id);
  if (eventIds.length) {
    const qSnap = await db.collection(COL.callQueue).where("eventId", "in", eventIds).get();
    qSnap.docs.forEach((d) => batch.delete(d.ref));
  }

  await batch.commit();
  return counts;
}
