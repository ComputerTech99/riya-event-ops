# Ria Control

Live organiser mission control for **Riya**, the autonomous Bolna voice agent for hackathon and event operations. Built with **Expo SDK 58 + Expo Router + TypeScript** (web-first, also runs natively in Expo Go on iOS).

- **Live Web App**: [https://riya-event-ops-485f.web.app](https://riya-event-ops-485f.web.app)
- **Firebase Project**: `riya-event-ops-485f` (`asia-south1`)

---

## Features

- **Live Firestore Data (`USE_MOCK = false`)**: Real-time `onSnapshot` listeners across `events`, `registrants`, `calls`, `callQueue`, `feedback`, and `promptEngine`, protected by Firebase Authentication organiser sign-in.
- **Mission Control**:
  - Real-time confirmed seat counter with animated `Ticker` digits and stacked capacity progress bar.
  - **Dialer Queue & 2-Call Limit Monitor**: Displays active Bolna call slots (`Slot 1 of 2`, `Slot 2 of 2`), calling window (`10:00–20:00 IST`), and live `callQueue` items (`Queued`, `Dialling`, `On line`, `Done`, `Failed`).
  - **Live Call Card**: Animated waveform, elapsed timer, and live transcript stream for active calls, or one-click **Call next** for the top waitlisted guest.
  - **Seat Activity Timeline**: Tracks seat confirmations, cancellations, and automatic waitlist promotions.
- **Queue-Backed Actions (`placeCall`)**: Clicking **Call now** or **Retry** sends an authenticated POST request (with the organiser's Firebase Auth ID token) to the `placeCall` Cloud Function, which enqueues the call into `callQueue` and dispatches via the 2-slot backend dialer—never calling Bolna directly from the browser.
- **4-Step Event Setup Wizard (`/setup`)**: Configure event type, auto-fill from a Luma link, import guests via CSV (Luma, Google Forms, Devfolio, Eventbrite auto-mapping), and launch.

---

## Commands

```bash
npm install
npm run web          # Start local web dev server
npm run typecheck    # Run TypeScript compiler check (tsc --noEmit)
npm run deploy       # Export static web bundle (expo export -p web) & deploy to Firebase Hosting
```

---

## Architecture

- `src/app/_layout.tsx`: Font loader and root `DataProvider`.
- `src/app/(tabs)/_layout.tsx`: Responsive shell with `OrganizerSignIn` gate, icon sidebar (wide) / floating bottom bar (narrow), live feed status badge, and sign-out control.
- `src/app/(tabs)/index.tsx`: Mission Control (hero seat counter, stats row including `Dialer lines` `X/2`, recent calls, live call card, 2-slot `Dialer queue`, and seat activity).
- `src/app/(tabs)/waitlist.tsx`: Waitlist queue and full registrant roster with one-click **Call** and **Promote**.
- `src/app/(tabs)/calls.tsx` & `src/app/(tabs)/call/[id].tsx`: Call log with outcome filters and detailed call view (full transcript, extracted fields, and **Retry** button).
- `src/app/(tabs)/inbox.tsx`: Callback requests, escalations, and deduplicated caller questions.
- `src/app/(tabs)/insights.tsx`: Dietary and T-shirt size tallies, prompt version ratings, and CSV headcount export.
- `src/data/firestore.ts`: Firebase Auth organiser sign-in, real-time Firestore listeners, schema reconciliation (`events`, `registrants`, `calls`, `callQueue`), and `postPlaceCall`.
