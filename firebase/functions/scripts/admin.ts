/**
 * Admin CLI for events, guest imports and launches.
 *
 *   npm run event  -- --id DEVFEST --name "DevFest Bengaluru" --date 2026-12-20 --venue "NIMHANS" --capacity 300 [--enable|--disable]
 *   npm run event  -- --luma https://lu.ma/abc123 [--id MYEVENT] [--capacity 120] [--venue "..."] [--enable]
 *   npm run import -- --event DEVFEST --csv guests.csv [--map luma | --map mapping.json] [--luma URL] [--dry-run]
 *   npm run launch -- --event DEVFEST [--statuses registered,maybe] [--dry-run] [--force]
 *   npm run dialer -- [--event DEVFEST]
 *
 * ADMIN_TOKEN comes from the environment or ../.secrets.local.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.FUNCTIONS_BASE ?? "https://asia-south1-riya-event-ops-485f.cloudfunctions.net";

function token(): string {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  const f = join(__dirname, "..", "..", ".secrets.local");
  const m = existsSync(f) ? /^ADMIN_TOKEN=(.+)$/m.exec(readFileSync(f, "utf8")) : null;
  if (!m) throw new Error("Set ADMIN_TOKEN or keep it in firebase/.secrets.local.");
  return m[1].trim();
}

function args(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

async function post(fn: string, payload: unknown) {
  const res = await fetch(`${BASE}/${fn}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { console.log(JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log(text); }
  if (!res.ok) process.exit(1);
}

function eventFields(a: Record<string, string | boolean>) {
  const e: Record<string, unknown> = {};
  if (typeof a.name === "string") e.name = a.name;
  if (typeof a.date === "string") e.date = a.date;
  if (typeof a.venue === "string") e.venue = a.venue;
  if (typeof a.timezone === "string") e.timezone = a.timezone;
  if (typeof a.capacity === "string") e.capacity = Number(a.capacity);
  if (typeof a["max-team-size"] === "string") e.maxTeamSize = Number(a["max-team-size"]);
  if (a.enable === true) e.enabled = true;
  if (a.disable === true) e.enabled = false;
  return e;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = args(rest);
  switch (cmd) {
    case "event":
      return post("upsertEvent", { eventId: a.id, lumaUrl: a.luma, event: eventFields(a), dryRun: a["dry-run"] === true });
    case "import": {
      if (typeof a.csv !== "string") throw new Error("--csv <file> is required");
      const mapping = typeof a.map === "string" && a.map.endsWith(".json")
        ? JSON.parse(readFileSync(a.map, "utf8"))
        : (a.map as string | undefined) ?? "luma";
      const ev = eventFields(a);
      return post("importGuests", {
        eventId: a.event, lumaUrl: a.luma, event: Object.keys(ev).length ? ev : undefined,
        csv: readFileSync(a.csv, "utf8"), mapping, dryRun: a["dry-run"] === true,
      });
    }
    case "launch":
      return post("launchEvent", {
        eventId: a.event,
        statuses: typeof a.statuses === "string" ? a.statuses.split(",").map((s) => s.trim()) : undefined,
        dryRun: a["dry-run"] === true, force: a.force === true,
      });
    case "dialer":
      return post("dialerStatus", { eventId: a.event });
    default:
      console.error("Commands: event | import | launch | dialer  (see the header of scripts/admin.ts)");
      process.exit(1);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
