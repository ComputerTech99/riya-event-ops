# Ria Control

Organizer control room for Ria, a Bolna voice agent that calls HACK2026 registrants.
Expo SDK 58 + Expo Router + TypeScript. Web-first, also runs in Expo Go on iOS.
Live web: https://riya-event-ops-485f.web.app (Firebase project `riya-event-ops-485f`).
See AGENTS.md for general Expo rules (use `npx expo install`, versioned docs).

## Commands
- `npm run web`: dev server in the browser. `npx expo start`: dev server for Expo Go.
- `npm run typecheck`: run before calling anything done.
- `npm run deploy`: `expo export -p web` then `firebase deploy --only hosting`. It never touches functions or rules.

## Layout
- `src/app/_layout.tsx`: loads fonts, wraps everything in `DataProvider`.
- `src/app/(tabs)/_layout.tsx`: the shell. Top pill nav at 760px and wider, floating bottom tab bar below that. Uses `Slot` and `router.navigate`, not `Tabs`.
- `src/app/(tabs)/`: `index` (Mission Control), `waitlist`, `calls`, `inbox`, `insights`, `call/[id]` (call detail).
- `src/components/ui.tsx`: the whole UI kit (Card, Button, StatusChip, Avatar, Segmented, Bar, Ticker, Split/Col/Grid, Screen, PageHeader).
- `src/theme.ts`: light and dark token sets; `useTheme()` picks one from the system color scheme.
- `src/data/`: the single data layer (see below).

## Data layer
- Every screen reads through `useData()` from `src/data/store.tsx`. Never read Firestore or the mock directly from a screen.
- `EXPO_PUBLIC_USE_MOCK` (default true) picks `mock.ts` (seeded, self-animating event) or `firestore.ts` (onSnapshot listeners).
- Collections and field names follow the user's schema exactly: `registrants`, `calls`, `seatEvents`, `feedback`, `promptVersions` (see `src/data/types.ts`). `normalize.ts` converts Timestamps/ISO strings to epoch ms.
- "Call now" and "Retry" POST `{ registrantId, reason, retryOfCallId? }` to the `placeCall` HTTPS function (`EXPO_PUBLIC_PLACE_CALL_URL`). "Promote" sets `status: 'invited'` and clears `waitlistRank`.
- Derived numbers (stats, seat split, inbox, tallies, ratings) live in `selectors.ts`.

## Design rules
- Plus Jakarta Sans only, bundled from `assets/fonts/` (not node_modules). Numbers use `fontVariant: ['tabular-nums']`.
- Light: lavender canvas `#F5F4F8`, white cards with a hairline border, violet primary `#5A54C8`. Dark: `#0E0E0F` canvas, borderless cards, lime primary `#D5F25E`.
- Keep it quiet: no gradients, no icon tiles on stat cards, status shown as soft pill chips with a dot. Sentence case everywhere.
- Changing numbers animate via `Ticker` (changed digits roll in).
- Style with theme tokens from `useTheme()`; don't hardcode colours in screens.

## Gotchas
- Firebase Hosting must not ignore `**/node_modules/**`: Expo exports assets under `dist/assets/node_modules/...`. Ignoring them made fonts 404 to index.html and blanked the app.
- `public/index.html` is the web HTML shell; it sets the pre-JS background so there's no white flash.
- `Link asChild` around `Pressable` crashed react-native-web (array style on a DOM node). Use `router.navigate` in `onPress`.
- In a column, `flexBasis: 0` collapses cards on phones. Only `Col` inside a wide `Split` gets row flex.

## Backend status (lives in ../firebase, not this repo)
- `firestore.rules` denies all client reads, so live mode shows a feed error until organizer reads are allowed (ideally behind Auth).
- There is no `placeCall` function yet. It needs CORS for the hosting origin.
- The webhook writes some fields that differ from this app's schema (`feedback`/`callerQuestions`, `seats`/`events`). Reconcile before turning mock off.
