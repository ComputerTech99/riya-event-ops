import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithCustomToken, signInWithEmailAndPassword, signOut, type User,
} from 'firebase/auth';
import {
  collection, doc, getFirestore, limit, onSnapshot, query, serverTimestamp, updateDoc, writeBatch,
  type DocumentData, type Query,
} from 'firebase/firestore';
import { FIREBASE_CONFIG, PLACE_CALL_URL } from './config';
import {
  toCall, toCallQueueItem, toEventConfig, toFeedback, toMs, toPromptVersion, toRegistrant, toSeatEvent,
} from './normalize';
import type {
  Call, CallQueueItem, DataState, Emit, EventConfig, Feedback, GuestInput, PlaceCallRequest,
  PromptVersion, Registrant, SeatEvent, Source,
} from './types';

function firebaseApp() {
  return getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
}

export function firebaseAuth() {
  return getAuth(firebaseApp());
}

export interface OrganizerUser {
  uid: string;
  email: string | null;
}

export function onOrganizerAuth(cb: (user: OrganizerUser | null) => void): () => void {
  const auth = firebaseAuth();
  return onAuthStateChanged(auth, (u: User | null) => {
    cb(u ? { uid: u.uid, email: u.email } : null);
  });
}

/**
 * Sign in an organiser with Firebase Auth.
 * First attempts direct Email/Password sign-in; if the project's email provider or account
 * hasn't been initialised yet, provisions it via the backend and signs in with a custom token.
 */
export async function signInOrganizer(email: string, password: string): Promise<void> {
  const auth = firebaseAuth();
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = password.trim();
  try {
    await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
    return;
  } catch {
    const res = await fetch(PLACE_CALL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'organizerSignIn', email: cleanEmail, password: cleanPass }),
    });
    const body: Record<string, unknown> = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      throw new Error(typeof body.message === 'string' ? body.message : `Organiser sign-in failed (${res.status})`);
    }
    if (typeof body.customToken === 'string') {
      await signInWithCustomToken(auth, body.customToken);
      return;
    }
    await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
  }
}

export async function signOutOrganizer(): Promise<void> {
  await signOut(firebaseAuth());
}

type CoreKey = 'events' | 'registrants' | 'calls' | 'callQueue';

const STATUS_RANK: Record<CallQueueItem['status'], number> = {
  dialing: 0,
  active: 1,
  pending: 2,
  failed: 3,
  timeout: 4,
  done: 5,
  skipped: 6,
};

function deriveSeatEvents(
  explicit: SeatEvent[],
  registrants: Registrant[],
  callQueue: CallQueueItem[],
): SeatEvent[] {
  if (explicit.length > 0) return [...explicit].sort((a, b) => b.at - a.at);
  const items: SeatEvent[] = [];
  for (const r of registrants) {
    if (r.status === 'confirmed') {
      items.push({
        id: `se_conf_${r.id}`,
        type: 'confirmed',
        fromRegistrantId: null,
        toRegistrantId: r.id,
        at: r.updatedAt || Date.now(),
      });
    } else if (r.status === 'cancelled' || r.status === 'declined') {
      items.push({
        id: `se_free_${r.id}`,
        type: 'seat_freed',
        fromRegistrantId: r.id,
        toRegistrantId: null,
        at: r.updatedAt || Date.now(),
      });
    }
  }
  for (const q of callQueue) {
    if (q.reason === 'waitlist_promotion') {
      items.push({
        id: `se_promo_${q.id}`,
        type: 'waitlist_called',
        fromRegistrantId: null,
        toRegistrantId: q.registrantId,
        at: q.startedAtMs ?? q.createdAtMs ?? q.updatedAt,
      });
    }
  }
  return items.sort((a, b) => b.at - a.at);
}

/** Real-time listeners on Firestore collections (`events`, `registrants`, `calls`, `callQueue`, etc.). */
export function createFirestoreSource(emit: Emit): Source {
  const app = firebaseApp();
  const db = getFirestore(app);
  const seen = new Set<CoreKey>();

  let rawEvents: { id: string; config: EventConfig; sortAt: number }[] = [];
  let rawRegistrants: Registrant[] = [];
  let rawCalls: (Call & { eventId?: string | null })[] = [];
  let rawQueue: CallQueueItem[] = [];
  let rawSeatEvents: SeatEvent[] = [];
  let rawFeedback: Feedback[] = [];
  let rawPrompts: PromptVersion[] = [];

  function flush() {
    // Pick active event: enabled events first, then most recently updated.
    const sortedEvents = [...rawEvents].sort(
      (a, b) => Number(b.config.enabled ?? true) - Number(a.config.enabled ?? true) || b.sortAt - a.sortAt,
    );
    const activeEvent = sortedEvents[0]?.config ?? null;
    const activeEventId = activeEvent?.id;

    // Filter registrants to the active event if any registrant matches its eventId; otherwise keep all.
    const hasEventRegs = activeEventId ? rawRegistrants.some((r) => r.eventId === activeEventId) : false;
    const registrants = hasEventRegs
      ? rawRegistrants.filter((r) => !r.eventId || r.eventId === activeEventId)
      : rawRegistrants;

    const regById = new Map(rawRegistrants.map((r) => [r.id, r]));
    const activeRegIds = new Set(registrants.map((r) => r.id));

    const calls = rawCalls
      .filter((c) => !hasEventRegs || !c.eventId || c.eventId === activeEventId || activeRegIds.has(c.registrantId))
      .map((c) => ({
        ...c,
        name: regById.get(c.registrantId)?.name ?? c.name,
      }))
      .sort((a, b) => b.startedAt - a.startedAt);

    const callQueue = rawQueue
      .filter((q) => !hasEventRegs || !q.eventId || q.eventId === activeEventId || activeRegIds.has(q.registrantId))
      .map((q) => ({
        ...q,
        name: regById.get(q.registrantId)?.name ?? q.name,
      }))
      .sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          a.priority - b.priority ||
          a.createdAtMs - b.createdAtMs,
      );

    const seatEvents = deriveSeatEvents(rawSeatEvents, registrants, callQueue);
    const feedback = [...rawFeedback].sort((a, b) => b.at - a.at);
    const promptVersions = [...rawPrompts].sort((a, b) => b.appliedAt - a.appliedAt);

    emit({
      event: activeEvent,
      registrants,
      calls,
      callQueue,
      seatEvents,
      feedback,
      promptVersions,
      ready: seen.size >= 4,
      error: null,
    } as Partial<DataState>);
  }

  function watch(
    label: string,
    q: Query<DocumentData>,
    onDocs: (docs: { id: string; data: DocumentData }[]) => void,
    coreKey?: CoreKey,
  ) {
    return onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .filter((d) => !d.id.startsWith('_'))
          .map((d) => ({ id: d.id, data: d.data() }));
        if (coreKey) seen.add(coreKey);
        onDocs(docs);
        flush();
      },
      (err) => emit({ error: `${label}: ${err.code ?? err.message}`, ready: true }),
    );
  }

  const unsubs = [
    watch(
      'events',
      query(collection(db, 'events')),
      (docs) => {
        rawEvents = docs.map((d) => ({
          id: d.id,
          config: toEventConfig(d.id, d.data),
          sortAt: toMs(d.data.updatedAt) ?? toMs(d.data.createdAt) ?? 0,
        }));
      },
      'events',
    ),
    watch(
      'registrants',
      query(collection(db, 'registrants')),
      (docs) => {
        rawRegistrants = docs.map((d) => toRegistrant(d.id, d.data));
      },
      'registrants',
    ),
    watch(
      'calls',
      query(collection(db, 'calls'), limit(500)),
      (docs) => {
        rawCalls = docs.map((d) => ({
          ...toCall(d.id, d.data),
          eventId: typeof d.data.eventId === 'string' ? d.data.eventId : null,
        }));
      },
      'calls',
    ),
    watch(
      'callQueue',
      query(collection(db, 'callQueue')),
      (docs) => {
        rawQueue = docs.map((d) => toCallQueueItem(d.id, d.data));
      },
      'callQueue',
    ),
    watch('seatEvents', query(collection(db, 'seatEvents'), limit(200)), (docs) => {
      rawSeatEvents = docs.map((d) => toSeatEvent(d.id, d.data));
    }),
    watch('feedback', query(collection(db, 'feedback'), limit(1000)), (docs) => {
      rawFeedback = docs.map((d) => toFeedback(d.id, d.data));
    }),
    watch('promptEngine', query(collection(db, 'promptEngine')), (docs) => {
      rawPrompts = docs.map((d) => toPromptVersion(d.id, d.data));
    }),
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
    async launch(event: EventConfig, guests: GuestInput[]) {
      const slug = event.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'EVENT';
      const eventRef = doc(db, 'events', slug);
      let rank = 0;
      const writes = guests.map((g, idx) => ({
        ref: doc(db, 'registrants', `${slug}-${String(idx + 1).padStart(3, '0')}`),
        data: {
          ...g,
          eventId: eventRef.id,
          teamSize: null,
          callbackTime: null,
          notes: [],
          waitlistRank: g.status === 'waitlist' ? ++rank : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      }));
      for (let i = 0; i < writes.length; i += 450) {
        const b = writeBatch(db);
        writes.slice(i, i + 450).forEach((w) => b.set(w.ref, w.data));
        await b.commit();
      }
      const b = writeBatch(db);
      b.set(eventRef, {
        name: event.name,
        date: event.date,
        venue: event.venue,
        capacity: event.capacity,
        maxTeamSize: 4,
        enabled: true,
        timezone: 'Asia/Kolkata',
        config: event,
        guestCount: guests.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await b.commit();
    },
  };
}

/**
 * POST to the `placeCall` HTTPS function, which enqueues the call in `callQueue`
 * through the backend dialer (never calling Bolna directly).
 */
export async function postPlaceCall(req: PlaceCallRequest): Promise<string> {
  const token = await firebaseAuth().currentUser?.getIdToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(PLACE_CALL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
  });
  const body: Record<string, unknown> = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(typeof body.message === 'string' ? body.message : `placeCall failed (${res.status})`);
  }
  return String(body.executionId ?? body.queueId ?? body.callId ?? 'queued');
}
