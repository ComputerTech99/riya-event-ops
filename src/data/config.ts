/**
 * Runtime config. Expo inlines EXPO_PUBLIC_* only when read as `process.env.EXPO_PUBLIC_X`
 * literally, so each one is spelled out.
 */

/** USE_MOCK: true until the backend is ready. Set EXPO_PUBLIC_USE_MOCK=false to read Firestore. */
export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK !== 'false';

const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'riya-event-ops-485f';

export const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/** HTTPS function used by "Call now" and "Retry". */
export const PLACE_CALL_URL =
  process.env.EXPO_PUBLIC_PLACE_CALL_URL ||
  `https://asia-south1-${projectId}.cloudfunctions.net/placeCall`;

/** Seats available at the event; drives the seat ring. */
export const SEAT_CAPACITY = Number(process.env.EXPO_PUBLIC_SEAT_CAPACITY || 40);

export const EVENT_NAME = process.env.EXPO_PUBLIC_EVENT_NAME || 'HACK2026';
