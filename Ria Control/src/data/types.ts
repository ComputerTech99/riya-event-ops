/** Field names follow the Ria schema exactly. Timestamps are normalised to epoch ms. */

export type RegStatus = 'registered' | 'waitlist' | 'confirmed' | 'maybe' | 'cancelled' | 'declined' | 'invited';

export interface Registrant {
  id: string;
  eventId?: string;
  name: string;
  phone: string;
  email: string;
  status: RegStatus;
  teamName: string | null;
  teamSize: number | null;
  foodPref: string | null;
  tshirtSize: string | null;
  callbackTime: number | null;
  notes: string | null;
  waitlistRank: number | null;
  updatedAt: number;
}

export interface Call {
  id: string; // document id = Bolna execution id
  registrantId: string;
  name: string;
  status: string; // raw Bolna status: queued | ringing | in-progress | completed | no-answer | busy | failed ...
  terminationReason: string | null;
  durationSec: number | null;
  transcript: string;
  extractedData: Record<string, unknown>;
  startedAt: number;
  promptVersion: string | null;
}

export type SeatEventType = 'seat_freed' | 'waitlist_called' | 'confirmed';

export interface SeatEvent {
  id: string;
  type: SeatEventType;
  fromRegistrantId: string | null;
  toRegistrantId: string | null;
  at: number;
}

export type Rating = 'good' | 'issue' | 'not_wanted';

export interface Feedback {
  id: string;
  executionId: string;
  rating: Rating;
  comment: string | null;
  promptVersion: string | null;
  at: number;
}

export interface PromptVersion {
  id: string;
  version: string;
  changeNote: string;
  appliedAt: number;
}

export type EventType = 'hackathon' | 'meetup' | 'workshop' | 'conference' | 'other';

/** What Ria is allowed to do for this event. */
export interface RiaJobs {
  confirmByCall: boolean;
  fillFromWaitlist: boolean;
  collectFoodTshirt: boolean;
  feedbackEmail: boolean;
}

export type QueueItemStatus = 'pending' | 'dialing' | 'active' | 'done' | 'failed' | 'skipped' | 'timeout';
export type QueueItemReason = 'launch' | 'waitlist_promotion' | 'call_now' | 'retry';

export interface CallQueueItem {
  id: string;
  eventId: string;
  registrantId: string;
  name: string;
  reason: QueueItemReason;
  priority: number;
  status: QueueItemStatus;
  attempts: number;
  notBeforeMs: number;
  createdAtMs: number;
  startedAtMs: number | null;
  executionId: string | null;
  error: string | null;
  updatedAt: number;
}

export interface EventConfig {
  id?: string;
  type: EventType;
  name: string;
  /** As the organizer typed it, or ISO from Luma. */
  date: string;
  venue: string;
  capacity: number;
  lumaUrl: string | null;
  enabled?: boolean;
  ria: RiaJobs;
}

/** A guest coming in from a CSV or typed by hand, before it becomes a registrant. */
export interface GuestInput {
  name: string;
  phone: string;
  email: string;
  teamName: string | null;
  foodPref: string | null;
  tshirtSize: string | null;
  status: 'registered' | 'waitlist';
}

export interface DataState {
  registrants: Registrant[];
  calls: Call[];
  callQueue: CallQueueItem[];
  seatEvents: SeatEvent[];
  feedback: Feedback[];
  promptVersions: PromptVersion[];
  /** The event being run; null until one is set up (Firestore) or the demo loads (mock). */
  event: EventConfig | null;
  ready: boolean;
  error: string | null;
  source: 'mock' | 'firestore';
}

export interface PlaceCallRequest {
  registrantId: string;
  reason: 'call_now' | 'retry';
  retryOfCallId?: string;
}

/** What both the mock and the Firestore backends provide to the data layer. */
export interface Source {
  stop(): void;
  placeCall(req: PlaceCallRequest): Promise<string>;
  promote(registrantId: string): Promise<void>;
  /** Save the event and its guests as the live event. */
  launch(event: EventConfig, guests: GuestInput[]): Promise<void>;
}

export type Emit = (patch: Partial<DataState>) => void;
