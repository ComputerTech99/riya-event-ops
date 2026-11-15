import type {
  Call, CallQueueItem, EventConfig, EventType, Feedback, PromptVersion, QueueItemReason, QueueItemStatus,
  Rating, Registrant, RegStatus, SeatEvent,
} from './types';

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

function formatNotes(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (Array.isArray(v)) {
    const parts = v
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object' && typeof (item as Raw).text === 'string') return (item as Raw).text.trim();
        return '';
      })
      .filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }
  if (typeof v === 'string') return v.trim() || null;
  return null;
}

const STATUSES: RegStatus[] = ['registered', 'waitlist', 'confirmed', 'maybe', 'cancelled', 'declined', 'invited'];

export function toRegistrant(id: string, d: Raw): Registrant {
  return {
    id,
    eventId: str(d.eventId) ?? undefined,
    name: str(d.name) ?? 'Unknown',
    phone: str(d.phone) ?? '',
    email: str(d.email) ?? '',
    status: STATUSES.includes(d.status) ? d.status : 'registered',
    teamName: str(d.teamName),
    teamSize: num(d.teamSize),
    foodPref: str(d.foodPref),
    tshirtSize: str(d.tshirtSize),
    callbackTime: toMs(d.callbackTime),
    notes: formatNotes(d.notes),
    waitlistRank: num(d.waitlistRank),
    updatedAt: toMs(d.updatedAt) ?? toMs(d.createdAt) ?? 0,
  };
}

export function toCall(id: string, d: Raw): Call {
  let extracted: Record<string, unknown> = {};
  if (d.extractedData && typeof d.extractedData === 'object') extracted = d.extractedData;
  else if (typeof d.extractedData === 'string') {
    try { extracted = JSON.parse(d.extractedData); } catch { extracted = { raw: d.extractedData }; }
  }
  const firstHistoryAt = Array.isArray(d.statusHistory) && d.statusHistory.length > 0
    ? toMs(d.statusHistory[0]?.at)
    : null;
  const startedAt =
    toMs(d.startedAt) ??
    toMs(d.queuedAt) ??
    toMs(d.createdAt) ??
    firstHistoryAt ??
    toMs(d.payloadUpdatedAt) ??
    toMs(d.updatedAt) ??
    0;
  return {
    id,
    registrantId: str(d.registrantId) ?? '',
    name: str(d.name) ?? str(d.userNumber) ?? str(d.registrantId) ?? 'Unknown',
    status: str(d.status) ?? 'unknown',
    terminationReason: str(d.terminationReason),
    durationSec: num(d.durationSec),
    transcript: str(d.transcript) ?? '',
    extractedData: extracted,
    startedAt,
    promptVersion: str(d.promptVersion) ?? 'v1',
  };
}

const QUEUE_REASONS: QueueItemReason[] = ['launch', 'waitlist_promotion', 'call_now', 'retry'];
const QUEUE_STATUSES: QueueItemStatus[] = ['pending', 'dialing', 'active', 'done', 'failed', 'skipped', 'timeout'];

export function toCallQueueItem(id: string, d: Raw): CallQueueItem {
  const reason: QueueItemReason = QUEUE_REASONS.includes(d.reason) ? d.reason : 'launch';
  const status: QueueItemStatus = QUEUE_STATUSES.includes(d.status) ? d.status : 'pending';
  return {
    id,
    eventId: str(d.eventId) ?? '',
    registrantId: str(d.registrantId) ?? '',
    name: str(d.name) ?? str(d.registrantId) ?? 'Unknown',
    reason,
    priority: num(d.priority) ?? 10,
    status,
    attempts: num(d.attempts) ?? 0,
    notBeforeMs: num(d.notBeforeMs) ?? 0,
    createdAtMs: num(d.createdAtMs) ?? toMs(d.updatedAt) ?? 0,
    startedAtMs: num(d.startedAtMs),
    executionId: str(d.executionId),
    error: str(d.error),
    updatedAt: toMs(d.updatedAt) ?? num(d.createdAtMs) ?? 0,
  };
}

const EVENT_TYPES: EventType[] = ['hackathon', 'meetup', 'workshop', 'conference', 'other'];

export function toEventConfig(id: string, d: Raw): EventConfig {
  const cfg = (d.config && typeof d.config === 'object' ? d.config : d) as Raw;
  const ria = (cfg.ria && typeof cfg.ria === 'object' ? cfg.ria : {}) as Raw;
  return {
    id,
    type: EVENT_TYPES.includes(cfg.type) ? cfg.type : 'hackathon',
    name: str(cfg.name ?? d.name) ?? id,
    date: str(cfg.date ?? d.date) ?? '',
    venue: str(cfg.venue ?? d.venue) ?? '',
    capacity: num(cfg.capacity ?? d.capacity) ?? 40,
    lumaUrl: str(cfg.lumaUrl ?? d.source?.url) ?? null,
    enabled: typeof d.enabled === 'boolean' ? d.enabled : true,
    ria: {
      confirmByCall: ria.confirmByCall ?? true,
      fillFromWaitlist: ria.fillFromWaitlist ?? true,
      collectFoodTshirt: ria.collectFoodTshirt ?? true,
      feedbackEmail: ria.feedbackEmail ?? false,
    },
  };
}

export function toSeatEvent(id: string, d: Raw): SeatEvent {
  return {
    id,
    type: d.type === 'seat_freed' || d.type === 'waitlist_called' ? d.type : 'confirmed',
    fromRegistrantId: str(d.fromRegistrantId),
    toRegistrantId: str(d.toRegistrantId),
    at: toMs(d.at) ?? toMs(d.updatedAt) ?? toMs(d.createdAt) ?? 0,
  };
}

export function toFeedback(id: string, d: Raw): Feedback {
  const fbText = str(d.comment) ?? str(d.feedback) ?? (Array.isArray(d.callerQuestions) ? d.callerQuestions.join(' · ') : str(d.callerQuestions));
  let rating: Rating = 'good';
  if (d.rating === 'good' || d.rating === 'issue' || d.rating === 'not_wanted') {
    rating = d.rating;
  } else if (fbText) {
    const low = fbText.toLowerCase();
    if (/not wanted|don't call|stop calling/.test(low)) rating = 'not_wanted';
    else if (/issue|problem|bad|wrong|slow|repeat/.test(low)) rating = 'issue';
  }
  return {
    id,
    executionId: str(d.executionId) ?? id,
    rating,
    comment: fbText,
    promptVersion: str(d.promptVersion) ?? 'v1',
    at: toMs(d.at) ?? toMs(d.createdAt) ?? 0,
  };
}

export function toPromptVersion(id: string, d: Raw): PromptVersion {
  const rawVer = d.version != null ? String(d.version) : id;
  const version = /^\d+$/.test(rawVer) ? `v${rawVer}` : rawVer;
  const changeNote =
    str(d.changeNote) ??
    str(d.description) ??
    (typeof d.welcomeMessage === 'string' && d.welcomeMessage
      ? `Bilingual prompt (${d.welcomeMessage.slice(0, 68)}${d.welcomeMessage.length > 68 ? '…' : ''})`
      : 'Live Bolna agent prompt');
  return {
    id,
    version,
    changeNote,
    appliedAt: toMs(d.appliedAt) ?? toMs(d.updatedAt) ?? toMs(d.createdAt) ?? 0,
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
