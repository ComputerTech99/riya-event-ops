# Riya backend (Firebase)

Project `riya-event-ops-485f` · Cloud Functions 2nd gen · Node 22 · `asia-south1` · TypeScript.
Bolna agent **Riya**: `39099f1d-2f02-4586-b51d-5bc9f3884842`.

Base URL: `https://asia-south1-riya-event-ops-485f.cloudfunctions.net`

| Function | Used by | Auth |
|---|---|---|
| `lookupRegistrant` `{registrant_id}` | Riya tool `lookup_registrant` | `Authorization: Bearer $TOOL_TOKEN` |
| `updateRegistrant` `{registrant_id, field, value}` | Riya tool `update_registrant` | same |
| `releaseSeat` `{registrant_id, reason}` | Riya tool `release_seat`; promotes waitlist #1 and places a Bolna call to them | same |
| `bolnaWebhook` | Bolna agent webhook → `calls` (+ `feedback`); frees a dialer slot when a call ends | `?token=$WEBHOOK_TOKEN` or `x-webhook-token` header |
| `upsertEvent` `{eventId?, lumaUrl?, event?}` | Create/update an event (from a public Luma link or by hand) | `Authorization: Bearer $ADMIN_TOKEN` |
| `importGuests` `{eventId, csv\|rows, mapping, lumaUrl?, event?, dryRun?}` | Generic guest importer (column mapping; preset `luma`) | admin |
| `launchEvent` `{eventId, statuses?, dryRun?, force?}` | Queue a Riya call to every registered guest | admin |
| `dialerStatus` `{eventId?}` | Queue counts | admin |
| `dialerTick` | Every minute: recover stuck slots, keep dialling | scheduler |
| `adminSeed` | `npm run seed` | admin |

## Multiple events

Each `events/{eventId}` holds `name` (full name), `date` (YYYY-MM-DD), `startAt?`, `timezone`, `venue` (short, speakable), `fullAddress?`,
`capacity`, `maxTeamSize`, `enabled`. Riya's call variables are derived from it: `event_name` = name, `event_date` = spoken date
("Sunday, 13 December 2026"), `venue`. New events start **disabled**; launch and the dialer only call guests of enabled events
(disabling pauses that event's queue).

**Luma:** public pages give name, start time, timezone and address, but not the guest list or total capacity. Capacity is
estimated from "spots remaining" unless you pass it. Guests come from the host's Luma CSV export ("Download as CSV"),
mapped with the `luma` preset (`name`, `phone_number`, `email`, `approval_status`, `api_id`). Approved guests become registered,
pending or waitlist guests go to the waitlist, declined guests become declined, and invited-only guests are skipped.
Rows without a status fill the remaining capacity first, then the waitlist.

**Custom mapping** (`--map mapping.json`): `{"name": "Full Name" | ["First","Last"], "phone": "Mobile", "email"?, "status"?,
"externalId"?, "teamName"?, "teamSize"?, "foodPref"?, "tshirtSize"?, "language"?}`. Guest IDs are stable (`EVENTID-<hash>` of
id, email or phone), so re-imports update identity fields only and never reset answers or statuses.

**Dialer:** every outbound call (launch and waitlist promotion) goes through `callQueue`. There are at most `MAX_CONCURRENT_CALLS`
(2, the Bolna limit) calls in flight, and calls are placed only inside `CALL_START_HOUR`–`CALL_END_HOUR` (10–20 IST). Promotions
jump ahead of launch calls. Retryable Bolna errors (429/5xx) back off 2 minutes, up to 3 attempts.

```
npm run event  -- --luma https://lu.ma/abc123 --capacity 120 [--venue "Short venue"] [--enable]
npm run event  -- --id DEVFEST --name "DevFest Bengaluru" --date 2026-12-20 --venue "NIMHANS" --capacity 300
npm run import -- --event LUMA-ABC123 --csv guests.csv [--map luma|mapping.json] [--dry-run]
npm run event  -- --id LUMA-ABC123 --enable
npm run launch -- --event LUMA-ABC123 --dry-run      # check counts and sample variables first
npm run launch -- --event LUMA-ABC123
npm run dialer -- --event LUMA-ABC123
```

## Firestore collections

- `events/{eventId}`: name, date, startAt, timezone, venue, fullAddress, capacity, maxTeamSize, enabled, source
- `seats/{eventId}`: capacity, held, released, promotions
- `registrants/{ID}`: eventId, name, phone (E.164), status, teamName, teamSize, foodPref, tshirtSize, notes[], waitlistRank, callbackTime, lastCall
- `calls/{executionId}`: status, terminationReason, hangupBy, durationSec, transcript, extractedData, summary, recordingUrl, statusHistory[], registrantId, trigger, rawJson
- `feedback/{executionId}`: feedback and callerQuestions from the call's extracted data
- `callQueue/{id}`: dialer items (pending → dialing → active → done | failed | skipped | timeout)
- `promptEngine/riya`: system prompt, welcome message, extraction prompt (source in `prompt/`)

Statuses: `registered`, `confirmed`, `maybe`, `declined`, `waitlist`, `cancelled`.

## Secrets (Secret Manager, `defineSecret`)

`BOLNA_API_KEY`, `TOOL_TOKEN`, `WEBHOOK_TOKEN`, `ADMIN_TOKEN`. Local copies of the three generated tokens are in `.secrets.local` (gitignored, mode 600).
Non-secret params are in `functions/.env.riya-event-ops-485f`: `BOLNA_AGENT_ID` and optional `BOLNA_FROM_NUMBER`.

To rotate a secret: `firebase functions:secrets:set NAME`, then `firebase deploy --only functions` (functions read the version that was live at deploy time).

## Everyday commands (from `functions/`)

```
npm test                 # unit tests
npm run test:emulator    # transaction tests against the Firestore emulator (needs Java)
npm run deploy           # functions + rules
ADMIN_TOKEN=... npm run seed -- https://asia-south1-riya-event-ops-485f.cloudfunctions.net/adminSeed
```

Seeding overwrites the registrants in `seed/registrants.json`. Phones `+91XXXXXXXXXX` are placeholders: `releaseSeat` skips the auto-call and adds a note saying why.
