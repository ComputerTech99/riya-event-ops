import { test } from "node:test";
import assert from "node:assert/strict";
import { callVariables, spokenDate, type EventInfo, type Registrant } from "../src/logic";
import { parseCsv } from "../src/csv";
import { parseLumaHtml, parseLumaUrl, speakableVenue } from "../src/luma";
import { guestId, mapGuestStatus, planImport, PRESETS } from "../src/importer";
import { isTerminal, pickNext, withinWindow, type QueueItem } from "../src/queue";

const event = (o: Partial<EventInfo> = {}): EventInfo => ({
  id: "E1", name: "Build Out Loud", date: "2026-12-13", startAt: null, timezone: "Asia/Kolkata",
  venue: "Bolna, Bellandur, Bengaluru", fullAddress: null, capacity: 2, maxTeamSize: 4, enabled: true, ...o,
});
const reg = (o: Partial<Registrant>): Registrant => ({
  id: "E1-X", eventId: "E1", name: "A", phone: "+919000000001", status: "registered", teamName: null, teamSize: null,
  foodPref: null, tshirtSize: null, notes: [], waitlistRank: null, callbackTime: null, language: null, ...o,
});

test("spokenDate and callVariables derive from the event", () => {
  assert.equal(spokenDate(event()), "Sunday, 13 December 2026");
  // startAt wins and is read in the event timezone (06:30Z = 12:00 IST same day)
  assert.equal(spokenDate(event({ date: "2026-11-15", startAt: "2026-11-14T20:00:00.000Z" })), "Sunday, 15 November 2026");
  assert.equal(spokenDate(event({ date: "next Friday" })), "next Friday");
  assert.deepEqual(callVariables({ id: "E1-X", name: "Asha" }, event()), {
    name: "Asha", registrant_id: "E1-X", event_name: "Build Out Loud",
    event_date: "Sunday, 13 December 2026", venue: "Bolna, Bellandur, Bengaluru",
  });
});

test("parseCsv: quotes, commas, CRLF, BOM, blank lines", () => {
  const rows = parseCsv('﻿name,phone_number,note\r\n"Rao, Asha",98765 43210,"said ""hi"""\r\n\r\nVik,+91 90000 00002,\n');
  assert.deepEqual(rows, [
    { name: "Rao, Asha", phone_number: "98765 43210", note: 'said "hi"' },
    { name: "Vik", phone_number: "+91 90000 00002", note: "" },
  ]);
});

test("Luma: URL validation, page parsing, speakable venue", () => {
  assert.deepEqual(parseLumaUrl("https://lu.ma/1a2rjj9r?tk=x"), { url: "https://luma.com/1a2rjj9r", slug: "1a2rjj9r" });
  assert.throws(() => parseLumaUrl("https://evil.com/1a2rjj9r"), /lu\.ma/);
  assert.throws(() => parseLumaUrl("http://lu.ma/abc123"));
  const next = {
    props: { pageProps: { initialData: { data: {
      event: {
        api_id: "evt-1", name: "Build Out Loud", start_at: "2026-11-15T06:30:00.000Z", timezone: "Asia/Kolkata", url: "1a2rjj9r",
        geo_address_visibility: "public", location_type: "offline", waitlist_enabled: true,
        geo_address_info: { address: "Bolna : AI Voice Agents | Automated", sublocality: "Bellandur", city: "Bengaluru", full_address: "2nd Floor, Bellandur" },
      },
      ticket_info: { spots_remaining: 53 }, guest_count: 7,
    } } } },
  };
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script></html>`;
  const ev = parseLumaHtml(html, "1a2rjj9r");
  assert.equal(ev.name, "Build Out Loud");
  assert.equal(ev.date, "2026-11-15");
  assert.equal(ev.venue, "Bolna, Bellandur, Bengaluru");
  assert.equal(ev.capacityEstimate, 60);
  assert.equal(ev.fullAddress, "2nd Floor, Bellandur");
  assert.throws(() => parseLumaHtml("<html></html>", "x"), /public Luma event page/);
  assert.equal(speakableVenue({ address: "Secret", city: "Bengaluru" }, "guests-only"), "Bengaluru");
});

test("mapGuestStatus: Luma approval statuses", () => {
  assert.equal(mapGuestStatus("approved"), "registered");
  assert.equal(mapGuestStatus("Pending Approval"), "waitlist");
  assert.equal(mapGuestStatus("waitlist"), "waitlist");
  assert.equal(mapGuestStatus("declined"), "declined");
  assert.equal(mapGuestStatus("invited"), "skip");
  assert.equal(mapGuestStatus(""), null);
});

test("planImport: capacity, waitlist ranks, dedupe, existing guests untouched", () => {
  const rows = [
    { name: "Asha", phone_number: "98765 43210", email: "A@x.com", approval_status: "" },
    { name: "Bo", phone_number: "98765 43211", email: "b@x.com", approval_status: "" },
    { name: "Cy", phone_number: "bad", email: "c@x.com", approval_status: "" },
    { name: "Asha again", phone_number: "98765 43210", email: "a@x.com", approval_status: "" },
    { name: "", phone_number: "98765 43212", email: "d@x.com", approval_status: "" },
    { name: "Inv", phone_number: "98765 43213", email: "e@x.com", approval_status: "invited" },
    { name: "Wl", phone_number: "98765 43214", email: "f@x.com", approval_status: "waitlist" },
  ];
  const existingId = guestId("E1", "b@x.com");
  const existing = [reg({ id: existingId, status: "confirmed", teamName: "Keep" }), reg({ id: "E1-OLD", status: "waitlist", waitlistRank: 4 })];
  const plan = planImport(event({ capacity: 2 }), rows, PRESETS.luma, existing);
  const byName = Object.fromEntries(plan.guests.map((g) => [g.data.name, g]));
  // capacity 2: existing confirmed holds 1, Asha takes the last seat, Cy goes to waitlist after rank 4
  assert.equal(byName["Asha"].data.status, "registered");
  assert.equal(byName["Bo"].isNew, false);
  assert.equal(byName["Bo"].data.status, undefined, "existing guest status untouched");
  assert.equal(byName["Cy"].data.status, "waitlist");
  assert.equal(byName["Cy"].data.waitlistRank, 5);
  assert.equal(byName["Wl"].data.waitlistRank, 6);
  assert.equal(plan.stats.invalidPhones, 1);
  assert.deepEqual(plan.skipped.map((s) => s.reason).sort(), ["duplicate of an earlier row", "invited only, not registered", "missing name"].sort());
  assert.equal(byName["Asha"].id, guestId("E1", "a@x.com"), "id stable across case");
});

test("planImport: custom mapping with joined name and optional answers", () => {
  const plan = planImport(event({ capacity: 10 }), [
    { First: "Asha", Last: "Rao", Mobile: "9876543210", Food: "Non Veg", Size: "xl", Team: "Byte", Members: "5" },
  ], { name: ["First", "Last"], phone: "Mobile", foodPref: "Food", tshirtSize: "Size", teamName: "Team", teamSize: "Members" }, []);
  const g = plan.guests[0].data;
  assert.equal(g.name, "Asha Rao");
  assert.equal(g.foodPref, "non-veg");
  assert.equal(g.tshirtSize, "XL");
  assert.equal(g.teamName, "Byte");
  assert.equal(g.teamSize, null, "5 > max team size is rejected");
  assert.match(plan.warnings.join(" "), /ignored teamSize/);
});

test("dialer helpers", () => {
  const w = { startHour: 10, endHour: 20, timezone: "Asia/Kolkata" };
  assert.equal(withinWindow(new Date("2026-11-15T04:30:00Z"), w), true);   // 10:00 IST
  assert.equal(withinWindow(new Date("2026-11-15T04:29:00Z"), w), false);  // 09:59 IST
  assert.equal(withinWindow(new Date("2026-11-15T14:30:00Z"), w), false);  // 20:00 IST
  assert.equal(isTerminal("completed"), true);
  assert.equal(isTerminal("in-progress"), false);
  const item = (o: Partial<QueueItem>): QueueItem => ({
    id: "q", eventId: "E1", registrantId: "r", reason: "launch", priority: 10, status: "pending",
    attempts: 0, notBeforeMs: 0, createdAtMs: 0, startedAtMs: null, allowedStatuses: ["registered"], ...o,
  });
  const pending = [
    item({ id: "old-launch", createdAtMs: 1 }),
    item({ id: "promo", reason: "waitlist_promotion", priority: 0, createdAtMs: 5 }),
    item({ id: "backoff", priority: 0, createdAtMs: 0, notBeforeMs: 10_000 }),
    item({ id: "disabled", eventId: "E2", priority: 0, createdAtMs: 0 }),
  ];
  assert.equal(pickNext(pending, new Set(["E1"]), 1_000)?.id, "promo");
  assert.equal(pickNext(pending, new Set(["E1"]), 20_000)?.id, "backoff");
  assert.equal(pickNext(pending, new Set([]), 1_000), null);
});
