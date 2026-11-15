# wisper-bolna

Riya: a Bolna voice agent that calls hackathon registrants, with a Firebase backend.

- `firebase/` is the backend (this file's scope). Details in `firebase/README.md`.
- `Ria Control/` is a separate Expo app with its own git repo. `.playwright-mcp/` is browser-tool output. Don't modify either unless asked.

## Key facts

- Firebase project: `riya-event-ops-485f` (Blaze plan). Firestore and all functions are in `asia-south1`.
- Functions: 2nd gen, TypeScript, **Node 22**. Node 20 was requested, but Google decommissioned it on 2026-10-30 and refuses deploys.
  - Stay on `firebase-admin@13`: version 14 needs Node 22+ engines and was pinned down earlier.
- Base URL: `https://asia-south1-riya-event-ops-485f.cloudfunctions.net`. Functions: tools `lookupRegistrant`, `updateRegistrant`, `releaseSeat`; `bolnaWebhook`; admin `upsertEvent`, `importGuests`, `launchEvent`, `dialerStatus`, `adminSeed`; scheduled `dialerTick` (every minute). Admin CLI: `npm run event|import|launch|dialer` (see `firebase/README.md`).
- Bolna agent **Riya**: `39099f1d-2f02-4586-b51d-5bc9f3884842`. It is the only agent on the account.
  - **English-first, Kannada supported** (user decision, 2026-11-15). The greeting asks "English or Kannada?"; English is the default when unclear. Riya switches whenever the caller does. The choice is saved in `registrants.language`.
  - Model `gpt-4.1-mini`. Sarvam STT `saaras:v4` (`kn`, so it understands both languages; English words may arrive in Kannada script, and the prompt handles that). Sarvam TTS `bulbul:v3`, voice Priya (`kn`). Plivo telephony.
  - Hangup by prompt is on. `pre_call_message` is `""` on all tools (omitting it makes Bolna insert a default filler). Calling window 10:00–20:00 (recipient time). Call summaries are on.
  - Tool values are always English; the backend also normalises common Kannada answers.
  - Prompt sources: `firebase/prompt/` (system, welcome, hangup, extraction), mirrored to `promptEngine/riya`.
  - Always place calls with all five variables. Without them, `registrant_id` is wrong and the model invents dates.
  - Prompt variables: `{name}`, `{registrant_id}`, `{event_name}`, `{event_date}`, `{venue}`.
- Collections: `registrants`, `calls`, `seats`, `events`, `feedback`, `promptEngine`, `callQueue`.
- **Multiple events**: Riya's variables are derived from `events/{id}` (name, spoken date, venue). New events start disabled.
- **All outbound calls go through the `callQueue` dialer**: max 2 at once (Bolna limit, `MAX_CONCURRENT_CALLS`), 10–20 IST only, promotions first. Never call `placeCall` directly.
- New HTTPS functions often return Cloud Run 401 HTML after their *first* deploy (public invoker not applied yet). Redeploy them with `--force`.
- Luma public pages give event details only (`__NEXT_DATA__`). Guests come from the host's CSV export.

## Secrets: never hardcode, never print

- Secret Manager (`defineSecret`): `BOLNA_API_KEY` (only version 4 is live), `TOOL_TOKEN`, `WEBHOOK_TOKEN`, `ADMIN_TOKEN`.
- Local copies of the three tokens are in `firebase/.secrets.local` (gitignored, mode 600). Read them only when the user approves.
- After changing a secret, redeploy the functions that use it. They pin the version at deploy time.
- `functions/.env.riya-event-ops-485f` holds `BOLNA_AGENT_ID` and `BOLNA_FROM_NUMBER`. These are not secrets. Deploy needs the file to exist.

## Bolna MCP gotchas

- The claude.ai Bolna connector's `update_agent` **silently ignores `tasks`** (tools, LLM, transcriber).
  - To change those, recreate the agent with `create_agent`, then update `BOLNA_AGENT_ID` and redeploy `releaseSeat`.
  - Also update the webhook URL and delete the old agent.
  - Prompt, welcome message and webhook URL *can* be updated in place.
- `create_agent` accepts `tools_config.api_tools = {tools: [...], tools_params: {name: {method, url, api_token, param}}}`. `param` is a JSON string with `%(name)s` placeholders.
- The connector cannot place calls or manage phone numbers. Calls go through the REST API `POST https://api.bolna.ai/call`, which `releaseSeat` uses.

## Commands (from `firebase/functions`)

```
npm test                 # unit tests (pure logic, webhook mapping)
npm run test:emulator    # Firestore transaction tests on emulator (Java 21 installed)
npm run deploy           # or: firebase deploy --only functions[:name] --project riya-event-ops-485f
ADMIN_TOKEN=... npm run seed -- <base>/adminSeed   # resets registrants/events/seats/promptEngine
```

Use `--non-interactive` for deploys from Claude.

## Done (2026-11-15)

- [x] Riya created on Bolna. Flow: hearing check → attendance → team and size (max 4) → food → T-shirt → one-sentence read-back → questions → warm close. One question at a time; English↔Hinglish switching; instant answer changes; callback times.
- [x] Firebase project, Firestore (asia-south1), deny-all rules.
- [x] Functions deployed. Every function requires a token (401 without it). `invoker: "public"` is set explicitly.
- [x] lookup / update / release logic ported from the Apps Script version:
  - validation and the team-size limit;
  - cancel-then-yes puts the person back on the waitlist rather than overbooking;
  - release promotes waitlist #1, renumbers the waitlist, updates `seats` and places a Bolna call to the promoted person.
- [x] Webhook writes status, termination reason, duration, transcript, extracted data and the raw payload to `calls`. It ignores out-of-order deliveries and links the call to the registrant by `registrant_id` or phone. Feedback and caller questions also go to `feedback`.
- [x] Extraction prompt set on the agent. Prompt source is in `firebase/prompt/` and is also seeded to `promptEngine/riya`.
- [x] Seed script plus 1 event (`HACK2026`, capacity 4) and 7 registrants.
- [x] Tests: 9 unit tests, emulator integration test, live smoke tests of all endpoints.
- [x] `BOLNA_API_KEY` verified against the Bolna API (HTTP 200). Bad versions destroyed. The old Apps Script backend and old agents were removed.

## To do

- [x] First live call (2026-11-15): flow worked. Fixed after it: hang-up, repeated fillers, stiffness, guessing, missing variables, then switched to bilingual (English-first, Kannada supported).
- [ ] **End-to-end call test (Kannada agent)**: put a real test number (the user's own) on R005 in `seed/registrants.json` and re-seed. Then call R001 from the Bolna dashboard and decline. Confirm Riya calls R005 and that both calls land in `calls`.
  - Not yet verified live: Bolna's actual tool request body format, and the webhook payload.
- [x] Multi-event support, Luma/CSV guest importer, launch with a 2-call concurrency dialer (2026-11-15). Unit + emulator tests and live dry runs pass.
- [ ] Import the real event: `npm run event -- --luma <link> --capacity N`, then the Luma CSV via `npm run import`, then enable and launch. The `LUMA-1A2RJJ9R` dry run already reads the real hackathon page.
- [ ] Ria Control dashboard: switch off mock data and read `events`, `registrants`, `calls`, `callQueue`. Its "Call now" should enqueue via the dialer rather than call Bolna directly.
- [ ] Listen to the Sarvam voice "Priya" in Kannada and English. Alternatives on `bulbul:v3`: Kavya, Shreya, Ritu, Suhani (voice_id = lowercase name).
- [ ] Optional `BOLNA_FROM_NUMBER` (E.164) caller ID. Empty means the account default.
- [ ] Callback scheduling: `callback_time` is free text. The dialer could enqueue it with `notBeforeMs` once the time is parsed.
- [ ] Event Q&A only knows name, date and venue. Add a knowledge base or more event facts if needed.
- [ ] Consider rotating `TOOL_TOKEN` and `WEBHOOK_TOKEN`: they appeared in a session transcript. After rotating, recreate the agent with the new values.
- [ ] Optionally restrict `bolnaWebhook` to Bolna's IPs (13.203.39.153, 13.126.9.249, 13.202.133.53).
- [ ] Optionally disable or remove `adminSeed` once real data is loaded.

## Repository

- Git root is `wisper-bolna/` (branch `main`). It tracks `CLAUDE.md` and `firebase/`: functions source, tests, seed, prompts, rules and indexes.
- Not tracked: `firebase/.secrets.local` (tokens), `node_modules`, `lib/`, `Ria Control/` (its own git repo) and `.playwright-mcp/`.
- `firebase/functions/.env.riya-event-ops-485f` **is** tracked. It holds only non-secret params (agent ID, dialer limits). Secrets live in Secret Manager.
- The Bolna agent config (with the tool and webhook tokens) lives in Bolna, not in git. To recreate it, use the prompt files in `firebase/prompt/` plus the tokens from `.secrets.local`.
