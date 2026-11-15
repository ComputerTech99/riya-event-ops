import type { EventConfig } from './types';

/**
 * Runtime config. Expo inlines EXPO_PUBLIC_* only when read as `process.env.EXPO_PUBLIC_X`
 * literally, so each one is spelled out.
 */

/** USE_MOCK: false by default so Ria Control reads live Firestore. Set EXPO_PUBLIC_USE_MOCK=true for mock. */
export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === 'true';

const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'riya-event-ops-485f';

export const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyB80jrRGkOTXgGLURO7tVYYRZ6JtQKvMEQ',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '603269343227',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:603269343227:web:31ef726f79347fa59acd5e',
};

/** Bolna concurrent-call limit enforced by the backend dialer. */
export const MAX_CONCURRENT_CALLS = Number(process.env.EXPO_PUBLIC_MAX_CONCURRENT_CALLS || 2);

/** HTTPS function used by "Call now" and "Retry". */
export const PLACE_CALL_URL =
  process.env.EXPO_PUBLIC_PLACE_CALL_URL ||
  `https://asia-south1-${projectId}.cloudfunctions.net/placeCall`;

/** Seats available at the event; drives the seat ring. */
export const SEAT_CAPACITY = Number(process.env.EXPO_PUBLIC_SEAT_CAPACITY || 40);

export const EVENT_NAME = process.env.EXPO_PUBLIC_EVENT_NAME || 'HACK2026';

/** The sample event the mock feed runs until a real one is set up. */
export const DEMO_EVENT: EventConfig = {
  type: 'hackathon',
  name: EVENT_NAME,
  date: 'Sat 6 – Sun 7 Dec',
  venue: 'Bengaluru',
  capacity: SEAT_CAPACITY,
  lumaUrl: null,
  ria: { confirmByCall: true, fillFromWaitlist: true, collectFoodTshirt: true, feedbackEmail: true },
};
