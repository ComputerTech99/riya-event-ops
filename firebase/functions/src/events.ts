/** Create or update an event, optionally from a public Luma link. */
import { FieldValue } from "firebase-admin/firestore";
import { eventFrom, refs } from "./db";
import { fetchLumaEvent, type LumaEvent } from "./luma";
import { DEFAULT_MAX_TEAM_SIZE, spokenDate, type EventInfo } from "./logic";
import { recountSeats } from "./importer";

export interface EventInput {
  name?: string;
  date?: string;
  startAt?: string | null;
  timezone?: string;
  venue?: string;
  capacity?: number;
  maxTeamSize?: number;
  enabled?: boolean;
}

const ID_RE = /^[A-Z0-9][A-Z0-9_-]{1,40}$/;

export function normaliseEventId(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

export async function upsertEvent(opts: { eventId?: string; lumaUrl?: string; event?: EventInput; dryRun?: boolean }) {
  let luma: LumaEvent | null = null;
  if (opts.lumaUrl) luma = await fetchLumaEvent(opts.lumaUrl);

  const eventId = normaliseEventId(opts.eventId || (luma ? `LUMA-${luma.slug}` : ""));
  if (!ID_RE.test(eventId)) throw new Error("eventId must be 2-41 letters, digits, - or _ (or pass a Luma link).");

  const ref = refs.event(eventId);
  const snap = await ref.get();
  const prev = snap.exists ? eventFrom(snap) : null;
  const input = opts.event ?? {};

  const merged: EventInfo = {
    id: eventId,
    name: input.name ?? prev?.name ?? luma?.name ?? "",
    date: input.date ?? prev?.date ?? luma?.date ?? "",
    startAt: input.startAt !== undefined ? input.startAt : prev?.startAt ?? luma?.startAt ?? null,
    timezone: input.timezone ?? prev?.timezone ?? luma?.timezone ?? "Asia/Kolkata",
    venue: input.venue ?? prev?.venue ?? luma?.venue ?? "",
    fullAddress: prev?.fullAddress ?? luma?.fullAddress ?? null,
    capacity: Number(input.capacity ?? prev?.capacity ?? luma?.capacityEstimate ?? 0),
    maxTeamSize: Number(input.maxTeamSize ?? prev?.maxTeamSize ?? DEFAULT_MAX_TEAM_SIZE),
    // New events start disabled so nothing is called by accident.
    enabled: input.enabled ?? prev?.enabled ?? false,
  };

  const problems: string[] = [];
  if (!merged.name) problems.push("name is required");
  if (!merged.date) problems.push("date is required (YYYY-MM-DD)");
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(merged.date)) problems.push("date must be YYYY-MM-DD");
  if (!merged.venue) problems.push("venue is required");
  if (!Number.isInteger(merged.capacity) || merged.capacity < 1) problems.push("capacity must be a positive whole number");
  if (!Number.isInteger(merged.maxTeamSize) || merged.maxTeamSize < 1) problems.push("maxTeamSize must be a positive whole number");
  if (problems.length) throw new Error(`Event ${eventId}: ${problems.join("; ")}.`);

  const capacityNote = luma && input.capacity === undefined && !prev
    ? `Capacity ${merged.capacity} was estimated from Luma's spots remaining; pass capacity to set it exactly.`
    : null;

  if (!opts.dryRun) {
    const { id: _id, ...fields } = merged;
    await ref.set({
      ...fields,
      ...(luma ? { source: { type: "luma", url: luma.url, lumaId: luma.lumaId, waitlistEnabled: luma.waitlistEnabled } } : {}),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await recountSeats(merged);
  }

  return {
    eventId,
    created: !snap.exists,
    event: { ...merged, spokenDate: spokenDate(merged) },
    notes: capacityNote ? [capacityNote] : [],
  };
}
