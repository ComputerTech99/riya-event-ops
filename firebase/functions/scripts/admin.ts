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
      if (a.agent) {
        const { execSync } = await import("node:child_process");
        const key = execSync("firebase functions:secrets:access BOLNA_API_KEY --project riya-event-ops-485f", { encoding: "utf8" }).trim();
        const secretsRaw = readFileSync(join(__dirname, "..", "..", ".secrets.local"), "utf8");
        const toolToken = /^TOOL_TOKEN=(.+)$/m.exec(secretsRaw)?.[1]?.trim() ?? "";
        const webhookToken = /^WEBHOOK_TOKEN=(.+)$/m.exec(secretsRaw)?.[1]?.trim() ?? "";
        const root = join(__dirname, "..");
        const welcome = readFileSync(join(root, "../prompt/riya-welcome.txt"), "utf8").trim();
        const systemPrompt = readFileSync(join(root, "../prompt/riya-system.md"), "utf8");
        const hangupPrompt = readFileSync(join(root, "../prompt/riya-hangup.txt"), "utf8").trim();
        const extractionPrompt = readFileSync(join(root, "../prompt/riya-extraction.txt"), "utf8").trim();

        const getRes = await fetch("https://api.bolna.ai/v2/agent/39099f1d-2f02-4586-b51d-5bc9f3884842", {
          headers: { Authorization: `Bearer ${key}` },
        });
        const current = await getRes.json() as Record<string, any>;
        const task = current.tasks[0];
        task.task_config.call_cancellation_prompt = hangupPrompt;
        task.tools_config.llm_agent.llm_config.extraction_details = extractionPrompt;
        // English synthesizer (Sarvam bulbul:v3 en-IN) and English transcriber (Deepgram nova-2 en)
        task.tools_config.synthesizer = {
          ...task.tools_config.synthesizer,
          provider: "sarvam",
          provider_config: {
            ...task.tools_config.synthesizer.provider_config,
            model: "bulbul:v3",
            voice: "Priya",
            voice_id: "priya",
            language: "en-IN",
          },
        };
        task.tools_config.transcriber = {
          provider: "deepgram",
          model: "nova-2",
          language: "en",
          stream: true,
          sampling_rate: 16000,
          encoding: "linear16",
          endpointing: 400,
          keywords: "Riya:2,hackathon:2,veg:2,non-veg:2,Jain:2,solo:2,XS:2,XL:2,XXL:2",
        };
        task.tools_config.api_tools = {
          tools: [
            {
              key: "custom_task",
              name: "lookup_registrant",
              description: "Look up the registrant. Call this once right after the caller responds to your greeting. Returns what is already known and the list still_needed of questions you must still ask.",
              pre_call_message: "",
              parameters: {
                type: "object",
                required: ["registrant_id"],
                properties: {
                  registrant_id: { type: "string", description: "The registrant ID, always {registrant_id}" },
                },
              },
            },
            {
              key: "custom_task",
              name: "update_registrant",
              description: "Silently save ONE answer as soon as it is clear, or when the caller changes it. One field per call. Do not announce it.",
              pre_call_message: "",
              parameters: {
                type: "object",
                required: ["registrant_id", "field", "value"],
                properties: {
                  registrant_id: { type: "string", description: "The registrant ID, always {registrant_id}" },
                  field: {
                    type: "string",
                    enum: ["status", "team_name", "team_size", "food_pref", "tshirt_size", "callback_time", "notes"],
                    description: "Which field to save",
                  },
                  value: {
                    type: "string",
                    description: "status: confirmed, maybe or declined. team_size: a digit 1-4. food_pref: veg, non-veg or jain. tshirt_size: XS, S, M, L, XL or XXL. callback_time: the time the caller asked for, including the day. team_name: team name. notes: short summary.",
                  },
                },
              },
            },
            {
              key: "custom_task",
              name: "release_seat",
              description: "Release the caller's seat when they clearly say they will not attend. The next person on the waitlist automatically gets the seat and a call.",
              pre_call_message: "",
              parameters: {
                type: "object",
                required: ["registrant_id", "reason"],
                properties: {
                  registrant_id: { type: "string", description: "The registrant ID, always {registrant_id}" },
                  reason: { type: "string", description: "The reason they gave, or 'not given'" },
                },
              },
            },
          ],
          tools_params: {
            lookup_registrant: {
              method: "POST",
              url: "https://asia-south1-riya-event-ops-485f.cloudfunctions.net/lookupRegistrant",
              api_token: `Bearer ${toolToken}`,
              param: '{"registrant_id": "%(registrant_id)s"}',
              pre_call_message: "",
            },
            update_registrant: {
              method: "POST",
              url: "https://asia-south1-riya-event-ops-485f.cloudfunctions.net/updateRegistrant",
              api_token: `Bearer ${toolToken}`,
              param: '{"registrant_id": "%(registrant_id)s", "field": "%(field)s", "value": "%(value)s"}',
              pre_call_message: "",
            },
            release_seat: {
              method: "POST",
              url: "https://asia-south1-riya-event-ops-485f.cloudfunctions.net/releaseSeat",
              api_token: `Bearer ${toolToken}`,
              param: '{"registrant_id": "%(registrant_id)s", "reason": "%(reason)s"}',
              pre_call_message: "",
            },
          },
        };

        const putBody = {
          agent_config: {
            agent_name: "Riya",
            agent_welcome_message: welcome,
            webhook_url: `https://asia-south1-riya-event-ops-485f.cloudfunctions.net/bolnaWebhook?token=${webhookToken}`,
            agent_type: "other",
            calling_guardrails: { call_start_hour: 0, call_end_hour: 23 },
            tasks: [task],
          },
          agent_prompts: {
            task_1: { system_prompt: systemPrompt },
          },
        };

        const putRes = await fetch("https://api.bolna.ai/v2/agent/39099f1d-2f02-4586-b51d-5bc9f3884842", {
          method: "PUT",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(putBody),
        });
        console.log("PUT status:", putRes.status, await putRes.text());

        const verifyRes = await fetch("https://api.bolna.ai/v2/agent/39099f1d-2f02-4586-b51d-5bc9f3884842", {
          headers: { Authorization: `Bearer ${key}` },
        });
        const verified = await verifyRes.json() as Record<string, any>;
        console.log("Verified welcome:", verified.agent_welcome_message);
        console.log("Verified synthesizer:", JSON.stringify(verified.tasks?.[0]?.tools_config?.synthesizer));
        console.log("Verified transcriber:", JSON.stringify(verified.tasks?.[0]?.tools_config?.transcriber));
        return;
      }
      return post("dialerStatus", { eventId: a.event });
    default:
      console.error("Commands: event | import | launch | dialer  (see the header of scripts/admin.ts)");
      process.exit(1);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
