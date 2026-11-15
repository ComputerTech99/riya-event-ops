/** Field names follow the Ria schema exactly. Timestamps are normalised to epoch ms. */

export type RegStatus = 'registered' | 'waitlist' | 'confirmed' | 'maybe' | 'cancelled' | 'invited';

export interface Registrant {
  id: string;
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

export interface DataState {
  registrants: Registrant[];
  calls: Call[];
  seatEvents: SeatEvent[];
  feedback: Feedback[];
  promptVersions: PromptVersion[];
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
}

export type Emit = (patch: Partial<DataState>) => void;
