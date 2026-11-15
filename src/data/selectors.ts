import { startOfDay } from '../lib/format';
import { outcomeOf, type Outcome } from './normalize';
import type { Call, Feedback, PromptVersion, Registrant, RegStatus } from './types';

export function callStats(calls: Call[], now: number) {
  const sod = startOfDay(now);
  const today = calls.filter((c) => c.startedAt >= sod);
  const by = (o: Outcome) => today.filter((c) => outcomeOf(c) === o).length;
  const connected = by('connected');
  const failed = by('no_answer') + by('busy') + by('failed');
  const live = calls.filter((c) => outcomeOf(c) === 'live');
  const done = connected + failed;
  return {
    today: today.length,
    connected,
    failed,
    live,
    connectRate: done ? Math.round((connected / done) * 100) : 0,
  };
}

export function seatSplit(registrants: Registrant[], capacity: number) {
  const n = (s: RegStatus) => registrants.filter((r) => r.status === s).length;
  const confirmed = n('confirmed');
  const maybe = n('maybe') + n('invited');
  const cancelled = n('cancelled') + n('declined');
  const empty = Math.max(0, capacity - confirmed - maybe - cancelled);
  return { confirmed, maybe, cancelled, empty, capacity };
}

export function latestCallBy(calls: Call[]) {
  const m = new Map<string, Call>();
  for (const c of calls) {
    const prev = m.get(c.registrantId);
    if (!prev || c.startedAt > prev.startedAt) m.set(c.registrantId, c);
  }
  return m;
}

export const waitlistQueue = (registrants: Registrant[]) =>
  registrants
    .filter((r) => r.status === 'waitlist')
    .sort((a, b) => (a.waitlistRank ?? 999) - (b.waitlistRank ?? 999));

const CLOSED: RegStatus[] = ['confirmed', 'cancelled', 'declined'];

export function inbox(registrants: Registrant[], calls: Call[], now: number) {
  const callbacks = registrants
    .filter((r) => r.callbackTime != null && !CLOSED.includes(r.status) && r.callbackTime <= now + 3 * 3600_000)
    .sort((a, b) => (a.callbackTime ?? 0) - (b.callbackTime ?? 0));

  const escalations = calls
    .filter((c) => typeof c.extractedData.escalation === 'string' && c.extractedData.escalation)
    .sort((a, b) => b.startedAt - a.startedAt);

  const groups = new Map<string, { question: string; count: number; last: number; callIds: string[]; names: string[] }>();
  for (const c of calls) {
    const qs = c.extractedData.caller_questions ?? c.extractedData.unanswered_questions;
    for (const q of Array.isArray(qs) ? qs : typeof qs === 'string' && qs ? [qs] : []) {
      const key = String(q).trim().toLowerCase().replace(/[?.!\s]+$/, '');
      const g = groups.get(key) ?? { question: String(q).trim(), count: 0, last: 0, callIds: [], names: [] };
      g.count += 1;
      g.last = Math.max(g.last, c.startedAt);
      g.callIds.push(c.id);
      if (!g.names.includes(c.name)) g.names.push(c.name);
      groups.set(key, g);
    }
  }
  const questions = [...groups.values()].sort((a, b) => b.count - a.count || b.last - a.last);
  return { callbacks, escalations, questions, total: callbacks.length + escalations.length + questions.length };
}

export function tally(rows: Registrant[], field: 'foodPref' | 'tshirtSize', order: string[]) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = (r[field] ?? 'unknown').toString();
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const keys = [...m.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return keys.map((k) => ({ key: k, count: m.get(k)! }));
}

export function ratingsByVersion(feedback: Feedback[], versions: PromptVersion[]) {
  const names = new Set([...versions.map((v) => v.version), ...feedback.map((f) => f.promptVersion ?? 'unknown')]);
  return [...names]
    .map((version) => {
      const rows = feedback.filter((f) => (f.promptVersion ?? 'unknown') === version);
      const good = rows.filter((f) => f.rating === 'good').length;
      const issue = rows.filter((f) => f.rating === 'issue').length;
      const notWanted = rows.length - good - issue;
      const rated = good + issue;
      const meta = versions.find((v) => v.version === version);
      return {
        version,
        changeNote: meta?.changeNote ?? '',
        appliedAt: meta?.appliedAt ?? 0,
        n: rows.length,
        good,
        issue,
        notWanted,
        /** good = 1, issue = 0; "not wanted" is about the call, not the prompt, so it's left out. */
        avg: rated ? good / rated : null,
      };
    })
    .sort((a, b) => b.appliedAt - a.appliedAt);
}

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function headcountCsv(rows: Registrant[]) {
  const head = ['name', 'email', 'phone', 'status', 'teamName', 'teamSize', 'foodPref', 'tshirtSize'];
  return [head.join(','), ...rows.map((r) => head.map((h) => esc(r[h as keyof Registrant])).join(','))].join('\n');
}
