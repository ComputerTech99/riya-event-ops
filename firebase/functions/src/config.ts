import { defineInt, defineSecret, defineString } from "firebase-functions/params";

export const REGION = "asia-south1";

/** Bolna API key, used to place outbound calls. Secret Manager only. */
export const BOLNA_API_KEY = defineSecret("BOLNA_API_KEY");
/** Shared token Riya's custom tools send as `Authorization: Bearer <token>`. */
export const TOOL_TOKEN = defineSecret("TOOL_TOKEN");
/** Token Bolna's webhook sends (header `x-webhook-token` or `?token=`). */
export const WEBHOOK_TOKEN = defineSecret("WEBHOOK_TOKEN");
/** Token for the one-off seeding endpoint. Never given to Bolna. */
export const ADMIN_TOKEN = defineSecret("ADMIN_TOKEN");

/** Riya's Bolna agent ID, used when release_seat calls the next person. Not secret; lives in .env.<project>. */
export const BOLNA_AGENT_ID = defineString("BOLNA_AGENT_ID", { default: "" });
/** Optional caller ID (E.164). Empty means the Bolna account default. */
export const BOLNA_FROM_NUMBER = defineString("BOLNA_FROM_NUMBER", { default: "" });

/** Bolna account limit on simultaneous calls. The dialer never exceeds it. */
export const MAX_CONCURRENT_CALLS = defineInt("MAX_CONCURRENT_CALLS", { default: 2 });
/** Calling window (recipient time). Matches the agent's calling_guardrails. */
export const CALL_START_HOUR = defineInt("CALL_START_HOUR", { default: 10 });
export const CALL_END_HOUR = defineInt("CALL_END_HOUR", { default: 20 });
export const CALL_TIMEZONE = defineString("CALL_TIMEZONE", { default: "Asia/Kolkata" });

export const COL = {
  registrants: "registrants",
  calls: "calls",
  seats: "seats",
  events: "events",
  feedback: "feedback",
  promptEngine: "promptEngine",
  callQueue: "callQueue",
} as const;
