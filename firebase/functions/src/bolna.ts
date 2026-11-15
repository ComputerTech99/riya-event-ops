/** Minimal Bolna REST client: place an outbound call. */

export interface PlaceCallInput {
  apiKey: string;
  agentId: string;
  to: string;
  from?: string;
  userData: Record<string, string>;
}

export interface PlaceCallResult { executionId: string; status: string }

/** HTTP status 0 = network error/timeout. Retry on 0, 429 and 5xx. */
export class BolnaError extends Error {
  constructor(message: string, readonly httpStatus: number) { super(message); }
  get retryable(): boolean { return this.httpStatus === 0 || this.httpStatus === 429 || this.httpStatus >= 500; }
}

const E164 = /^\+[1-9]\d{7,14}$/;

/** Accepts "+91 98765 43210", "9876543210" (assumed India) etc. */
export function toE164(phone: string, defaultCountry = "91"): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  let p = digits.startsWith("+") ? digits : digits.startsWith("00") ? `+${digits.slice(2)}` : digits;
  if (!p.startsWith("+")) {
    p = p.replace(/^0+/, "");
    p = p.length === 10 ? `+${defaultCountry}${p}` : `+${p}`;
  }
  return E164.test(p) ? p : null;
}

export async function placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
  let res: Response;
  try {
    res = await fetch("https://api.bolna.ai/call", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: input.agentId,
      recipient_phone_number: input.to,
      ...(input.from ? { from_phone_number: input.from } : {}),
      user_data: input.userData,
    }),
    signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new BolnaError(`Bolna unreachable: ${err instanceof Error ? err.message : String(err)}`, 0);
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { /* keep raw text for the error */ }
  if (!res.ok || typeof data.execution_id !== "string") {
    throw new BolnaError(`Bolna call failed (${res.status}): ${String(data.message ?? text).slice(0, 300)}`, res.status);
  }
  return { executionId: data.execution_id, status: String(data.status ?? "queued") };
}
