/**
 * Pure business rules (no Firestore), ported from the Apps Script backend.
 * Everything here is unit-tested in test/logic.test.ts.
 */

export type Status = "registered" | "confirmed" | "maybe" | "declined" | "waitlist" | "cancelled";

export interface Note { at: string; text: string }

export interface Registrant {
  id: string;
  eventId: string;
  name: string;
  phone: string;
  status: Status;
  teamName: string | null;
  teamSize: number | null;
  foodPref: string | null;
  tshirtSize: string | null;
  notes: Note[];
  waitlistRank: number | null;
  callbackTime: string | null;
  /** Preferred call language: "kannada" or "english". */
  language: string | null;
}

export interface EventInfo {
  id: string;
  /** Full event name, spoken by Riya as {event_name}. */
  name: string;
  /** Local event date "YYYY-MM-DD" (legacy: free text, spoken as-is). */
  date: string;
  /** ISO start instant, if known (e.g. from Luma). */
  startAt: string | null;
  /** IANA timezone of the event. */
  timezone: string;
  /** Short, speakable venue, spoken as {venue}. */
  venue: string;
  fullAddress: string | null;
  capacity: number;
  maxTeamSize: number;
  /** Master switch: launch and the dialer only call guests of enabled events. */
  enabled: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-12-13" → "Saturday, 13 December 2026" (in the event's timezone). Free text passes through. */
export function spokenDate(e: Pick<EventInfo, "date" | "startAt" | "timezone">): string {
  const tz = e.timezone || "Asia/Kolkata";
  let instant: Date | null = null;
  if (e.startAt && !Number.isNaN(Date.parse(e.startAt))) instant = new Date(e.startAt);
  else if (ISO_DATE.test(e.date)) instant = new Date(`${e.date}T12:00:00Z`);
  if (!instant) return e.date;
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ISO_DATE.test(e.date) && !e.startAt ? "UTC" : tz,
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")}`;
}

/** Riya's five call variables, derived from the registrant and their event. */
export function callVariables(r: Pick<Registrant, "id" | "name">, e: EventInfo | null): Record<string, string> {
  return {
    name: r.name,
    registrant_id: r.id,
    event_name: e?.name ?? "",
    event_date: e ? spokenDate(e) : "",
    venue: e?.venue ?? "",
  };
}

/** Agent-facing field names (snake_case, as in the tool schema) → Firestore fields. */
export const FIELD_TO_DOC = {
  status: "status",
  team_name: "teamName",
  team_size: "teamSize",
  food_pref: "foodPref",
  tshirt_size: "tshirtSize",
  notes: "notes",
  callback_time: "callbackTime",
  language: "language",
} as const;
export type AgentField = keyof typeof FIELD_TO_DOC;

/** Questions Riya asks, in call-flow order. */
export const QUESTION_FIELDS = ["status", "team_name", "team_size", "food_pref", "tshirt_size"] as const;

export const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
export const DEFAULT_MAX_TEAM_SIZE = 4;

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export function normaliseId(id: unknown): string {
  return String(id ?? "").trim().toUpperCase();
}

export function isAgentField(f: string): f is AgentField {
  return Object.prototype.hasOwnProperty.call(FIELD_TO_DOC, f);
}

export function normalise(field: AgentField, raw: unknown, maxTeamSize = DEFAULT_MAX_TEAM_SIZE): Result<string | number> {
  const v = String(raw ?? "").trim();
  if (!v) return { ok: false, message: "Value is empty. Ask the caller again." };
  const low = v.toLowerCase();
  switch (field) {
    case "status": {
      const map: Record<string, Status> = {
        yes: "confirmed", confirmed: "confirmed", attending: "confirmed",
        maybe: "maybe", no: "declined", declined: "declined", registered: "registered",
        // Kannada
        "ಹೌದು": "confirmed", "ಬರ್ತೀನಿ": "confirmed", "ಬರುತ್ತೇನೆ": "confirmed",
        "ಬಹುಶಃ": "maybe", "ಗೊತ್ತಿಲ್ಲ": "maybe", "ಇಲ್ಲ": "declined", "ಬರಲ್ಲ": "declined",
      };
      const s = map[low];
      return s ? { ok: true, value: s } : { ok: false, message: "Status must be confirmed, maybe or declined." };
    }
    case "food_pref": {
      const f = low.replace(/[\s_]+/g, "-");
      const map: Record<string, string> = {
        veg: "veg", vegetarian: "veg", "non-veg": "non-veg", nonveg: "non-veg",
        "non-vegetarian": "non-veg", jain: "jain",
        // Kannada
        "ಸಸ್ಯಾಹಾರ": "veg", "ವೆಜ್": "veg", "ಮಾಂಸಾಹಾರ": "non-veg", "ನಾನ್-ವೆಜ್": "non-veg", "ಜೈನ್": "jain",
      };
      return map[f] ? { ok: true, value: map[f] } : { ok: false, message: "Food preference must be veg, non-veg or jain." };
    }
    case "tshirt_size": {
      const words: Record<string, string> = { EXTRALARGE: "XL", LARGE: "L", MEDIUM: "M", SMALL: "S", "2XL": "XXL", EXTRASMALL: "XS" };
      const compact = v.toUpperCase().replace(/[\s-]+/g, "");
      const s = words[compact] ?? compact;
      return TSHIRT_SIZES.includes(s)
        ? { ok: true, value: s }
        : { ok: false, message: `T-shirt size must be one of ${TSHIRT_SIZES.join(", ")}.` };
    }
    case "team_size": {
      const words: Record<string, number> = {
        one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, solo: 1,
        "ಒಂದು": 1, "ಒಬ್ಬ": 1, "ಎರಡು": 2, "ಇಬ್ಬರು": 2, "ಮೂರು": 3, "ಮೂವರು": 3, "ನಾಲ್ಕು": 4, "ನಾಲ್ವರು": 4, "ಐದು": 5, "ಆರು": 6,
      };
      const n = words[low] ?? parseInt(v, 10);
      if (!Number.isFinite(n) || n < 1) return { ok: false, message: `Team size must be a number from 1 to ${maxTeamSize}.` };
      if (n > maxTeamSize) {
        return {
          ok: false,
          message: `Teams can have at most ${maxTeamSize} members. Politely tell the caller and ask which ${maxTeamSize} will attend.`,
        };
      }
      return { ok: true, value: n };
    }
    case "language": {
      const map: Record<string, string> = {
        kannada: "kannada", kn: "kannada", "ಕನ್ನಡ": "kannada",
        english: "english", en: "english", "ಇಂಗ್ಲಿಷ್": "english", "ಇಂಗ್ಲೀಷ್": "english",
      };
      return map[low] ? { ok: true, value: map[low] } : { ok: false, message: "Language must be kannada or english." };
    }
    default:
      return { ok: true, value: v };
  }
}

/** What Riya already knows vs. still has to ask. */
export function summarise(r: Registrant) {
  const answered: Record<(typeof QUESTION_FIELDS)[number], boolean> = {
    status: r.status === "confirmed",
    team_name: !!r.teamName,
    team_size: r.teamSize != null,
    food_pref: !!r.foodPref,
    tshirt_size: !!r.tshirtSize,
  };
  const note =
    r.status === "cancelled" ? "This person previously cancelled and their seat was released."
    : r.status === "waitlist" ? `This person is on the waitlist at rank ${r.waitlistRank}.`
    : "";
  return {
    already_known: QUESTION_FIELDS.filter((f) => answered[f]),
    still_needed: QUESTION_FIELDS.filter((f) => !answered[f]),
    note,
  };
}

/** The registrant as the agent sees it: no phone number. */
export function agentView(r: Registrant) {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    team_name: r.teamName ?? "",
    team_size: r.teamSize ?? "",
    food_pref: r.foodPref ?? "",
    tshirt_size: r.tshirtSize ?? "",
    callback_time: r.callbackTime ?? "",
    language: r.language ?? "",
    waitlist_rank: r.waitlistRank ?? "",
    notes: r.notes.map((n) => n.text).join(" | "),
  };
}

export interface ReleasePlan {
  alreadyCancelled: boolean;
  wasWaitlisted: boolean;
  promotedId: string | null;
  /** New ranks for everyone still on the waitlist (1..n). */
  renumber: { id: string; rank: number }[];
}

/**
 * Decide what release_seat does. `waitlist` is everyone in the event with
 * status "waitlist" (any order; sorted here by rank, unranked last).
 */
export function planRelease(target: Registrant, waitlist: Registrant[]): ReleasePlan {
  if (target.status === "cancelled") {
    return { alreadyCancelled: true, wasWaitlisted: false, promotedId: null, renumber: [] };
  }
  const queue = waitlist
    .filter((r) => r.id !== target.id)
    .sort((a, b) => (a.waitlistRank ?? Infinity) - (b.waitlistRank ?? Infinity));
  const wasWaitlisted = target.status === "waitlist";
  // A waitlisted person leaving frees no seat; anyone else's seat goes to the head of the queue.
  const promoted = wasWaitlisted ? null : queue.shift() ?? null;
  return {
    alreadyCancelled: false,
    wasWaitlisted,
    promotedId: promoted?.id ?? null,
    renumber: queue.map((r, i) => ({ id: r.id, rank: i + 1 })),
  };
}

export function nextWaitlistRank(waitlist: Registrant[]): number {
  return waitlist.reduce((m, r) => Math.max(m, r.waitlistRank ?? 0), 0) + 1;
}
