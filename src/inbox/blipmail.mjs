/**
 * BlipMail (blipmail.mpruy.my.id) temporary-inbox reader.
 *
 * BlipMail exposes a small anonymous JSON API — no browser UI, no Turnstile.
 * Flow:
 *
 *   1. GET  /api/session                        -> { sessionId }
 *   2. POST /api/inboxes {localPart?,domain?}   -> { address }
 *   3. GET  /api/inboxes/:address/messages      -> [ { subject, body, ... } ]
 *
 * Every request after the first sends the session id via the `x-session-id`
 * header. Requests go through a Playwright `APIRequestContext`, which shares
 * the platform context's cookie jar and proxy.
 *
 * Docs: https://blipmail.mpruy.my.id/docs
 *
 * @module inbox/blipmail
 */

import { log, color } from "../utils/logger.mjs";

export const BLIPMAIL = "https://blipmail.mpruy.my.id";
const API = `${BLIPMAIL}/api`;

/** Sender fragments that identify the Cyberouter/Enclave sign-in mail. */
const SENDER_HINTS = ["enclave", "cyberouter"];

/** Cached session id, reused across inboxes created in one process. */
let cachedSessionId = null;

/** Headers that make the API calls look like the site's own fetch()es. */
function headers(sessionId) {
  const h = {
    "Content-Type": "application/json",
    Origin: BLIPMAIL,
    Referer: `${BLIPMAIL}/`,
  };
  if (sessionId) h["x-session-id"] = sessionId;
  return h;
}

/**
 * Return the (cached) anonymous session id, creating one on first call.
 *
 * @param {import('playwright').APIRequestContext} request
 * @returns {Promise<string>}
 */
async function ensureSession(request) {
  if (cachedSessionId) return cachedSessionId;
  const res = await request.get(`${API}/session`, { headers: headers() });
  if (!res.ok()) throw new Error(`blipmail session failed: HTTP ${res.status()}`);
  const { sessionId } = await res.json();
  if (!sessionId) throw new Error("blipmail session returned no sessionId");
  cachedSessionId = sessionId;
  return sessionId;
}

/** The receiving domains BlipMail currently accepts (falls back to the default). */
export async function fetchDomains(request) {
  const res = await request.get(`${API}/config`, { headers: headers() });
  if (!res.ok()) return [];
  const cfg = await res.json();
  return Array.isArray(cfg.mailDomains) ? cfg.mailDomains : [];
}

/**
 * Create a fresh temporary mailbox.
 *
 * @param {import('playwright').APIRequestContext} request
 * @param {{domain?:string, localPart?:string}} [opts]
 * @returns {Promise<{email:string, local:string, domain:string}>}
 */
export async function createInbox(request, opts = {}) {
  log.step(`${color.magenta("✉")} ${color.dim("creating blipmail inbox")}`);
  const sessionId = await ensureSession(request);

  const body = {};
  if (opts.domain) body.domain = opts.domain;
  if (opts.localPart) body.localPart = opts.localPart;

  const res = await request.post(`${API}/inboxes`, {
    headers: headers(sessionId),
    data: body,
  });
  if (!res.ok()) {
    throw new Error(`blipmail inbox creation failed: HTTP ${res.status()}`);
  }
  const json = await res.json();
  const email = json?.address;
  if (!email) throw new Error("blipmail inbox creation returned no address");
  const [local, domain] = email.split("@");
  return { email, local, domain };
}

/**
 * Extract a sign-in code from a message (subject first, then body).
 * Cyberouter mails a code shaped `XXXX-XXXX-XXXX`.
 *
 * @param {{subject?:string, body?:string}} msg
 * @returns {string|null}
 */
export function extractCode(msg) {
  const sources = [msg.subject, msg.body].filter(Boolean);
  const patterns = [
    /\b([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})\b/i,
    /sign[-\s]?in code[^A-Z0-9]{0,40}([A-Z0-9]{4,12})/i,
    /verification[-\s]?code[^A-Z0-9]{0,40}([A-Z0-9]{4,12})/i,
  ];
  for (const src of sources) {
    for (const re of patterns) {
      const m = src.match(re);
      if (m) return m[1].toUpperCase();
    }
  }
  return null;
}

/** True when a message looks like it came from Cyberouter/Enclave. */
function isFromSender(msg) {
  const from = (msg.from_address || "").toLowerCase();
  const subj = (msg.subject || "").toLowerCase();
  return SENDER_HINTS.some((h) => from.includes(h) || subj.includes(h));
}

/**
 * Poll the mailbox until the Cyberouter code arrives.
 *
 * @param {import('playwright').APIRequestContext} request
 * @param {string} address  the inbox email address
 * @param {{timeout?:number, pollInterval?:number}} [opts]
 * @returns {Promise<string>}
 */
export async function waitForCode(request, address, opts = {}) {
  const timeout = opts.timeout ?? 180000;
  const pollInterval = opts.pollInterval ?? 3000;
  const deadline = Date.now() + timeout;
  const sessionId = await ensureSession(request);
  const url = `${API}/inboxes/${encodeURIComponent(address)}/messages`;

  log.step(`${color.magenta("✉")} ${color.dim("waiting for the Cyberouter sign-in email")}`);
  const startedPoll = Date.now();
  let waited = 0;
  while (Date.now() < deadline) {
    const res = await request.get(url, { headers: headers(sessionId) }).catch(() => null);
    if (res?.ok()) {
      const list = await res.json().catch(() => []);
      const messages = Array.isArray(list) ? list : [];
      // Prefer a sender match; fall back to the newest message.
      const msg = messages.find(isFromSender) || messages[messages.length - 1];
      if (msg) {
        const code = extractCode(msg);
        if (code) return code;
      }
    }

    waited = Math.round((Date.now() - startedPoll) / 1000);
    if (waited > 0 && waited % 15 === 0) {
      log.info(color.dim(`still waiting for the email… ${waited}s`));
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error("timed out waiting for the sign-in email");
}

/** Reset the cached session flag (used by tests / repeated runs in-process). */
export function resetSession() {
  cachedSessionId = null;
}