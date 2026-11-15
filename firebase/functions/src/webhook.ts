import { FieldValue } from "firebase-admin/firestore";
import { COL } from "./config";
import { firestore, refs } from "./db";
import { normaliseId } from "./logic";

/** Subset of Bolna's execution payload we rely on (see docs: post-call/execution-payload). */
export interface BolnaExecution {
  id?: string;
  agent_id?: string;
  batch_id?: string | null;
  status?: string;
  termination_reason?: string | null;
  error_message?: string | null;
  conversation_duration?: number | null;
  answered_by_voice_mail?: boolean | null;
  updated_at?: string | null;
  user_number?: string | null;
  transcript?: string | null;
  summary?: string | null;
  extracted_data?: Record<string, unknown> | string | null;
  total_cost?: number | null;
  telephony_data?: {
    duration?: number | string | null;
    to_number?: string | null;
    recording_url?: string | null;
    hangup_by?: string | null;
    hangup_reason?: string | null;
  } | null;
  context_details?: { recipient_phone_number?: string | null; recipient_data?: Record<string, unknown> | null } | null;
  [k: string]: unknown;
}

const MAX_RAW = 400_000;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function extracted(v: BolnaExecution["extracted_data"]): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === "string") {
    try { const o = JSON.parse(v); return o && typeof o === "object" ? o : { value: v }; } catch { return { value: v }; }
  }
  return v;
}

/** Pure mapping from Bolna's payload to our Calls document. */
export function mapExecution(p: BolnaExecution) {
  const tel = p.telephony_data ?? {};
  const recipient = p.context_details?.recipient_data ?? {};
  // Raw payload as a JSON string: Firestore rejects nested arrays, which Bolna logs can contain.
  let rawJson = JSON.stringify({ ...p, transcript: undefined, latency_data: undefined });
  if (rawJson.length > MAX_RAW) rawJson = rawJson.slice(0, MAX_RAW);
  return {
    executionId: String(p.id ?? ""),
    agentId: p.agent_id ?? null,
    batchId: p.batch_id ?? null,
    status: p.status ?? "unknown",
    terminationReason: p.termination_reason ?? tel.hangup_reason ?? null,
    hangupBy: tel.hangup_by ?? null,
    errorMessage: p.error_message ?? null,
    durationSec: num(p.conversation_duration) ?? num(tel.duration),
    answeredByVoicemail: p.answered_by_voice_mail ?? null,
    transcript: p.transcript ?? "",
    summary: p.summary ?? null,
    extractedData: extracted(p.extracted_data),
    recordingUrl: tel.recording_url ?? null,
    userNumber: p.user_number ?? tel.to_number ?? p.context_details?.recipient_phone_number ?? null,
    totalCost: num(p.total_cost),
    payloadUpdatedAt: p.updated_at ?? null,
    recipientRegistrantId: recipient.registrant_id ? normaliseId(recipient.registrant_id) : null,
    rawJson,
  };
}

function nonEmpty(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  const s = String(v).trim().toLowerCase();
  return s !== "" && s !== "none" && s !== "null" && s !== "n/a" && s !== "no";
}

export async function saveExecution(payload: BolnaExecution): Promise<{ executionId: string; registrantId: string | null }> {
  const m = mapExecution(payload);
  if (!m.executionId) throw new Error("Payload has no execution id.");
  const db = firestore();

  const registrantId = await db.runTransaction(async (tx) => {
    const ref = refs.call(m.executionId);
    const existing = await tx.get(ref);
    const prev = existing.data() ?? {};

    let regId: string | null = m.recipientRegistrantId ?? (prev.registrantId as string | undefined) ?? null;
    if (!regId && m.userNumber) {
      const q = await tx.get(db.collection(COL.registrants).where("phone", "==", m.userNumber).limit(1));
      regId = q.empty ? null : q.docs[0].id;
    }
    let eventId: string | null = (prev.eventId as string | undefined) ?? null;
    let regExists = false;
    if (regId) {
      const reg = await tx.get(refs.registrant(regId));
      regExists = reg.exists;
      if (reg.exists) eventId = eventId ?? (reg.get("eventId") as string | null) ?? null;
    }

    // Bolna fires on every status change; deliveries can arrive out of order.
    const stale = !!(prev.payloadUpdatedAt && m.payloadUpdatedAt && String(prev.payloadUpdatedAt) > m.payloadUpdatedAt);
    const { recipientRegistrantId: _ignored, ...fields } = m;
    const history = FieldValue.arrayUnion({ status: m.status, at: m.payloadUpdatedAt ?? new Date().toISOString() });
    const now = FieldValue.serverTimestamp();

    if (stale) {
      tx.set(ref, { statusHistory: history, updatedAt: now }, { merge: true });
    } else {
      tx.set(ref, {
        ...fields,
        registrantId: regId,
        eventId,
        statusHistory: history,
        ...(existing.exists ? {} : { createdAt: now }),
        updatedAt: now,
      }, { merge: true });
      if (regId && regExists) {
        tx.update(refs.registrant(regId), {
          lastCall: { executionId: m.executionId, status: m.status, terminationReason: m.terminationReason, durationSec: m.durationSec, at: new Date().toISOString() },
        });
      }
    }

    const fb = m.extractedData.feedback;
    const questions = m.extractedData.caller_questions;
    if (!stale && (nonEmpty(fb) || nonEmpty(questions))) {
      tx.set(refs.feedback(m.executionId), {
        executionId: m.executionId,
        registrantId: regId,
        eventId,
        feedback: nonEmpty(fb) ? fb : null,
        callerQuestions: nonEmpty(questions) ? questions : null,
        createdAt: now,
      }, { merge: true });
    }
    return regId;
  });

  return { executionId: m.executionId, registrantId };
}
