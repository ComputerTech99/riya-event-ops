import { Platform } from 'react-native';
import type { EventConfig } from '../data/types';

/** "https://lu.ma/hack2026?tk=x" or "luma.com/hack2026" -> "hack2026". */
export function lumaSlug(input: string): string | null {
  const m = /(?:^|\/\/|\s)(?:www\.)?(?:lu\.ma|luma\.com)\/(?:event\/)?([A-Za-z0-9_-]+)/i.exec(input.trim());
  return m ? m[1] : null;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/**
 * Reads a public Luma event through Luma's public page API.
 * Throws when the link isn't a Luma event or the API won't answer (CORS, private event).
 */
export async function fetchLuma(url: string): Promise<Partial<EventConfig>> {
  const slug = lumaSlug(url);
  if (!slug) throw new Error("That doesn't look like a Luma link.");
  let res: Response;
  try {
    res = await fetch(`https://api.lu.ma/url?url=${encodeURIComponent(slug)}`);
  } catch {
    // Browsers hit Luma's CORS wall; the native app doesn't.
    throw new Error(Platform.OS === 'web' ? "Luma doesn't let browsers read events directly (works in the phone app)." : "Couldn't reach Luma.");
  }
  if (!res.ok) throw new Error(`Luma answered ${res.status}.`);
  const body = await res.json();
  const ev = body?.data?.event ?? body?.event;
  if (!ev?.name) throw new Error('Luma returned no event for that link.');
  const geo = ev.geo_address_info ?? {};
  return {
    name: String(ev.name),
    date: ev.start_at ? fmtDate(ev.start_at) : '',
    venue: String(geo.full_address ?? geo.address ?? geo.city_state ?? ''),
    capacity: Number(body?.data?.ticket_info?.max_capacity ?? ev.max_capacity) || undefined,
    lumaUrl: `https://lu.ma/${slug}`,
  };
}
