/**
 * Core provisioning flow: one Cyberouter account + one API key, end-to-end.
 *
 * The temporary inbox is created and polled over tempmail.cloud's JSON API
 * through a Playwright `APIRequestContext` (shared cookie jar + proxy), while
 * the Cyberouter session is driven in a browser context. The Cloudflare
 * Turnstile challenge is solved with CapSolver.
 *
 * @module core/provision
 */

import * as cyber from "../cyberouter/client.mjs";
import { createInbox, waitForCode } from "../inbox/tempmail.mjs";
import { randomKeyName } from "../utils/random.mjs";
import { log } from "../utils/logger.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Classify an error so the caller knows whether a retry can help. */
export function classify(err) {
  const m = (err?.message ? err.message : String(err)).toLowerCase();
  if (m.includes("turnstile") || m.includes("capsolver")) return "turnstile";
  if (m.includes("invalid or expired")) return "code-expired";
  if (m.includes("timed out waiting for the sign-in email")) return "mail-timeout";
  if (m.includes("too many") || m.includes("rate limit") || m.includes("429")) return "rate-limit";
  if (m.includes("net::") || m.includes("timeout") || m.includes("econnreset")) return "network";
  return "other";
}

/**
 * Attempt one account once.
 *
 * @param {import('playwright').BrowserContext} platformContext
 * @param {import('playwright').APIRequestContext} request
 * @param {object} opts
 * @param {number} attemptNo
 */
async function attempt(platformContext, request, opts, attemptNo) {
  const started = Date.now();
  const keyName = opts.keyName || randomKeyName();

  const platformPage = await platformContext.newPage();
  try {
    const inbox = await createInbox(request, {
      domain: opts.domain || undefined,
      localPart: opts.localPart || undefined,
    });
    const { email, domain, token } = inbox;
    log.step(`[try ${attemptNo}] provisioning ${email}`);

    await cyber.requestCode(platformPage, email, opts);

    const code = await waitForCode(request, token, { timeout: opts.timeout });
    log.info(`code received: ${code}`);

    await cyber.submitCode(platformPage, email, code);
    const apiKey = await cyber.createApiKey(platformPage, keyName);

    return {
      ok: true,
      email,
      api_key: apiKey,
      key_name: keyName,
      email_provider: `tempmail.cloud (${domain})`,
      elapsed_ms: Date.now() - started,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      email: null,
      key_name: keyName,
      error: err.message,
      error_kind: classify(err),
      elapsed_ms: Date.now() - started,
      created_at: new Date().toISOString(),
    };
  } finally {
    await platformPage.close().catch(() => {});
  }
}

/**
 * Provision a single account with retries and backoff.
 *
 * @param {import('playwright').BrowserContext} platformContext
 * @param {import('playwright').APIRequestContext} request
 * @param {object} [opts]
 * @returns {Promise<object>} result record
 */
export async function provisionOne(platformContext, request, opts = {}) {
  const retries = Number.isInteger(opts.retries) ? opts.retries : 3;
  let last;
  for (let i = 1; i <= retries + 1; i++) {
    last = await attempt(platformContext, request, opts, i);
    if (last.ok) return last;

    if (last.error_kind === "rate-limit") {
      log.warn("rate limit hit — aborting retries for this account");
      return last;
    }
    if (i <= retries) {
      const backoff = Math.min(8000 * i, 30000);
      log.warn(`attempt ${i} failed (${last.error_kind}); retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  return last;
}