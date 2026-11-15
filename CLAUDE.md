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
- `src/app/(tabs)/_layout.tsx`: the shell. Wide: white panel on a lavender canvas with an icon sidebar (logo, + button, 5 tabs, feed status). Narrow: header with + button and a black floating bottom tab bar. Uses `Slot` and `router.navigate`, not `Tabs`. Redirects to `/setup` on first launch.
- `src/app/setup.tsx`: the 4-step "set up your event" flow (type, details/Luma link, guests via CSV or by hand, Ria's jobs + summary + Launch). Opened on first launch and from the + button.
- `src/app/(tabs)/`: `index` (Mission Control), `waitlist`, `calls`, `inbox`, `insights`, `call/[id]` (call detail).
- `src/components/ui.tsx`: the whole UI kit (Card, Button, StatusChip, Avatar, Segmented, Bar, Ticker, Split/Col/Grid, Screen, PageHeader).
- `src/theme.ts`: light and dark token sets; `useTheme()` picks one from the system color scheme.
- `src/data/`: the single data layer (see below).
- `src/lib/csv.ts`: CSV parser, header auto-mapping (Luma, Google Forms, Devfolio, Eventbrite patterns), seat/waitlist assignment. `src/lib/luma.ts`: Luma link to event details. `src/lib/sampleCsv.ts`: built-in sample export.

## Data layer
- Every screen reads through `useData()` from `src/data/store.tsx`. Never read Firestore or the mock directly from a screen.
- `EXPO_PUBLIC_USE_MOCK` (default true) picks `mock.ts` (seeded, self-animating event) or `firestore.ts` (onSnapshot listeners).
- Collections and field names follow the user's schema exactly: `registrants`, `calls`, `seatEvents`, `feedback`, `promptVersions` (see `src/data/types.ts`). `normalize.ts` converts Timestamps/ISO strings to epoch ms.
- "Call now" and "Retry" POST `{ registrantId, reason, retryOfCallId? }` to the `placeCall` HTTPS function (`EXPO_PUBLIC_PLACE_CALL_URL`). "Promote" sets `status: 'invited'` and clears `waitlistRank`.
- Derived numbers (stats, seat split, inbox, tallies, ratings) live in `selectors.ts`.
- The running event (`EventConfig`: type, name, date, venue, capacity, Ria's jobs) comes from `useEvent()`; never read `EVENT_NAME`/`SEAT_CAPACITY` in screens, those only seed `DEMO_EVENT`.
- `launch(event, guests)`: mock mode rebuilds the mock from the guest list (Ria starts calling within seconds, respecting the job toggles); Firestore mode batch-writes `registrants` plus an `events` doc (`{ config, guestCount, createdAt }`). The setup is saved with AsyncStorage (`src/data/storage.ts`) so reloads keep it.

## Design rules
- Reference: a calm editorial dashboard (huge hero number + one goal bar, stats in a row split by hairlines, table rows with grey chips and a small progress ring, icon sidebar, black pills).
- Plus Jakarta Sans only, bundled from `assets/fonts/` (not node_modules). Numbers use `fontVariant: ['tabular-nums']`.
- Light: white page on lavender canvas `#ECE7F1`, black primary `#111114`. Dark inverts it (white pills on `#111114`). Colour is for meaning only: green/amber/red dots and bars.
- No boxes: `Card` is a section with a hairline on top; `Split` draws a hairline between columns. Status chips are neutral grey with a coloured dot. Sentence case everywhere. No gradients.
- Changing numbers animate via `Ticker` (changed digits roll in).
- Style with theme tokens from `useTheme()`; don't hardcode colours in screens.

## Gotchas
- Firebase Hosting must not ignore `**/node_modules/**`: Expo exports assets under `dist/assets/node_modules/...`. Ignoring them made fonts 404 to index.html and blanked the app.
- `public/index.html` is the web HTML shell; it sets the pre-JS background so there's no white flash.
- `Link asChild` around `Pressable` crashed react-native-web (array style on a DOM node). Use `router.navigate` in `onPress`.
- In a column, `flexBasis: 0` collapses cards on phones. Only `Col` inside a wide `Split` gets row flex.
- Luma's API blocks browser requests (CORS), so Luma auto-fill only works in the native app. The web build shows a clear message and the fields stay editable. A small proxy function would fix web.

## Backend status (lives in ../firebase, not this repo)
- `firestore.rules` denies all client reads, so live mode shows a feed error until organizer reads are allowed (ideally behind Auth).
- There is no `placeCall` function yet. It needs CORS for the hosting origin.
- Setup writes `events` and `registrants` from the client, which also needs rules (or move it into a function).
- The webhook writes some fields that differ from this app's schema (`feedback`/`callerQuestions`, `seats`/`events`). Reconcile before turning mock off.
