/**
 * tempmail.cloud temporary-inbox reader.
 *
 * tempmail.cloud creates a guest mailbox over its own JSON API — no browser
 * UI, no Turnstile. The flow is:
 *
 *   1. POST /api/browser-session   -> sets the `tm_browser` cookie
 *   2. POST /api/mailboxes {domain?, localPart?} -> { mailbox.email, token }
 *   3. GET  /api/messages          (Authorization: Bearer <token>)
 *   4. GET  /api/messages/{id}     -> full `text` body for code extraction
 *
 * Requests are issued through a Playwright `APIRequestContext`, which shares
 * the inbox browser context's cookie jar and proxy, so the mailbox is created
 * with the same egress IP as the rest of the run.
 *
 * @module inbox/tempmail
 */

import { log } from "../utils/logger.mjs";

export const TEMPMAIL = "https://tempmail.cloud";

/** Sender fragments that identify the Cyberouter/Enclave sign-in mail. */
const SENDER_HINTS = ["enclave", "cyberouter"];

let cachedSession = false;

/** Headers that make the API calls look like the site's own fetch()es. */
function headers(token) {
  const h = {
    "Content-Type": "application/json",
    Origin: TEMPMAIL,
    Referer: `${TEMPMAIL}/`,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/**
 * Establish the guest browser session (idempotent). The `tm_browser` cookie is
 * required before a mailbox can be created.
 *
 * @param {import('playwright').APIRequestContext} request
 */
async function ensureSession(request) {
  if (cachedSession) return;
  await request.post(`${TEMPMAIL}/api/browser-session`, {
    headers: headers(),
    data: {},
  });
  cachedSession = true;
}

/**
 * Create a fresh temporary mailbox.
 *
 * @param {import('playwright').APIRequestContext} request
 * @param {{domain?:string, localPart?:string}} [opts]
 * @returns {Promise<{email:string, local:string, domain:string, token:string}>}
 */
export async function createInbox(request, opts = {}) {
  await ensureSession(request);

  const body = {};
  if (opts.domain) body.domain = opts.domain;
  if (opts.localPart) body.localPart = opts.localPart;

  const res = await request.post(`${TEMPMAIL}/api/mailboxes`, {
    headers: headers(),
    data: body,
  });
  if (!res.ok()) {
    throw new Error(`tempmail mailbox creation failed: HTTP ${res.status()}`);
  }
  const json = await res.json();
  const email = json?.mailbox?.email;
  const token = json?.token;
  if (!email || !token) {
    throw new Error(`tempmail mailbox creation returned no address/token`);
  }
  const [local, domain] = email.split("@");
  return { email, local, domain, token };
}

/**
 * Extract a sign-in code from a message (subject first, then body).
 * Cyberouter mails a code shaped `XXXX-XXXX-XXXX`.
 *
 * @param {{subject?:string, text?:string, preview?:string}} msg
 * @returns {string|null}
 */
export function extractCode(msg) {
  const sources = [msg.subject, msg.text, msg.preview].filter(Boolean);
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
  const from = (msg.from || "").toLowerCase();
  const subj = (msg.subject || msg.preview || "").toLowerCase();
  return SENDER_HINTS.some((h) => from.includes(h) || subj.includes(h));
}

/**
 * Poll the mailbox until the Cyberouter code arrives.
 *
 * @param {import('playwright').APIRequestContext} request
 * @param {string} token  mailbox bearer token from {@link createInbox}
 * @param {{timeout?:number, pollInterval?:number}} [opts]
 * @returns {Promise<string>}
 */
export async function waitForCode(request, token, opts = {}) {
  const timeout = opts.timeout ?? 180000;
  const pollInterval = opts.pollInterval ?? 3000;
  const deadline = Date.now() + timeout;

  log.step("waiting for the Cyberouter sign-in email");
  while (Date.now() < deadline) {
    const res = await request
      .get(`${TEMPMAIL}/api/messages?limit=20`, { headers: headers(token) })
      .catch(() => null);

    if (res?.ok()) {
      const { messages = [] } = await res.json();
      // Prefer a sender match; fall back to the newest message.
      const msg = messages.find(isFromSender) || messages[0];
      if (msg) {
        const code = extractCode(msg);
        if (code) return code;
        // Body may hold the code even when subject/preview do not.
        if (msg.id) {
          const full = await request
            .get(`${TEMPMAIL}/api/messages/${msg.id}`, { headers: headers(token) })
            .catch(() => null);
          if (full?.ok()) {
            const fullCode = extractCode(await full.json());
            if (fullCode) return fullCode;
          }
        }
      }
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error("timed out waiting for the sign-in email");
}

/** Reset the cached session flag (used by tests / repeated runs in-process). */
export function resetSession() {
  cachedSession = false;
}