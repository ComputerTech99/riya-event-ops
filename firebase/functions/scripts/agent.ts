/**
 * Inspect and update the live Bolna agent (Riya) from the prompt files in ../prompt.
 *
 *   npm run agent -- show                 # live config, tokens redacted
 *   npm run agent -- calls [n]            # last n call transcripts (default 3)
 *   npm run agent -- sync [--dry-run]     # push English prompts, voice and transcriber config
 *
 * The Bolna API key is read in memory from Secret Manager (`firebase functions:secrets:access`)
 * or $BOLNA_API_KEY, and is never printed.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT = "riya-event-ops-485f";
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function agentId(): string {
  const env = read(`.env.${PROJECT}`);
  const m = /^BOLNA_AGENT_ID=(.+)$/m.exec(env);
  if (!m) throw new Error("BOLNA_AGENT_ID missing from .env file");
  return m[1].trim();
}

function apiKey(): string {
  if (process.env.BOLNA_API_KEY) return process.env.BOLNA_API_KEY;
  return execFileSync("firebase", ["functions:secrets:access", "BOLNA_API_KEY", "--project", PROJECT], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

let KEY = "";
async function bolna(method: string, path: string, body?: unknown) {
  KEY ||= apiKey();
  const res = await fetch(`https://api.bolna.ai${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* raw */ }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  return data as Record<string, unknown>;
}

/** Deep-copy with anything token-like masked, so output is safe to print. */
function redact(v: unknown, key = ""): unknown {
  if (typeof v === "string") {
    if (/token|authorization|api_key|secret|password/i.test(key)) return v ? "***" : v;
    return v.replace(/([?&](token|key)=)[^&\s"]+/gi, "$1***").replace(/Bearer\s+[\w.-]+/g, "Bearer ***");
  }
  if (Array.isArray(v)) return v.map((x) => redact(x, key));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x, k)]));
  }
  return v;
}

export function applyDesired(cfg: Record<string, any>, prompts: { system: string; welcome: string; hangup: string; extraction: string }) {
  cfg.agent_welcome_message = prompts.welcome;
  const task = cfg.tasks?.[0];
  if (!task) throw new Error("Agent has no task_1");
  const tc = task.tools_config ?? {};

  if (tc.synthesizer?.provider_config) {
    tc.synthesizer.provider_config.language = "en-IN";
  }
  tc.transcriber = {
    provider: "deepgram",
    model: "nova-2",
    language: "en",
    stream: true,
    sampling_rate: 16000,
    encoding: "linear16",
    endpointing: 400,
    keywords: "Riya:2,hackathon:2,veg:2,non-veg:2,Jain:2,solo:2,XS:2,XL:2,XXL:2",
  };
  tc.multilingual_config = null;

  if (tc.llm_agent?.llm_config) {
    tc.llm_agent.llm_config.extraction_details = prompts.extraction;
  }

  const tools = tc.api_tools?.tools;
  if (Array.isArray(tools)) {
    for (const t of tools) t.pre_call_message = "";
  }
  if (tc.api_tools?.tools_params) {
    for (const name of Object.keys(tc.api_tools.tools_params)) {
      const p = tc.api_tools.tools_params[name];
      if (p) p.pre_call_message = "";
    }
  }
  task.tools_config = tc;

  const conv = task.task_config ?? {};
  conv.backchanneling = false;
  conv.use_fillers = false;
  conv.call_cancellation_prompt = prompts.hangup;
  conv.check_user_online_message = "Hello, can you hear me?";
  task.task_config = conv;
  return cfg;
}

function loadPrompts() {
  return {
    system: read("../prompt/riya-system.md"),
    welcome: read("../prompt/riya-welcome.txt").trim(),
    hangup: read("../prompt/riya-hangup.txt").trim(),
    extraction: read("../prompt/riya-extraction.txt").trim(),
  };
}

function summarise(a: Record<string, any>) {
  const cfg = a.agent_config ?? a;
  const task = cfg.tasks?.[0] ?? {};
  const tc = task.tools_config ?? {};
  return {
    agent_name: cfg.agent_name,
    welcome: cfg.agent_welcome_message,
    transcriber: tc.transcriber,
    synthesizer: tc.synthesizer,
    llm: tc.llm_agent?.llm_config ?? tc.llm_agent,
    tools: (tc.api_tools?.tools ?? []).map((t: any) => ({ name: t.name ?? t.key, pre_call_message: t.pre_call_message })),
    tools_params_pre_call: Object.fromEntries(Object.entries(tc.api_tools?.tools_params ?? {}).map(([k, v]: [string, any]) => [k, v?.pre_call_message])),
    task_config: task.task_config,
    prompt_start: String(a.agent_prompts?.task_1?.system_prompt ?? "").slice(0, 120),
  };
}

async function main() {
  const [cmd = "show", ...rest] = process.argv.slice(2);
  const id = agentId();

  if (cmd === "show") {
    const a = await bolna("GET", `/v2/agent/${id}`);
    console.log(JSON.stringify(redact(rest.includes("--full") ? a : summarise(a)), null, 2));
    return;
  }

  if (cmd === "calls") {
    const n = Number(rest[0] ?? 3);
    const r = await bolna("GET", `/v2/agent/${id}/executions?page_number=1&page_size=${n}`);
    const list = (r.data ?? r.executions ?? r) as any[];
    for (const e of (Array.isArray(list) ? list : []).slice(0, n)) {
      console.log("=".repeat(80));
      console.log(e.id ?? e.execution_id, e.status, e.created_at, `${e.conversation_time ?? e.conversation_duration ?? "?"}s`);
      console.log(redact(String(e.transcript ?? "(no transcript)")));
    }
    return;
  }

  if (cmd === "sync") {
    const live = await bolna("GET", `/v2/agent/${id}`);
    const backup = join(__dirname, `.agent-backup-${Date.now()}.local.json`);
    writeFileSync(backup, JSON.stringify(live, null, 2), { mode: 0o600 });
    const cfg = JSON.parse(JSON.stringify(live.agent_config ?? live));
    const prompts = loadPrompts();
    applyDesired(cfg, prompts);
    const body = { agent_config: cfg, agent_prompts: { task_1: { system_prompt: prompts.system } } };
    if (rest.includes("--dry-run")) {
      console.log(JSON.stringify(redact(summarise({ ...body, agent_config: cfg })), null, 2));
      console.log(`(dry run; backup of live config at ${backup})`);
      return;
    }
    const r = await bolna("PUT", `/v2/agent/${id}`, body);
    console.log("PUT ok:", JSON.stringify(redact(r)));
    const after = await bolna("GET", `/v2/agent/${id}`);
    console.log(JSON.stringify(redact(summarise(after)), null, 2));
    console.log(`Backup of the previous config: ${backup}`);
    return;
  }

  console.error("Usage: npm run agent -- show [--full] | calls [n] | sync [--dry-run]");
  process.exit(1);
}

if (require.main === module) {
  main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
}
