/**
 * In-memory stand-in for Firestore. Seeds a realistic event and keeps it moving:
 * Ria works the waitlist on her own, calls progress line by line, and "Call now",
 * "Retry" and "Promote" behave the way the real backend will.
 */
import { EVENT_NAME, SEAT_CAPACITY } from './config';
import type {
  Call, Emit, Feedback, PlaceCallRequest, PromptVersion, Rating, Registrant, RegStatus, SeatEvent, Source,
} from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  'Aarav Sharma', 'Diya Patel', 'Kabir Singh', 'Ananya Iyer', 'Vihaan Gupta', 'Meera Nair', 'Arjun Reddy',
  'Ishita Banerjee', 'Rohan Mehta', 'Saanvi Kulkarni', 'Aditya Rao', 'Kavya Menon', 'Reyansh Joshi',
  'Tara Chatterjee', 'Vivaan Desai', 'Nisha Pillai', 'Dev Malhotra', 'Riya Kapoor', 'Arnav Bhat',
  'Pooja Hegde', 'Siddharth Jain', 'Aisha Khan', 'Karan Verma', 'Zoya Siddiqui', 'Nikhil Agarwal',
  'Shreya Ghosh', 'Yash Thakur', 'Lavanya Krishnan', 'Om Prakash', 'Fatima Sheikh', 'Harsh Vardhan',
  'Neha Saxena', 'Rahul Dutta', 'Simran Kaur', 'Varun Shetty', 'Anjali Mishra', 'Ayaan Qureshi',
  'Bhavya Choudhary', 'Manav Sinha', 'Trisha Das', 'Samar Bose', 'Gauri Pandey', 'Kunal Bajaj',
  'Rhea Fernandes', 'Ishaan Trivedi', 'Mahika Arora', 'Parth Sethi', 'Esha Venkatesh',
];
const TEAMS = [
  'Null Pointers', 'Byte Busters', 'Segfault Society', 'Kernel Panic', 'Merge Conflict', 'Stack Smashers',
  'Async Avengers', 'Off By One', 'Hot Reload', 'Lazy Loaders', 'Root Access', 'Race Conditions',
];
const FOOD = ['veg', 'veg', 'veg', 'non-veg', 'non-veg', 'jain', 'vegan'];
const SIZES = ['XS', 'S', 'M', 'M', 'L', 'L', 'XL', 'XXL'];
const QUESTIONS: [string, number][] = [
  ['Is there parking at the venue?', 4],
  ['Will travel be reimbursed for outstation teams?', 3],
  ['Can we bring our own hardware kits?', 2],
  ['What time does check-in close on day one?', 2],
  ['Is there a place to sleep overnight?', 1],
];
const ISSUES = [
  'Talked over me while I was answering.',
  'Asked about food twice.',
  'Mispronounced my name.',
  'Long pause before replying.',
  'Did not understand "XL".',
];

/** Status mix: 48 people for 40 seats. */
const PLAN: RegStatus[] = [
  ...Array<RegStatus>(22).fill('confirmed'),
  ...Array<RegStatus>(5).fill('maybe'),
  ...Array<RegStatus>(4).fill('cancelled'),
  ...Array<RegStatus>(2).fill('invited'),
  ...Array<RegStatus>(6).fill('registered'),
  ...Array<RegStatus>(9).fill('waitlist'),
];

interface Plan { outcome: 'confirm' | 'maybe' | 'cancel' | 'no_answer' | 'busy'; lines: string[]; lengthSec: number }

export function createMockSource(emit: Emit): Source {
  const rnd = mulberry32(20261115);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const now0 = Date.now();

  const versions: PromptVersion[] = [
    { id: 'v1', version: 'v1', changeNote: 'First script: confirm, food, T-shirt.', appliedAt: now0 - 4 * 24 * HOUR },
    { id: 'v2', version: 'v2', changeNote: 'Ask team size before food so totals add up.', appliedAt: now0 - 2 * 24 * HOUR },
    { id: 'v3', version: 'v3', changeNote: 'Wait 600 ms before replying; stop talking over callers.', appliedAt: now0 - 26 * HOUR },
    { id: 'v4', version: 'v4', changeNote: 'Repeat T-shirt size back; log unknown questions instead of guessing.', appliedAt: now0 - 5 * HOUR },
  ];
  const versionAt = (t: number) => [...versions].reverse().find((v) => v.appliedAt <= t)?.version ?? 'v1';

  // ---- registrants ---------------------------------------------------------
  let waitRank = 0;
  const registrants: Registrant[] = NAMES.map((name, i) => {
    const status = PLAN[i];
    const [first, last] = name.toLowerCase().split(' ');
    const team = status === 'confirmed' || status === 'maybe' || rnd() > 0.5 ? pick(TEAMS) : null;
    const r: Registrant = {
      id: `R${String(i + 1).padStart(3, '0')}`,
      name,
      phone: `+91${pick(['98', '97', '91', '88', '70', '63'])}${String(between(10_000_000, 99_999_999))}`,
      email: `${first}.${last}${rnd() > 0.6 ? between(1, 99) : ''}@${pick(['gmail.com', 'gmail.com', 'outlook.com', 'iitb.ac.in', 'bits-pilani.ac.in'])}`,
      status,
      teamName: team,
      teamSize: team ? between(2, 4) : null,
      foodPref: status === 'confirmed' || rnd() > 0.6 ? pick(FOOD) : null,
      tshirtSize: status === 'confirmed' ? pick(SIZES) : null,
      callbackTime: null,
      notes: null,
      waitlistRank: null,
      updatedAt: now0 - between(20, 600) * MIN,
    };
    if (status === 'waitlist') {
      r.waitlistRank = ++waitRank;
      r.updatedAt = now0 - ((11 - waitRank) * 170 + between(0, 40)) * MIN;
    }
    return r;
  });
  const byStatus = (s: RegStatus) => registrants.filter((r) => r.status === s);
  const maybes = byStatus('maybe');
  // callbacks: two overdue, two coming up, one tomorrow
  [-42 * MIN, -8 * MIN, 35 * MIN, 95 * MIN, 22 * HOUR].forEach((d, i) => {
    maybes[i].callbackTime = now0 + d;
    maybes[i].notes = ['Will know after exams on 5 Dec.', 'Checking with teammate on dates.', 'Asked to call after 6 pm.', 'Depends on college leave approval.', 'Waiting on train ticket.'][i];
  });
  byStatus('cancelled').forEach((r, i) => {
    r.notes = ['Clashes with an internship interview.', 'Fell sick.', 'Team split up.', 'Travel too expensive.'][i];
  });
  byStatus('registered').slice(0, 2).forEach((r, i) => {
    r.callbackTime = now0 + [-20 * MIN, 50 * MIN][i];
    r.notes = 'Missed the first call; asked for a callback by SMS.';
  });

  // ---- calls ---------------------------------------------------------------
  const calls: Call[] = [];
  const questionPool: string[] = QUESTIONS.flatMap(([q, n]) => Array<string>(n).fill(q));
  let callSeq = 0;
  const newId = () => `exec_${(0x5a3f00 + ++callSeq * 977).toString(16)}${Math.floor(rnd() * 1e6).toString(36)}`;

  function lines(r: Registrant, kind: Plan['outcome'], question?: string): string[] {
    const f = r.name.split(' ')[0];
    const open = [
      `assistant: Hi, am I speaking with ${f}? This is Ria from the ${EVENT_NAME} organising team.`,
      'user: Yes, speaking.',
    ];
    const q = question
      ? [`user: One question, ${question.charAt(0).toLowerCase()}${question.slice(1)}`,
         "assistant: I don't have that detail yet. I've noted it, and an organiser will get back to you today."]
      : [];
    if (kind === 'confirm') {
      return [
        ...open,
        `assistant: I'm calling to confirm your seat for ${EVENT_NAME} on the 6th and 7th of December. Will you be joining us?`,
        `user: Yes, we're coming${r.teamName ? `, team ${r.teamName}` : ''}.`,
        'assistant: Great. How many people are on your team?',
        `user: ${r.teamSize ?? 1}.`,
        'assistant: Any food preference I should note? Veg, non-veg, Jain or vegan?',
        `user: ${r.foodPref ?? 'veg'}, please.`,
        'assistant: And your T-shirt size?',
        `user: ${r.tshirtSize ?? 'M'}.`,
        `assistant: That's ${r.tshirtSize ?? 'M'}, noted.`,
        ...q,
        "assistant: You're confirmed. Check-in details will reach you by email. See you there!",
      ];
    }
    if (kind === 'maybe') {
      return [
        ...open,
        `assistant: I'm calling to confirm your seat for ${EVENT_NAME}. Will you be joining us?`,
        "user: I'm not sure yet, it depends on my exams.",
        'assistant: No problem. When would be a good time to call back?',
        'user: Maybe tomorrow evening?',
        "assistant: I'll call you back tomorrow evening. Your seat is held until then.",
        ...q,
      ];
    }
    if (kind === 'cancel') {
      return [
        ...open,
        `assistant: I'm calling to confirm your seat for ${EVENT_NAME}. Will you be joining us?`,
        "user: Sorry, I can't make it anymore.",
        "assistant: Thanks for letting us know. I'll release your seat so someone on the waitlist can take it.",
        ...q,
        'user: Thank you.',
      ];
    }
    return [];
  }

  function addCall(r: Registrant, at: number, kind: Plan['outcome'], extra: Record<string, unknown> = {}, question?: string) {
    const connected = kind === 'confirm' || kind === 'maybe' || kind === 'cancel';
    const extractedData: Record<string, unknown> = {};
    if (kind === 'confirm') Object.assign(extractedData, { intent: 'confirmed', team_size: r.teamSize ?? 1, food_pref: r.foodPref, tshirt_size: r.tshirtSize, team_name: r.teamName });
    if (kind === 'maybe') Object.assign(extractedData, { intent: 'maybe', callback_time: r.callbackTime ? new Date(r.callbackTime).toISOString() : null });
    if (kind === 'cancel') Object.assign(extractedData, { intent: 'cancelled', reason: r.notes });
    if (question) extractedData.caller_questions = [question];
    Object.assign(extractedData, extra);
    const c: Call = {
      id: newId(),
      registrantId: r.id,
      name: r.name,
      status: connected ? 'completed' : kind === 'busy' ? 'busy' : rnd() > 0.85 ? 'failed' : 'no-answer',
      terminationReason: connected ? pick(['call-ended-by-user', 'agent-hangup']) : kind === 'busy' ? 'user-busy' : 'no-answer',
      durationSec: connected ? between(48, 170) : 0,
      transcript: connected ? lines(r, kind, question).join('\n') : '',
      extractedData: connected ? extractedData : {},
      startedAt: at,
      promptVersion: versionAt(at),
    };
    if (c.status === 'failed') c.terminationReason = pick(['sip-error', 'invalid-number', 'carrier-rejected']);
    calls.push(c);
    return c;
  }

  const takeQ = () => (questionPool.length && rnd() > 0.45 ? questionPool.pop() : undefined);
  const todayAt = () => now0 - between(12, 7 * 60) * MIN;
  const yesterdayAt = () => now0 - between(18 * 60, 30 * 60) * MIN;

  byStatus('confirmed').forEach((r) => {
    const at = rnd() > 0.4 ? todayAt() : yesterdayAt();
    if (rnd() > 0.7) addCall(r, at - between(60, 180) * MIN, 'no_answer');
    addCall(r, at, 'confirm', {}, takeQ());
  });
  maybes.forEach((r, i) =>
    addCall(r, todayAt(), 'maybe', i === 1 ? { escalation: 'Wants an organiser to confirm travel reimbursement before committing.' } : {}, takeQ()));
  byStatus('cancelled').forEach((r, i) =>
    addCall(r, todayAt(), 'cancel', i === 0 ? { escalation: 'Asked about getting the registration fee refunded.' } : {}, takeQ()));
  byStatus('invited').forEach((r) => addCall(r, todayAt(), 'no_answer'));
  byStatus('registered').forEach((r, i) => {
    addCall(r, todayAt(), i % 3 === 1 ? 'busy' : 'no_answer');
    if (i < 2) addCall(r, todayAt(), 'no_answer');
  });
  const firstConfirmed = byStatus('confirmed')[0];
  addCall(firstConfirmed, todayAt(), 'confirm', { escalation: 'Teammate uses a wheelchair; needs step-free access confirmed.' });
  while (questionPool.length) addCall(pick(byStatus('confirmed')), todayAt(), 'confirm', {}, questionPool.pop());
  byStatus('waitlist').slice(3, 5).forEach((r) => addCall(r, todayAt(), 'no_answer'));

  // ---- feedback ------------------------------------------------------------
  const goodRate: Record<string, number> = { v1: 0.52, v2: 0.63, v3: 0.74, v4: 0.86 };
  const feedback: Feedback[] = [];
  const rate = (v: string): Rating => {
    const x = rnd();
    if (x < goodRate[v]) return 'good';
    return x < goodRate[v] + (1 - goodRate[v]) * 0.75 ? 'issue' : 'not_wanted';
  };
  const addFeedback = (executionId: string, v: string, at: number) => {
    const rating = rate(v);
    feedback.push({
      id: `fb_${feedback.length + 1}`,
      executionId,
      rating,
      comment: rating === 'issue' ? pick(ISSUES) : rating === 'not_wanted' ? 'Would have preferred an email.' : rnd() > 0.6 ? 'Quick and clear.' : null,
      promptVersion: v,
      at: at + between(2, 30) * MIN,
    });
  };
  calls.filter((c) => c.status === 'completed' && rnd() > 0.3).forEach((c) => addFeedback(c.id, c.promptVersion ?? 'v1', c.startedAt));
  // older batches that ran before today's data
  for (const [v, n] of [['v1', 18], ['v2', 21], ['v3', 9]] as const) {
    const base = versions.find((x) => x.version === v)!.appliedAt;
    for (let i = 0; i < n; i++) addFeedback(`exec_hist_${v}_${i}`, v, base + between(10, 600) * MIN);
  }

  // ---- seat events ---------------------------------------------------------
  const seatEvents: SeatEvent[] = [];
  let seatSeq = 0;
  const addSeat = (type: SeatEvent['type'], from: string | null, to: string | null, at: number) =>
    seatEvents.push({ id: `se_${++seatSeq}`, type, fromRegistrantId: from, toRegistrantId: to, at });
  const cancelled = byStatus('cancelled');
  const invited = byStatus('invited');
  const promotedConfirmed = byStatus('confirmed').slice(-2);
  cancelled.forEach((r, i) => {
    const at = now0 - (6 - i) * 52 * MIN;
    addSeat('seat_freed', r.id, null, at);
    const to = invited[i] ?? promotedConfirmed[i - invited.length];
    if (to) {
      addSeat('waitlist_called', r.id, to.id, at + 2 * MIN);
      if (to.status === 'confirmed') addSeat('confirmed', r.id, to.id, at + 9 * MIN);
    }
  });
  byStatus('confirmed').slice(0, 5).forEach((r) => addSeat('confirmed', null, r.id, todayAt()));

  // ---- live simulation -----------------------------------------------------
  const plans = new Map<string, Plan>();
  let idleSince = now0 - 20_000;

  function rerank() {
    registrants
      .filter((r) => r.status === 'waitlist')
      .sort((a, b) => (a.waitlistRank ?? 999) - (b.waitlistRank ?? 999))
      .forEach((r, i) => { r.waitlistRank = i + 1; });
  }

  function startCall(r: Registrant, outcome?: Plan['outcome'], at = Date.now()): Call {
    const o = outcome ?? (() => {
      const x = rnd();
      return x < 0.55 ? 'confirm' : x < 0.72 ? 'no_answer' : x < 0.84 ? 'maybe' : x < 0.92 ? 'busy' : 'cancel';
    })();
    if (o === 'confirm') {
      r.teamName ??= pick(TEAMS);
      r.teamSize ??= between(2, 4);
      r.foodPref ??= pick(FOOD);
      r.tshirtSize ??= pick(SIZES);
    }
    const c: Call = {
      id: newId(), registrantId: r.id, name: r.name, status: 'ringing', terminationReason: null,
      durationSec: 0, transcript: '', extractedData: {}, startedAt: at, promptVersion: versionAt(at),
    };
    const ls = lines(r, o);
    plans.set(c.id, { outcome: o, lines: ls, lengthSec: o === 'no_answer' || o === 'busy' ? 26 : 8 + ls.length * 5 });
    calls.push(c);
    if (r.status === 'waitlist') addSeat('waitlist_called', null, r.id, at);
    return c;
  }

  function finish(c: Call, p: Plan, now: number) {
    const r = registrants.find((x) => x.id === c.registrantId);
    const connected = p.outcome !== 'no_answer' && p.outcome !== 'busy';
    c.status = connected ? 'completed' : p.outcome === 'busy' ? 'busy' : 'no-answer';
    c.terminationReason = connected ? 'call-ended-by-user' : p.outcome === 'busy' ? 'user-busy' : 'no-answer';
    c.durationSec = connected ? p.lengthSec - 6 : 0;
    c.transcript = connected ? p.lines.join('\n') : '';
    plans.delete(c.id);
    idleSince = now;
    if (!r || !connected) return;
    r.updatedAt = now;
    if (p.outcome === 'confirm') {
      const wasWait = r.status === 'waitlist' || r.status === 'invited';
      c.extractedData = { intent: 'confirmed', team_size: r.teamSize, food_pref: r.foodPref, tshirt_size: r.tshirtSize, team_name: r.teamName };
      r.status = 'confirmed';
      r.waitlistRank = null;
      addSeat('confirmed', null, r.id, now);
      if (wasWait) rerank();
      if (rnd() > 0.4) addFeedback(c.id, c.promptVersion ?? 'v4', now);
    } else if (p.outcome === 'maybe') {
      r.status = 'maybe';
      r.callbackTime = now + 20 * HOUR;
      c.extractedData = { intent: 'maybe', callback_time: new Date(r.callbackTime).toISOString() };
    } else {
      const held = r.status !== 'waitlist';
      r.status = 'cancelled';
      r.waitlistRank = null;
      c.extractedData = { intent: 'cancelled', reason: 'Plans changed.' };
      if (held) addSeat('seat_freed', r.id, null, now);
      rerank();
    }
  }

  function tick() {
    const now = Date.now();
    for (const c of calls) {
      const p = plans.get(c.id);
      if (!p) continue;
      const age = (now - c.startedAt) / 1000;
      if (age >= p.lengthSec) { finish(c, p, now); continue; }
      if (p.outcome === 'no_answer' || p.outcome === 'busy') continue; // rings out
      if (age > 5) {
        c.status = 'in-progress';
        c.durationSec = Math.floor(age - 5);
        c.transcript = p.lines.slice(0, Math.min(p.lines.length, 1 + Math.floor((age - 5) / 4.5))).join('\n');
      }
    }
    // Ria works the list herself: waitlist while seats are open, then uncalled registrants.
    if (plans.size === 0 && now - idleSince > 14_000) {
      const held = registrants.filter((r) => ['confirmed', 'maybe', 'invited'].includes(r.status)).length;
      const next =
        (held < SEAT_CAPACITY ? registrants.filter((r) => r.status === 'waitlist').sort((a, b) => (a.waitlistRank ?? 0) - (b.waitlistRank ?? 0))[0] : undefined) ??
        registrants.find((r) => r.status === 'registered');
      if (next) startCall(next);
      else idleSince = now;
    }
    push();
  }

  const push = () =>
    emit({
      registrants: registrants.map((r) => ({ ...r })),
      calls: calls.map((c) => ({ ...c })).sort((a, b) => b.startedAt - a.startedAt),
      seatEvents: [...seatEvents].sort((a, b) => b.at - a.at),
      feedback: [...feedback],
      promptVersions: [...versions].sort((a, b) => b.appliedAt - a.appliedAt),
      ready: true,
      error: null,
    });

  // one call is already on the line when the board opens
  startCall(byStatus('waitlist')[0], 'confirm', now0 - 41_000);
  tick();
  const timer = setInterval(tick, 1000);

  return {
    stop: () => clearInterval(timer),
    async placeCall(req: PlaceCallRequest) {
      await new Promise((res) => setTimeout(res, 450));
      const r = registrants.find((x) => x.id === req.registrantId);
      if (!r) throw new Error('Registrant not found.');
      if (calls.some((c) => c.registrantId === r.id && plans.has(c.id))) throw new Error(`${r.name} is already on a call.`);
      const c = startCall(r);
      push();
      return c.id;
    },
    async promote(registrantId: string) {
      await new Promise((res) => setTimeout(res, 300));
      const r = registrants.find((x) => x.id === registrantId);
      if (!r || r.status !== 'waitlist') throw new Error('Only waitlisted people can be promoted.');
      r.status = 'invited';
      r.waitlistRank = null;
      r.updatedAt = Date.now();
      addSeat('waitlist_called', null, r.id, r.updatedAt);
      rerank();
      push();
    },
  };
}
