/**
 * Seed Firestore (events, seats, registrants, promptEngine + schema docs for calls/feedback).
 *
 *   ADMIN_TOKEN=... npm run seed -- https://asia-south1-<project>.cloudfunctions.net/adminSeed
 *
 * The data goes through the token-protected adminSeed function, so no local Google
 * credentials are needed. Phones of "+91XXXXXXXXXX" are placeholders: releaseSeat will
 * skip the auto-call (and note why) until you put real numbers in seed/registrants.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

async function main() {
  const url = process.argv[2] ?? process.env.SEED_URL;
  const token = process.env.ADMIN_TOKEN;
  if (!url || !token) {
    console.error("Usage: ADMIN_TOKEN=... npm run seed -- <adminSeed URL>");
    process.exit(1);
  }

  const payload = {
    events: JSON.parse(read("seed/events.json")),
    // seed/registrants.local.json (git-ignored) holds real test numbers; the committed file has placeholders.
    registrants: JSON.parse(read(existsSync(join(root, "seed/registrants.local.json")) ? "seed/registrants.local.json" : "seed/registrants.json")),
    promptEngine: [{
      id: "riya",
      agent: "Riya",
      version: 4,
      model: "gpt-4.1-mini",
      variables: ["name", "registrant_id", "event_name", "event_date", "venue"],
      welcomeMessage: read("../prompt/riya-welcome.txt").trim(),
      systemPrompt: read("../prompt/riya-system.md"),
      extractionPrompt: read("../prompt/riya-extraction.txt"),
      hangupPrompt: read("../prompt/riya-hangup.txt"),
      bolnaAgentId: "39099f1d-2f02-4586-b51d-5bc9f3884842",
      callingWindow: { startHour: 10, endHour: 20 },
    }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(res.status, text);
  if (!res.ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
