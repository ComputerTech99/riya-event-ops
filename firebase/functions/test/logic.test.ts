import { test } from "node:test";
import assert from "node:assert/strict";
import { nextWaitlistRank, normalise, planRelease, summarise, type Registrant } from "../src/logic";
import { toE164 } from "../src/bolna";
import { mapExecution } from "../src/webhook";
import { safeEqual } from "../src/http";

const reg = (o: Partial<Registrant>): Registrant => ({
  id: "R001", eventId: "E1", name: "Aman", phone: "+919000000001", status: "registered",
  teamName: null, teamSize: null, foodPref: null, tshirtSize: null, notes: [], waitlistRank: null, callbackTime: null,
  language: null, ...o,
});

test("normalise: spoken answers", () => {
  assert.deepEqual(normalise("food_pref", "Non Veg"), { ok: true, value: "non-veg" });
  assert.deepEqual(normalise("food_pref", "vegetarian"), { ok: true, value: "veg" });
  assert.deepEqual(normalise("food_pref", "Jain"), { ok: true, value: "jain" });
  assert.equal(normalise("food_pref", "vegan").ok, false);
  assert.deepEqual(normalise("tshirt_size", "xl"), { ok: true, value: "XL" });
  assert.deepEqual(normalise("tshirt_size", "medium"), { ok: true, value: "M" });
  assert.deepEqual(normalise("tshirt_size", "2XL"), { ok: true, value: "XXL" });
  assert.deepEqual(normalise("team_size", "three"), { ok: true, value: 3 });
  assert.deepEqual(normalise("team_size", "solo"), { ok: true, value: 1 });
  assert.deepEqual(normalise("status", "yes"), { ok: true, value: "confirmed" });
  assert.deepEqual(normalise("status", "no"), { ok: true, value: "declined" });
  assert.equal(normalise("status", "waitlist").ok, false);
  assert.equal(normalise("team_name", "  ").ok, false);
});

test("normalise: Kannada answers", () => {
  assert.deepEqual(normalise("status", "ಹೌದು"), { ok: true, value: "confirmed" });
  assert.deepEqual(normalise("status", "ಇಲ್ಲ"), { ok: true, value: "declined" });
  assert.deepEqual(normalise("food_pref", "ಸಸ್ಯಾಹಾರ"), { ok: true, value: "veg" });
  assert.deepEqual(normalise("food_pref", "ಮಾಂಸಾಹಾರ"), { ok: true, value: "non-veg" });
  assert.deepEqual(normalise("team_size", "ಮೂರು"), { ok: true, value: 3 });
  assert.equal(normalise("team_size", "ಐದು").ok, false);
  assert.deepEqual(normalise("language", "ಕನ್ನಡ"), { ok: true, value: "kannada" });
  assert.deepEqual(normalise("language", "English"), { ok: true, value: "english" });
  assert.equal(normalise("language", "tamil").ok, false);
});

test("normalise: team size limit", () => {
  const r = normalise("team_size", "5");
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /at most 4/);
  assert.equal(normalise("team_size", "5", 6).ok, true);
});

test("summarise: skips what is known", () => {
  const s = summarise(reg({ teamName: "Byte", foodPref: "veg" }));
  assert.deepEqual(s.already_known, ["team_name", "food_pref"]);
  assert.deepEqual(s.still_needed, ["status", "team_size", "tshirt_size"]);
  assert.deepEqual(summarise(reg({ status: "confirmed", teamSize: 2 })).already_known, ["status", "team_size"]);
  assert.match(summarise(reg({ status: "waitlist", waitlistRank: 2 })).note, /rank 2/);
});

test("planRelease: promotes lowest rank and renumbers", () => {
  const wl = [reg({ id: "B", status: "waitlist", waitlistRank: 2 }), reg({ id: "C", status: "waitlist", waitlistRank: 1 }),
    reg({ id: "D", status: "waitlist", waitlistRank: 5 })];
  const p = planRelease(reg({ id: "A", status: "confirmed" }), wl);
  assert.equal(p.promotedId, "C");
  assert.deepEqual(p.renumber, [{ id: "B", rank: 1 }, { id: "D", rank: 2 }]);
});

test("planRelease: waitlisted person leaving frees no seat", () => {
  const me = reg({ id: "B", status: "waitlist", waitlistRank: 1 });
  const p = planRelease(me, [me, reg({ id: "C", status: "waitlist", waitlistRank: 2 })]);
  assert.equal(p.promotedId, null);
  assert.equal(p.wasWaitlisted, true);
  assert.deepEqual(p.renumber, [{ id: "C", rank: 1 }]);
});

test("planRelease: idempotent and empty waitlist", () => {
  assert.equal(planRelease(reg({ status: "cancelled" }), []).alreadyCancelled, true);
  assert.equal(planRelease(reg({}), []).promotedId, null);
  assert.equal(nextWaitlistRank([reg({ waitlistRank: 3 }), reg({ waitlistRank: null })]), 4);
});

test("toE164", () => {
  assert.equal(toE164("98765 43210"), "+919876543210");
  assert.equal(toE164("+91-98765-43210"), "+919876543210");
  assert.equal(toE164("09876543210"), "+919876543210");
  assert.equal(toE164("+91XXXXXXXXXX"), null);
  assert.equal(toE164(""), null);
});

test("mapExecution: Bolna payload → Calls doc", () => {
  const m = mapExecution({
    id: "exec-1", agent_id: "ag", status: "completed", termination_reason: "inactivity_timeout",
    conversation_duration: 28, transcript: "assistant: hi", extracted_data: '{"food_pref":"veg"}',
    updated_at: "2026-09-04T08:52:59+00:00", user_number: "+919876543210",
    telephony_data: { duration: "30", hangup_by: "Caller", recording_url: "https://r" },
    context_details: { recipient_data: { registrant_id: "r001" } },
    tool_call_logs: [[1, 2]],
  });
  assert.equal(m.executionId, "exec-1");
  assert.equal(m.terminationReason, "inactivity_timeout");
  assert.equal(m.durationSec, 28);
  assert.deepEqual(m.extractedData, { food_pref: "veg" });
  assert.equal(m.recipientRegistrantId, "R001");
  assert.equal(m.hangupBy, "Caller");
  assert.ok(!m.rawJson.includes("assistant: hi"));
  // falls back to telephony data
  const m2 = mapExecution({ id: "x", telephony_data: { duration: "12", hangup_reason: "busy" } });
  assert.equal(m2.durationSec, 12);
  assert.equal(m2.terminationReason, "busy");
});

test("safeEqual", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
});
