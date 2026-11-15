import type { Call, Feedback, PromptVersion, Registrant, RegStatus, SeatEvent } from './types';

type Raw = Record<string, any>;

/** Firestore Timestamp | {seconds} | ISO string | ms number -> epoch ms. */
export function toMs(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === 'object') {
    const o = v as Raw;
    if (typeof o.toMillis === 'function') return o.toMillis();
    if (typeof o.seconds === 'number') return o.seconds * 1000 + Math.floor((o.nanoseconds ?? 0) / 1e6);
  }
  return null;
}

const str = (v: unknown) => (v == null || v === '' ? null : String(v));
const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

const STATUSES: RegStatus[] = ['registered', 'waitlist', 'confirmed', 'maybe', 'cancelled', 'invited'];

export function toRegistrant(id: string, d: Raw): Registrant {
  return {
    id,
    name: str(d.name) ?? 'Unknown',
    phone: str(d.phone) ?? '',
    email: str(d.email) ?? '',
    status: STATUSES.includes(d.status) ? d.status : 'registered',
    teamName: str(d.teamName),
    teamSize: num(d.teamSize),
    foodPref: str(d.foodPref),
    tshirtSize: str(d.tshirtSize),
    callbackTime: toMs(d.callbackTime),
    notes: str(d.notes),
    waitlistRank: num(d.waitlistRank),
    updatedAt: toMs(d.updatedAt) ?? 0,
  };
}

export function toCall(id: string, d: Raw): Call {
  let extracted: Record<string, unknown> = {};
  if (d.extractedData && typeof d.extractedData === 'object') extracted = d.extractedData;
  else if (typeof d.extractedData === 'string') {
    try { extracted = JSON.parse(d.extractedData); } catch { extracted = { raw: d.extractedData }; }
  }
  return {
    id,
    registrantId: str(d.registrantId) ?? '',
    name: str(d.name) ?? 'Unknown',
    status: str(d.status) ?? 'unknown',
    terminationReason: str(d.terminationReason),
    durationSec: num(d.durationSec),
    transcript: str(d.transcript) ?? '',
    extractedData: extracted,
    startedAt: toMs(d.startedAt) ?? 0,
    promptVersion: str(d.promptVersion),
  };
}

export function toSeatEvent(id: string, d: Raw): SeatEvent {
  return {
    id,
    type: d.type === 'seat_freed' || d.type === 'waitlist_called' ? d.type : 'confirmed',
    fromRegistrantId: str(d.fromRegistrantId),
    toRegistrantId: str(d.toRegistrantId),
    at: toMs(d.at) ?? 0,
  };
}

export function toFeedback(id: string, d: Raw): Feedback {
  return {
    id,
    executionId: str(d.executionId) ?? id,
    rating: d.rating === 'good' || d.rating === 'not_wanted' ? d.rating : 'issue',
    comment: str(d.comment),
    promptVersion: str(d.promptVersion),
    at: toMs(d.at) ?? 0,
  };
}

export function toPromptVersion(id: string, d: Raw): PromptVersion {
  return {
    id,
    version: str(d.version) ?? id,
    changeNote: str(d.changeNote) ?? '',
    appliedAt: toMs(d.appliedAt) ?? 0,
  };
}

/** A call's outcome, collapsed from Bolna's raw status. */
export type Outcome = 'live' | 'connected' | 'no_answer' | 'busy' | 'failed';

const LIVE = ['queued', 'scheduled', 'initiated', 'initiate', 'ringing', 'in-progress', 'calling', 'balance-low'];
const NO_ANSWER = ['no-answer', 'not-answered', 'unanswered', 'canceled'];

export function outcomeOf(c: Pick<Call, 'status' | 'durationSec'>): Outcome {
  const s = c.status.toLowerCase().replace(/_/g, '-');
  if (LIVE.includes(s)) return 'live';
  if (NO_ANSWER.includes(s)) return 'no_answer';
  if (s === 'busy') return 'busy';
  if (s === 'completed' || s === 'answered' || s === 'connected') return 'connected';
  if (s === 'call-disconnected') return (c.durationSec ?? 0) > 5 ? 'connected' : 'failed';
  return 'failed';
}

export const isRetryable = (c: Call) => {
  const o = outcomeOf(c);
  return o === 'no_answer' || o === 'busy' || o === 'failed';
};
