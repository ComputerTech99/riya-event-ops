/**
 * End-to-end check of the Firestore transactions against the emulator:
 *   firebase emulators:exec --only firestore --project demo-riya "npx tsx test/integration.emulator.ts"
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runSeed } from "../src/seed";
import * as reg from "../src/registrants";
import { saveExecution } from "../src/webhook";
import { firestore, refs } from "../src/db";
import type { DialerDeps } from "../src/queue";
import { dispatch, launchEvent, onCallStatus, queueStats } from "../src/queue";
import { upsertEvent } from "../src/events";
import { runImport, PRESETS } from "../src/importer";
import { parseCsv } from "../src/csv";

const seedDir = join(__dirname, "..", "seed");
// Fake Bolna: records calls and how many are live at once. Never dials anyone.
const placed: { to: string; vars: Record<string, string> }[] = [];
let live = 0;
let maxLive = 0;
let seq = 0;
const deps: DialerDeps = {
  apiKey: "test", agentId: "agent-test", fromNumber: "", maxConcurrent: 2,
  window: { startHour: 0, endHour: 24, timezone: "Asia/Kolkata" },
  placeCall: async (input) => {
    placed.push({ to: input.to, vars: input.userData });
    live++; maxLive = Math.max(maxLive, live);
    return { executionId: `exec-${++seq}`, status: "queued" };
  },
};
/** Simulate Bolna finishing a call: webhook terminal status frees the slot, then the dialer refills. */
async function finishCall(executionId: string) {
  live--;
  assert.equal(await onCallStatus(executionId, "completed"), true);
  await dispatch(deps);
}

async function main() {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "run under the Firestore emulator");
  const registrants = JSON.parse(readFileSync(join(seedDir, "registrants.json"), "utf8"));
  registrants.find((r: { id: string }) => r.id === "R005").phone = "98765 43210"; // valid, to exercise E.164 path
  const counts = await runSeed({
    events: JSON.parse(readFileSync(join(seedDir, "events.json"), "utf8")),
    registrants,
    promptEngine: [{ id: "riya", version: 1, systemPrompt: "x" }],
  });
  assert.equal(counts.registrants, 7);
  assert.equal((await refs.seats("HACK2026").get()).get("held"), 4);

  // lookup
  const l = await reg.lookupRegistrant("r002");
  assert.equal(l.ok, true);
  assert.deepEqual(l.already_known, ["team_name", "food_pref"]);
  assert.equal((l.registrant as Record<string, unknown>).phone, undefined, "phone never sent to agent");
  assert.equal((await reg.lookupRegistrant("NOPE")).ok, false);

  // update
  assert.equal((await reg.updateRegistrant("R001", "team_size", "5")).ok, false);
  assert.equal((await reg.updateRegistrant("R001", "team_size", "three")).saved, 3);
  assert.equal((await reg.updateRegistrant("R001", "food_pref", "Non Veg")).saved, "non-veg");
  assert.equal((await reg.updateRegistrant("R001", "status", "yes")).saved, "confirmed");
  await reg.updateRegistrant("R001", "notes", "Needs a wheelchair ramp");
  await reg.updateRegistrant("R001", "notes", "Prefers WhatsApp");
  const r1 = (await refs.registrant("R001").get()).data()!;
  assert.equal(r1.teamSize, 3);
  assert.equal(r1.notes.length, 2);
  assert.equal((await reg.updateRegistrant("R001", "shoe_size", "9")).ok, false);

  // release → R005 (rank 1) promoted, R006/R007 renumbered 1/2
  const rel = await reg.releaseSeat("R001", "exams", deps);
  assert.equal(rel.ok, true);
  assert.deepEqual(rel.promoted, { name: "Vihaan Gupta" });
  assert.equal(rel.next_person_call_queued, true);
  assert.equal(placed.at(-1)!.vars.registrant_id, "R005", "promotion call dialled via the queue");
  assert.equal(placed.at(-1)!.vars.event_date, "Sunday, 13 December 2026", "variables derived from the event");
  const after = async (id: string) => (await refs.registrant(id).get()).data()!;
  assert.equal((await after("R001")).status, "cancelled");
  assert.equal((await after("R005")).status, "registered");
  assert.equal((await after("R005")).phone, "+919876543210");
  assert.match((await after("R005")).notes.at(-1).text, /Promotion call placed \(exec-1\)/);
  await finishCall("exec-1");
  assert.equal((await after("R006")).waitlistRank, 1);
  assert.equal((await after("R007")).waitlistRank, 2);
  const seats = (await refs.seats("HACK2026").get()).data()!;
  assert.deepEqual([seats.held, seats.released, seats.promotions], [4, 1, 1]);

  // idempotent
  assert.equal((await reg.releaseSeat("R001", "again", deps)).message, "Seat was already released.");
  // changes mind after release → back of waitlist, not overbooked
  const back = await reg.updateRegistrant("R001", "status", "confirmed");
  assert.equal(back.saved, "waitlist");
  assert.equal((await after("R001")).waitlistRank, 3);

  // waitlisted person leaving: no promotion, renumber
  const w = await reg.releaseSeat("R006", "not given", deps);
  assert.equal(w.message, "Removed from the waitlist.");
  assert.equal((await after("R007")).waitlistRank, 1);
  assert.equal((await after("R001")).waitlistRank, 2);

  // webhook: out-of-order deliveries, registrant link, feedback
  await saveExecution({ id: "ex1", status: "completed", updated_at: "2026-11-15T10:05:00Z", conversation_duration: 95,
    transcript: "assistant: Hi\nuser: hello", termination_reason: "hangup",
    extracted_data: { food_pref: "veg", caller_questions: ["Is parking available?"], feedback: null },
    context_details: { recipient_data: { registrant_id: "R003" } } });
  await saveExecution({ id: "ex1", status: "in-progress", updated_at: "2026-11-15T10:00:00Z",
    context_details: { recipient_data: { registrant_id: "R003" } } });
  const call = (await refs.call("ex1").get()).data()!;
  assert.equal(call.status, "completed", "stale delivery must not overwrite");
  assert.equal(call.statusHistory.length, 2);
  assert.equal(call.durationSec, 95);
  assert.equal(call.registrantId, "R003");
  assert.equal(call.eventId, "HACK2026");
  assert.equal((await after("R003")).lastCall.status, "completed");
  const fb = (await refs.feedback("ex1").get()).data()!;
  assert.deepEqual(fb.callerQuestions, ["Is parking available?"]);

  // webhook matched by phone when no registrant_id
  await saveExecution({ id: "ex2", status: "no-answer", user_number: "+919876543210", telephony_data: { duration: "0", hangup_reason: "no-answer" } });
  const c2 = (await refs.call("ex2").get()).data()!;
  assert.equal(c2.registrantId, "R005");
  assert.equal(c2.terminationReason, "no-answer");
  assert.equal(c2.durationSec, 0);

  // ---------------------------------------------------------------- multi-event: event, import, launch
  await assert.rejects(upsertEvent({ eventId: "BAD EVENT", event: {} }), /eventId must be/);
  await assert.rejects(upsertEvent({ eventId: "DEVFEST", event: { name: "DevFest" } }), /date is required/);
  const ev = await upsertEvent({ eventId: "devfest", event: {
    name: "DevFest Bengaluru 2026", date: "2026-12-20", venue: "NIMHANS Convention Centre", capacity: 3,
  } });
  assert.equal(ev.eventId, "DEVFEST");
  assert.equal(ev.event.enabled, false, "new events start disabled");
  assert.equal(ev.event.spokenDate, "Sunday, 20 December 2026");

  const csv = [
    "name,phone_number,email,approval_status,api_id",
    "Guest One,98765 00001,g1@x.com,approved,gst-1",
    "Guest Two,98765 00002,g2@x.com,approved,gst-2",
    "Guest Three,98765 00003,g3@x.com,,gst-3",
    "Guest Four,98765 00004,g4@x.com,,gst-4",
    "Guest Five,98765 00005,g5@x.com,,gst-5",
    "Bad Phone,12,g6@x.com,approved,gst-6",
  ].join("\n");
  const dry = await runImport("DEVFEST", parseCsv(csv), PRESETS.luma, true);
  assert.equal(dry.created, 6);
  assert.equal((await firestore().collection("registrants").where("eventId", "==", "DEVFEST").get()).size, 0, "dry run writes nothing");
  const imp = await runImport("DEVFEST", parseCsv(csv), PRESETS.luma, false);
  // capacity 3: two approved + Guest Three registered, Four/Five waitlisted; Bad Phone approved at source (over capacity, warned)
  assert.deepEqual([imp.registered, imp.waitlisted, imp.invalidPhones], [4, 2, 1]);
  const again = await runImport("DEVFEST", parseCsv(csv), PRESETS.luma, false);
  assert.deepEqual([again.created, again.updated], [0, 6], "re-import is idempotent");

  await assert.rejects(launchEvent("DEVFEST", {}, deps), /disabled/);
  await upsertEvent({ eventId: "DEVFEST", event: { enabled: true } });
  const dryLaunch = await launchEvent("DEVFEST", { dryRun: true }, deps);
  assert.deepEqual([dryLaunch.eligible, dryLaunch.callable], [4, 3]);
  assert.equal((dryLaunch.sampleVariables as Record<string, string>).event_name, "DevFest Bengaluru 2026");

  const before = placed.length;
  live = 0; maxLive = 0;
  const launched = (await launchEvent("DEVFEST", {}, deps)) as Record<string, unknown>;
  assert.equal(launched.queued, 3);
  assert.equal(launched.dialledNow, 2, "only two calls start");
  assert.deepEqual(await queueStats("DEVFEST"), { active: 2, pending: 1 });
  const again2 = (await launchEvent("DEVFEST", {}, deps)) as Record<string, unknown>;
  assert.equal(again2.queued, 0, "launch is idempotent while calls are queued");

  // A waitlist promotion jumps ahead of the remaining launch call.
  const firstTwo = placed.slice(before).map((p) => p.vars.name);
  const pendingName = ["Guest One", "Guest Two", "Guest Three"].find((n) => !firstTwo.includes(n))!;
  const devGuests = (await firestore().collection("registrants").where("eventId", "==", "DEVFEST").get()).docs;
  const releaser = devGuests.find((d) => d.get("name") === firstTwo[0])!.id;
  await reg.releaseSeat(releaser, "exam", deps); // promotes Guest Four; both lines busy, so nothing dials yet
  assert.equal(live, 2);
  assert.equal(placed.length, before + 2);
  await finishCall(`exec-${before + 1}`);
  assert.equal(placed.at(-1)!.vars.name, "Guest Four", "promotion dialled before the pending launch call");
  await finishCall(`exec-${before + 2}`);
  assert.equal(placed.at(-1)!.vars.name, pendingName, "then the remaining launch call");
  await finishCall(`exec-${before + 3}`);
  await finishCall(`exec-${before + 4}`);
  assert.equal(maxLive, 2, "never more than two calls at once");
  assert.deepEqual(await queueStats("DEVFEST"), { done: 4 });
  assert.equal(placed.filter((p) => p.vars.event_name === "DevFest Bengaluru 2026").length, 4);

  // Disabling an event pauses its queue: pending items stay pending.
  await upsertEvent({ eventId: "DEVFEST", event: { enabled: false } });
  await assert.rejects(launchEvent("DEVFEST", { force: true }, deps), /disabled/);

  // all collections exist
  const cols = (await firestore().listCollections()).map((c) => c.id).sort();
  assert.deepEqual(cols, ["callQueue", "calls", "events", "feedback", "promptEngine", "registrants", "seats"]);
  console.log("INTEGRATION OK");
}

main().catch((e) => { console.error(e); process.exit(1); });
