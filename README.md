# Ria Control

Organizer control room for Ria, the voice agent that calls HACK2026 registrants. Light and dark themes (follows the system setting), web-first, runs in Expo Go.
Expo + Expo Router + TypeScript, web-first. Live at https://riya-event-ops-485f.web.app

## Run
    npm install
    npm run web            # dev
    npm run deploy         # expo export -p web && firebase deploy --only hosting

## Data
Every screen reads through `src/data/store.tsx` (`useData()`).
- `EXPO_PUBLIC_USE_MOCK` (default `true`): realistic in-memory event that keeps moving (src/data/mock.ts).
- `EXPO_PUBLIC_USE_MOCK=false`: Firestore `onSnapshot` listeners on
  `registrants`, `calls`, `seatEvents`, `feedback`, `promptVersions` (src/data/firestore.ts).
  Needs the Firebase web config in `.env` (see `.env.example`).

"Call now" and "Retry" POST `{ registrantId, reason: "call_now" | "retry", retryOfCallId? }`
to the `placeCall` HTTPS function (`EXPO_PUBLIC_PLACE_CALL_URL`, defaults to asia-south1).
It should reply `{ ok: true, executionId }` or `{ ok: false, message }`, and allow CORS from the hosting origin.
"Promote" sets the registrant to `invited` and clears `waitlistRank`.

## Before switching off mock
- `firebase/firestore.rules` currently denies all client reads; organizers need read access (ideally behind Auth).
- `placeCall` does not exist in `firebase/functions` yet.
