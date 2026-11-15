import { FieldValue } from "firebase-admin/firestore";
import { eventFrom, firestore, refs, registrantFrom } from "./db";
import { dispatch, enqueue, type DialerDeps } from "./queue";
import {
  agentView, FIELD_TO_DOC, spokenDate, isAgentField, nextWaitlistRank, normalise, normaliseId, planRelease, summarise,
  type Note, type Registrant,
} from "./logic";

type Reply = Record<string, unknown> & { ok: boolean };

const NOT_FOUND: Reply = { ok: false, message: "No registrant found with that ID. Continue the call and collect every answer." };

const note = (text: string): Note => ({ at: new Date().toISOString(), text });

// ------------------------------------------------------------------ lookup

export async function lookupRegistrant(rawId: unknown): Promise<Reply> {
  const id = normaliseId(rawId);
  if (!id) return NOT_FOUND;
  const snap = await refs.registrant(id).get();
  if (!snap.exists) return NOT_FOUND;
  const reg = registrantFrom(snap);
  const ev = await refs.event(reg.eventId).get();
  const event = ev.exists ? eventFrom(ev) : null;
  return {
    ok: true,
    registrant: agentView(reg),
    event: event ? { name: event.name, date: spokenDate(event), venue: event.venue } : null,
    ...summarise(reg),
  };
}

// ------------------------------------------------------------------ update

export async function updateRegistrant(rawId: unknown, rawField: unknown, rawValue: unknown): Promise<Reply> {
  const id = normaliseId(rawId);
  const field = String(rawField ?? "").trim().toLowerCase();
  if (!isAgentField(field)) {
    return { ok: false, message: `Unknown field. Use one of: ${Object.keys(FIELD_TO_DOC).join(", ")}.` };
  }
  if (!id) return NOT_FOUND;

  return firestore().runTransaction(async (tx): Promise<Reply> => {
    const ref = refs.registrant(id);
    const snap = await tx.get(ref);
    if (!snap.exists) return NOT_FOUND;
    const reg = registrantFrom(snap);
    const evSnap = await tx.get(refs.event(reg.eventId));
    const maxTeamSize = evSnap.exists ? eventFrom(evSnap).maxTeamSize : undefined;

    const result = normalise(field, rawValue, maxTeamSize);
    if (!result.ok) return { ok: false, field, message: result.message };

    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    let saved: string | number = result.value;
    let message = "Saved.";

    if (field === "notes") {
      patch.notes = FieldValue.arrayUnion(note(String(saved)));
    } else if (field === "status" && saved === "confirmed" && reg.status === "cancelled") {
      // Their seat already went to someone else: back of the waitlist, don't overbook.
      const waitlist = (await tx.get(refs.waitlist(reg.eventId))).docs.map(registrantFrom);
      const rank = nextWaitlistRank(waitlist);
      saved = "waitlist";
      patch.status = "waitlist";
      patch.waitlistRank = rank;
      patch.notes = FieldValue.arrayUnion(note(`Wanted to attend again after cancelling; re-added to waitlist at rank ${rank}.`));
      message = `Their seat was already released, so they are back on the waitlist at rank ${rank}. ` +
        "Tell them kindly that an organiser will confirm whether a seat opens up.";
    } else {
      patch[FIELD_TO_DOC[field]] = saved;
    }

    tx.update(ref, patch);
    return { ok: true, field, saved: field === "notes" ? result.value : saved, message };
  });
}

// ------------------------------------------------------------------ release

export async function releaseSeat(rawId: unknown, rawReason: unknown, deps: DialerDeps): Promise<Reply> {
  const id = normaliseId(rawId);
  if (!id) return NOT_FOUND;
  const reason = String(rawReason ?? "").trim() || "not given";

  const outcome = await firestore().runTransaction(async (tx) => {
    const ref = refs.registrant(id);
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const target = registrantFrom(snap);
    const waitlist = (await tx.get(refs.waitlist(target.eventId))).docs.map(registrantFrom);

    const plan = planRelease(target, waitlist);
    if (plan.alreadyCancelled) return { target, plan, promoted: null as Registrant | null };

    const now = FieldValue.serverTimestamp();
    tx.update(ref, {
      status: "cancelled",
      waitlistRank: null,
      notes: FieldValue.arrayUnion(note(`Cancelled: ${reason}`)),
      updatedAt: now,
    });

    const promoted = plan.promotedId ? waitlist.find((r) => r.id === plan.promotedId) ?? null : null;
    if (promoted) {
      tx.update(refs.registrant(promoted.id), {
        status: "registered",
        waitlistRank: null,
        notes: FieldValue.arrayUnion(note(`Promoted from waitlist (seat released by ${target.id}).`)),
        updatedAt: now,
      });
    }
    for (const { id: wid, rank } of plan.renumber) {
      tx.update(refs.registrant(wid), { waitlistRank: rank, updatedAt: now });
    }

    if (!plan.wasWaitlisted) {
      tx.set(refs.seats(target.eventId), {
        eventId: target.eventId,
        released: FieldValue.increment(1),
        promotions: FieldValue.increment(promoted ? 1 : 0),
        held: FieldValue.increment(promoted ? 0 : -1),
        updatedAt: now,
      }, { merge: true });
    }
    return { target, plan, promoted };
  });

  if (!outcome) return NOT_FOUND;
  const { plan, promoted } = outcome;
  if (plan.alreadyCancelled) return { ok: true, message: "Seat was already released.", promoted: null };
  if (plan.wasWaitlisted) return { ok: true, message: "Removed from the waitlist.", promoted: null };
  if (!promoted) return { ok: true, message: "Seat released. The waitlist is empty.", promoted: null };

  // The promoted person's call goes through the dialer (ahead of launch calls, within the concurrency limit).
  await enqueue([{ eventId: promoted.eventId, registrantId: promoted.id, reason: "waitlist_promotion", allowedStatuses: ["registered"] }], { force: true });
  await dispatch(deps).catch(() => undefined);
  return {
    ok: true,
    message: "Seat released and given to the next person on the waitlist.",
    promoted: { name: promoted.name },
    next_person_call_queued: true,
  };
}
