import type { GuestInput } from '../data/types';

/** RFC 4180-ish: quoted fields, escaped quotes, CRLF or LF, BOM stripped. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const src = text.replace(/^﻿/, '');
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim())) out.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) out.push(row);
  const [headers = [], ...rows] = out;
  return { headers: headers.map((h) => h.trim()), rows };
}

export type Field = 'name' | 'firstName' | 'lastName' | 'phone' | 'email' | 'teamName' | 'foodPref' | 'tshirtSize' | 'status';

export const FIELDS: { key: Field; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Full name' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'email', label: 'Email' },
  { key: 'teamName', label: 'Team' },
  { key: 'foodPref', label: 'Food' },
  { key: 'tshirtSize', label: 'T-shirt' },
  { key: 'status', label: 'Status' },
];

export type Mapping = Record<Field, string | null>;

/** Header patterns seen in Luma, Google Forms, Devfolio, Eventbrite and Typeform exports. */
const PATTERNS: Record<Field, RegExp> = {
  name: /^(full[ _]?name|name|your name|attendee name|participant name|guest name)$/i,
  firstName: /^(first[ _]?name|given name)$/i,
  lastName: /^(last[ _]?name|surname|family name)$/i,
  phone: /(phone|mobile|whats ?app|contact number|cell)/i,
  email: /(e-?mail)/i,
  teamName: /(team)/i,
  foodPref: /(food|diet|meal|veg)/i,
  tshirtSize: /(t-?shirt|tee|shirt size|swag size)/i,
  status: /^(approval[ _]status|status|ticket status|registration status|rsvp)$/i,
};

export function autoMap(headers: string[]): Mapping {
  const used = new Set<string>();
  const m = {} as Mapping;
  for (const { key } of FIELDS) {
    const h = headers.find((x) => !used.has(x) && PATTERNS[key].test(x.trim()));
    m[key] = h ?? null;
    if (h) used.add(h);
  }
  // A combined name beats first/last; otherwise first+last stand in for it.
  if (m.name) { m.firstName = null; m.lastName = null; }
  return m;
}

/** Best guess at which app the CSV came from, for the label only. */
export function detectSource(headers: string[]): string {
  const h = headers.map((x) => x.toLowerCase());
  if (h.includes('approval_status') || h.includes('api_id') || h.some((x) => x.includes('luma'))) return 'Luma';
  if (h.includes('timestamp')) return 'Google Forms';
  if (h.some((x) => x.includes('devfolio')) || h.includes('team name')) return 'Devfolio';
  if (h.some((x) => x.includes('order #') || x.includes('ticket type'))) return 'Eventbrite';
  return 'CSV';
}

const normFood = (v: string) => {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s.includes('jain')) return 'jain';
  if (s.includes('vegan')) return 'vegan';
  if (s.includes('non')) return 'non-veg';
  if (s.includes('veg')) return 'veg';
  return s;
};

const normSize = (v: string) => {
  const s = v.trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  const m = /(XXXL|3XL|XXL|2XL|XL|XS|S|M|L)/.exec(s);
  return m ? m[1].replace('2XL', 'XXL').replace('3XL', 'XXXL') : s;
};

/** Rows to guests. Rows without a name are dropped; people past capacity go to the waitlist. */
export function toGuests(headers: string[], rows: string[][], m: Mapping, capacity: number): GuestInput[] {
  const col = (k: Field) => (m[k] ? headers.indexOf(m[k]!) : -1);
  const get = (r: string[], k: Field) => {
    const i = col(k);
    return i >= 0 ? (r[i] ?? '').trim() : '';
  };
  const guests: GuestInput[] = [];
  for (const r of rows) {
    const name = get(r, 'name') || [get(r, 'firstName'), get(r, 'lastName')].filter(Boolean).join(' ');
    if (!name) continue;
    const st = get(r, 'status').toLowerCase();
    if (/declin|reject|cancel/.test(st)) continue;
    guests.push({
      name,
      phone: get(r, 'phone'),
      email: get(r, 'email'),
      teamName: get(r, 'teamName') || null,
      foodPref: normFood(get(r, 'foodPref')),
      tshirtSize: normSize(get(r, 'tshirtSize')),
      status: /wait/.test(st) ? 'waitlist' : 'registered',
    });
  }
  return assignSeats(guests, capacity);
}

/** Keep explicit waitlisters; overflow beyond capacity joins the waitlist in file order. */
export function assignSeats(guests: GuestInput[], capacity: number): GuestInput[] {
  let seated = 0;
  return guests.map((g) => {
    if (g.status === 'waitlist') return g;
    if (seated < capacity) { seated++; return { ...g, status: 'registered' as const }; }
    return { ...g, status: 'waitlist' as const };
  });
}
