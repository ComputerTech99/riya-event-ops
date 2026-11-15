import { timingSafeEqual } from "node:crypto";
import type { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Token from `Authorization: Bearer …`, `x-tool-token` or `x-webhook-token`. */
export function headerToken(req: Request): string {
  const auth = req.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return (m?.[1] ?? req.get("x-tool-token") ?? req.get("x-webhook-token") ?? "").trim();
}

/** Returns false (and has already responded 401) when the token is wrong. */
export function requireToken(req: Request, res: Response, expected: string, opts: { allowQuery?: boolean } = {}): boolean {
  let got = headerToken(req);
  if (!got && opts.allowQuery && typeof req.query.token === "string") got = req.query.token;
  if (!expected || !got || !safeEqual(got, expected)) {
    // Never log token values; only where a token was (or wasn't) found.
    logger.warn("UNAUTHORIZED", {
      path: req.path,
      hasAuthHeader: !!req.get("authorization"),
      hasToolHeader: !!req.get("x-tool-token"),
      hasWebhookHeader: !!req.get("x-webhook-token"),
      hasQueryToken: typeof req.query.token === "string",
      expectedConfigured: !!expected,
      userAgent: req.get("user-agent") ?? null,
    });
    res.status(401).json({ ok: false, message: "Unauthorized." });
    return false;
  }
  return true;
}

/** Bolna sends JSON; tolerate a string body or form fields too. */
export function body(req: Request): Record<string, unknown> {
  let b: unknown = req.body;
  if (Buffer.isBuffer(b)) b = b.toString("utf8");
  if (typeof b === "string") {
    try { b = JSON.parse(b); } catch { b = {}; }
  }
  return { ...(req.query as Record<string, unknown>), ...((b as Record<string, unknown>) ?? {}) };
}

/** TEMP (call test): log every request before auth so rejected calls are visible too. Remove after verification. */
function debugRequest(req: Request): void {
  logger.info("DEBUG_REQUEST", {
    method: req.method,
    path: req.path,
    contentType: req.get("content-type") ?? null,
    userAgent: req.get("user-agent") ?? null,
    queryKeys: Object.keys(req.query ?? {}),
    rawBody: req.rawBody ? req.rawBody.toString("utf8").slice(0, 6000) : null,
  });
}

export function onlyPost(req: Request, res: Response): boolean {
  debugRequest(req);
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Use POST." });
    return false;
  }
  return true;
}
