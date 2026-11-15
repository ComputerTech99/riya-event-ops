import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  collection, doc, getFirestore, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
  type DocumentData, type Query,
} from 'firebase/firestore';
import { FIREBASE_CONFIG, PLACE_CALL_URL } from './config';
import { toCall, toFeedback, toPromptVersion, toRegistrant, toSeatEvent } from './normalize';
import type { DataState, Emit, PlaceCallRequest, Source } from './types';

type Key = 'registrants' | 'calls' | 'seatEvents' | 'feedback' | 'promptVersions';

/** Real-time listeners on the five Ria collections. */
export function createFirestoreSource(emit: Emit): Source {
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);
  const seen = new Set<Key>();

  function listen<T>(key: Key, q: Query<DocumentData>, map: (id: string, d: DocumentData) => T) {
    return onSnapshot(
      q,
      (snap) => {
        // Skip `_schema` and other underscore docs the backend seeds.
        const rows = snap.docs.filter((d) => !d.id.startsWith('_')).map((d) => map(d.id, d.data()));
        seen.add(key);
        emit({ [key]: rows, ready: seen.size === 5, error: null } as Partial<DataState>);
      },
      (err) => emit({ error: `${key}: ${err.code ?? err.message}`, ready: true }),
    );
  }

  const unsubs = [
    listen('registrants', query(collection(db, 'registrants')), toRegistrant),
    listen('calls', query(collection(db, 'calls'), orderBy('startedAt', 'desc'), limit(500)), toCall),
    listen('seatEvents', query(collection(db, 'seatEvents'), orderBy('at', 'desc'), limit(200)), toSeatEvent),
    listen('feedback', query(collection(db, 'feedback'), orderBy('at', 'desc'), limit(1000)), toFeedback),
    listen('promptVersions', query(collection(db, 'promptVersions'), orderBy('appliedAt', 'desc')), toPromptVersion),
  ];

  return {
    stop: () => unsubs.forEach((u) => u()),
    placeCall: postPlaceCall,
    async promote(registrantId: string) {
      await updateDoc(doc(db, 'registrants', registrantId), {
        status: 'invited',
        waitlistRank: null,
        updatedAt: serverTimestamp(),
      });
    },
  };
}

/** POST to the `placeCall` HTTPS function. Expects `{ ok, executionId? , message? }`. */
export async function postPlaceCall(req: PlaceCallRequest): Promise<string> {
  const res = await fetch(PLACE_CALL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const body: Record<string, unknown> = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(typeof body.message === 'string' ? body.message : `placeCall failed (${res.status})`);
  }
  return String(body.executionId ?? body.callId ?? 'queued');
}
