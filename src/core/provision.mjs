/**
 * Core provisioning flow: one Cyberouter account + one API key, end-to-end.
 *
 * Two browser contexts are used per account — one for the Cyberouter session
 * and one for the zenvex inbox — so that opening the temporary inbox never
 * disturbs the platform session (different cookie jars).
 *
 * @module core/provision
 */

import * as cyber from "../cyberouter/client.mjs";
import { waitForCode } from "../inbox/zenvex.mjs";
import { randomEmailLocal, randomKeyName } from "../utils/random.mjs";
import { log } from "../utils/logger.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Classify an error so the caller knows whether a retry can help. */
export function classify(err) {
  const m = (err?.message ? err.message : String(err)).toLowerCase();
  if (m.includes("turnstile")) return "turnstile";
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
 * @param {import('playwright').BrowserContext} inboxContext
 * @param {object} opts
 * @param {number} attemptNo
 */
async function attempt(platformContext, inboxContext, opts, attemptNo) {
  const started = Date.now();
  const domain = opts.domain || "souss.dev";
  const local = randomEmailLocal();
  const email = `${local}@${domain}`;
  const keyName = opts.keyName || randomKeyName();

  const platformPage = await platformContext.newPage();
  const inboxPage = await inboxContext.newPage();
  try {
    log.step(`[try ${attemptNo}] provisioning ${email}`);

    await cyber.requestCode(platformPage, email, opts);

    const code = await waitForCode(inboxPage, local, {
      timeout: opts.timeout,
      turnstileTimeout: opts.turnstileTimeout,
      domain,
    });
    log.info(`code received: ${code}`);

    await cyber.submitCode(platformPage, email, code);
    const apiKey = await cyber.createApiKey(platformPage, keyName);

    return {
      ok: true,
      email,
      api_key: apiKey,
      key_name: keyName,
      email_provider: `zenvex.dev (${domain})`,
      elapsed_ms: Date.now() - started,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      email,
      key_name: keyName,
      error: err.message,
      error_kind: classify(err),
      elapsed_ms: Date.now() - started,
      created_at: new Date().toISOString(),
    };
  } finally {
    await platformPage.close().catch(() => {});
    await inboxPage.close().catch(() => {});
  }
}

/**
 * Provision a single account with retries and backoff.
 *
 * @param {import('playwright').BrowserContext} platformContext
 * @param {import('playwright').BrowserContext} inboxContext
 * @param {object} [opts]
 * @returns {Promise<object>} result record
 */
export async function provisionOne(platformContext, inboxContext, opts = {}) {
  const retries = Number.isInteger(opts.retries) ? opts.retries : 3;
  let last;
  for (let i = 1; i <= retries + 1; i++) {
    last = await attempt(platformContext, inboxContext, opts, i);
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
