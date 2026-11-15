/**
 * The single data layer. Every screen reads through `useData()`; whether rows come from
 * Firestore listeners or the mock is decided here, by USE_MOCK, and nowhere else.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEMO_EVENT, USE_MOCK } from './config';
import {
  createFirestoreSource, onOrganizerAuth, signInOrganizer, signOutOrganizer, type OrganizerUser,
} from './firestore';
import { createMockSource, type MockSetup } from './mock';
import { loadSetup, saveSetup } from './storage';
import type { Call, DataState, EventConfig, GuestInput, Source } from './types';

export type Notice = { text: string; tone: 'ok' | 'error' } | null;

interface Ctx extends DataState {
  pending: Record<string, boolean>;
  notice: Notice;
  callNow(registrantId: string): Promise<void>;
  retry(call: Call): Promise<void>;
  promote(registrantId: string): Promise<void>;
  dismissNotice(): void;
  /** Saved setup has been read; until then we don't know if this is a first launch. */
  setupLoaded: boolean;
  /** The organizer has finished or skipped the setup flow at least once. */
  setupSeen: boolean;
  skipSetup(): void;
  launch(event: EventConfig, guests: GuestInput[]): Promise<void>;
  /** Organiser Firebase Auth session (always populated in mock mode). */
  user: OrganizerUser | null;
  authReady: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const initial: DataState = {
  registrants: [], calls: [], callQueue: [], seatEvents: [], feedback: [], promptVersions: [], event: null,
  ready: false, error: null, source: USE_MOCK ? 'mock' : 'firestore',
};

const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>(initial);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const src = useRef<Source | null>(null);
  const [setupLoaded, setSetupLoaded] = useState(!USE_MOCK);
  const [setupSeen, setSetupSeen] = useState(!USE_MOCK);
  const [user, setUser] = useState<OrganizerUser | null>(
    USE_MOCK ? { uid: 'mock-organizer', email: 'organizer@riya.ai' } : null,
  );
  const [authReady, setAuthReady] = useState(USE_MOCK);

  const emit = useCallback((patch: Partial<DataState>) => setState((s) => ({ ...s, ...patch })), []);
  const startMock = useCallback((setup?: MockSetup) => {
    src.current?.stop();
    setState((s) => ({ ...s, calls: [], callQueue: [], seatEvents: [], registrants: [] }));
    src.current = createMockSource(emit, setup);
  }, [emit]);

  useEffect(() => {
    let alive = true;
    loadSetup().then((saved) => {
      if (!alive) return;
      setSetupSeen(USE_MOCK ? saved.seen : true);
      setSetupLoaded(true);
      if (USE_MOCK) startMock(saved.event ? { event: saved.event, guests: saved.guests } : undefined);
    });
    return () => { alive = false; };
  }, [startMock]);

  useEffect(() => {
    if (USE_MOCK) return;
    const unsubAuth = onOrganizerAuth((u) => {
      setUser(u);
      setAuthReady(true);
      src.current?.stop();
      src.current = null;
      if (u) {
        src.current = createFirestoreSource(emit);
      } else {
        setState((s) => ({
          ...s,
          registrants: [],
          calls: [],
          callQueue: [],
          seatEvents: [],
          feedback: [],
          promptVersions: [],
          ready: false,
          error: null,
        }));
      }
    });
    return () => {
      unsubAuth();
      src.current?.stop();
    };
  }, [emit]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const run = useCallback(async (key: string, ok: string, fn: (s: Source) => Promise<unknown>) => {
    if (!src.current) return;
    setPending((p) => ({ ...p, [key]: true }));
    try {
      await fn(src.current);
      setNotice({ text: ok, tone: 'ok' });
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : String(e), tone: 'error' });
    } finally {
      setPending((p) => {
        const { [key]: _, ...rest } = p;
        return rest;
      });
    }
  }, []);

  const nameOf = useCallback(
    (id: string) => state.registrants.find((r) => r.id === id)?.name ?? id,
    [state.registrants],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    await signInOrganizer(email, password);
    setNotice({ text: 'Signed in as organiser.', tone: 'ok' });
  }, []);

  const signOut = useCallback(async () => {
    await signOutOrganizer();
    setNotice({ text: 'Signed out.', tone: 'ok' });
  }, []);

  const value = useMemo<Ctx>(() => ({
    ...state,
    pending,
    notice,
    callNow: (registrantId) =>
      run(`call:${registrantId}`, `Added ${nameOf(registrantId)} to the dialer queue.`, (s) =>
        s.placeCall({ registrantId, reason: 'call_now' })),
    retry: (call) =>
      run(`call:${call.registrantId}`, `Added retry for ${call.name} to the dialer queue.`, (s) =>
        s.placeCall({ registrantId: call.registrantId, reason: 'retry', retryOfCallId: call.id })),
    promote: (registrantId) =>
      run(`promote:${registrantId}`, `${nameOf(registrantId)} promoted off the waitlist.`, (s) => s.promote(registrantId)),
    dismissNotice: () => setNotice(null),
    setupLoaded,
    setupSeen,
    skipSetup: () => {
      setSetupSeen(true);
      loadSetup().then((s) => saveSetup({ ...s, seen: true }));
    },
    launch: async (event, guests) => {
      if (!USE_MOCK) await src.current?.launch(event, guests);
      await saveSetup({ seen: true, event, guests: USE_MOCK ? guests : [] });
      setSetupSeen(true);
      if (USE_MOCK) startMock({ event, guests });
      setNotice({ text: `${event.name} is live. Ria is starting on ${guests.length} guests.`, tone: 'ok' });
    },
    user,
    authReady,
    signIn,
    signOut,
  }), [state, pending, notice, run, nameOf, setupLoaded, setupSeen, startMock, user, authReady, signIn, signOut]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx {
  const v = useContext(DataCtx);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}

/** Re-renders every `ms`; drives clocks and elapsed timers. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** The event being run, or the demo event while nothing is set up. */
export function useEvent(): EventConfig {
  return useData().event ?? DEMO_EVENT;
}
