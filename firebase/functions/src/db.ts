import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { COL } from "./config";
import { DEFAULT_MAX_TEAM_SIZE, type EventInfo, type Registrant, type Status } from "./logic";

let db: Firestore | null = null;

export function firestore(): Firestore {
  if (!db) {
    if (!getApps().length) initializeApp();
    db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

const STATUSES: Status[] = ["registered", "confirmed", "maybe", "declined", "waitlist", "cancelled"];

export function registrantFrom(snap: DocumentSnapshot): Registrant {
  const d = snap.data() ?? {};
  const status = STATUSES.includes(d.status) ? (d.status as Status) : "registered";
  return {
    id: snap.id,
    eventId: String(d.eventId ?? ""),
    name: String(d.name ?? ""),
    phone: String(d.phone ?? ""),
    status,
    teamName: d.teamName || null,
    teamSize: typeof d.teamSize === "number" ? d.teamSize : null,
    foodPref: d.foodPref || null,
    tshirtSize: d.tshirtSize || null,
    notes: Array.isArray(d.notes) ? d.notes : [],
    waitlistRank: typeof d.waitlistRank === "number" ? d.waitlistRank : null,
    callbackTime: d.callbackTime || null,
    language: d.language || null,
  };
}

export function eventFrom(snap: DocumentSnapshot): EventInfo {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    name: String(d.name ?? ""),
    date: String(d.date ?? ""),
    startAt: typeof d.startAt === "string" ? d.startAt : null,
    timezone: String(d.timezone ?? "Asia/Kolkata"),
    venue: String(d.venue ?? ""),
    fullAddress: typeof d.fullAddress === "string" ? d.fullAddress : null,
    capacity: Number(d.capacity ?? 0),
    maxTeamSize: Number(d.maxTeamSize ?? DEFAULT_MAX_TEAM_SIZE),
    enabled: d.enabled === true,
  };
}

export const refs = {
  registrant: (id: string) => firestore().collection(COL.registrants).doc(id),
  event: (id: string) => firestore().collection(COL.events).doc(id || "_none"),
  seats: (eventId: string) => firestore().collection(COL.seats).doc(eventId || "_none"),
  call: (executionId: string) => firestore().collection(COL.calls).doc(executionId),
  feedback: (id: string) => firestore().collection(COL.feedback).doc(id),
  waitlist: (eventId: string) =>
    firestore().collection(COL.registrants).where("eventId", "==", eventId).where("status", "==", "waitlist"),
};
