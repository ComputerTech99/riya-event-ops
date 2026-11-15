/**
 * Read event details from a PUBLIC Luma event page (no API key).
 * Public pages expose name, start time, timezone, address and spots remaining,
 * but not the guest list or total capacity: guests come from the host's CSV export.
 */

const ALLOWED_HOSTS = new Set(["lu.ma", "www.lu.ma", "luma.com", "www.luma.com"]);
const MAX_BYTES = 3_000_000;

export interface LumaEvent {
  slug: string;
  lumaId: string | null;
  url: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  /** "YYYY-MM-DD" in the event timezone. */
  date: string;
  /** Short, speakable venue, e.g. "Bolna, Bellandur, Bengaluru". */
  venue: string;
  fullAddress: string | null;
  /** spots_remaining + guest_count when Luma shows them; total capacity is not public. */
  capacityEstimate: number | null;
  waitlistEnabled: boolean;
}

/** Validates and normalises a Luma URL; throws on anything else (no open fetches). */
export function parseLumaUrl(raw: string): { url: string; slug: string } {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error("Not a valid URL."); }
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname.toLowerCase())) {
    throw new Error("Only public https://lu.ma or https://luma.com event links are supported.");
  }
  const slug = u.pathname.split("/").filter(Boolean)[0] ?? "";
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(slug)) throw new Error("Could not find the event slug in the Luma link.");
  return { url: `https://luma.com/${slug}`, slug };
}

export function localDate(iso: string, timezone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone })
    .format(new Date(iso));
}

interface Geo {
  address?: string; city?: string; sublocality?: string; full_address?: string; short_address?: string;
}

/** Turn Luma's geo info into something Riya can say out loud. */
export function speakableVenue(geo: Geo | null | undefined, visibility?: string): string {
  if (!geo) return "";
  const first = (geo.address ?? "").split(/\s+[:|]\s+|\s+-\s+/)[0]?.trim() ?? "";
  const hidden = visibility && visibility !== "public";
  const parts = (hidden ? [geo.city] : [first, geo.sublocality, geo.city])
    .map((p) => (p ?? "").trim())
    .filter((p, i, all) => p && all.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  return parts.join(", ");
}

/** Pure: extract the event from a Luma event page's HTML. */
export function parseLumaHtml(html: string, slug: string): LumaEvent {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("This doesn't look like a public Luma event page.");
  let next: any;
  try { next = JSON.parse(m[1]); } catch { throw new Error("Could not read the Luma page data."); }
  const data = next?.props?.pageProps?.initialData?.data;
  const ev = data?.event;
  if (!ev?.name) throw new Error("No event found on that Luma page (is it public?).");

  const timezone: string = ev.timezone || "Asia/Kolkata";
  const startAt: string | null = ev.start_at ?? null;
  const spots = Number(data?.ticket_info?.spots_remaining);
  const guests = Number(data?.guest_count);
  return {
    slug,
    lumaId: ev.api_id ?? null,
    url: `https://luma.com/${ev.url || slug}`,
    name: String(ev.name).trim(),
    startAt,
    endAt: ev.end_at ?? null,
    timezone,
    date: startAt ? localDate(startAt, timezone) : "",
    venue: speakableVenue(ev.geo_address_info, ev.geo_address_visibility) || (ev.location_type === "online" ? "online" : ""),
    fullAddress: ev.geo_address_visibility === "public" ? ev.geo_address_info?.full_address ?? null : null,
    capacityEstimate: Number.isFinite(spots) ? spots + (Number.isFinite(guests) ? guests : 0) : null,
    waitlistEnabled: ev.waitlist_enabled === true,
  };
}

export async function fetchLumaEvent(rawUrl: string): Promise<LumaEvent> {
  const { url, slug } = parseLumaUrl(rawUrl);
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RiyaEventOps/1.0)", Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  // Redirects must stay on Luma.
  parseLumaUrl(res.url || url);
  if (!res.ok) throw new Error(`Luma returned HTTP ${res.status} for that link.`);
  const html = await res.text();
  if (html.length > MAX_BYTES) throw new Error("Luma page is unexpectedly large.");
  return parseLumaHtml(html, slug);
}
