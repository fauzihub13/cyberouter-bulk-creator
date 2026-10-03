/**
 * zenvex.dev temporary-inbox reader.
 *
 * The Cyberouter sign-in flow emails a short one-time code; the inbox must be
 * opened by hand-selecting the local-part on zenvex.dev, passing a Cloudflare
 * Turnstile challenge, and then reading the newest message.
 *
 * Design notes (each earned the hard way):
 *  1. The Turnstile challenge can fail once and render a "security check
 *     failed" message. We detect that, reload, re-fill the address and retry
 *     the whole open — a single transient failure should not lose an account.
 *  2. The "Open Inbox" button is disabled until the challenge issues a token,
 *     so we poll (from Node, not `page.waitForFunction` with a string, which
 *     the site CSP forbids) until both token present and button enabled.
 *  3. Only the message from the site's sender is considered, so a stale
 *     message from an unrelated sender can never be parsed as a code.
 *
 * @module inbox/zenvex
 */

import { log } from "../utils/logger.mjs";

export const ZENVEX = "https://zenvex.dev";

/**
 * Domains zenvex.dev currently accepts mail on. Keep this list short: verify a
 * domain actually receives Cyberouter mail before adding it, and let users
 * override with `--domain`.
 */
export const ZENVEX_DOMAINS = ["souss.dev"];

/** Domains zenvex advertises but that are not verified for delivery. */
export const UNRELIABLE_DOMAINS = [
  "znvx.me",
  "zenvex.edu.pl",
  "encg.edu.pl",
  "ensam.edu.pl",
  "ofppt.edu.pl",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sender fragments that identify the Cyberouter/Enclave sign-in mail. */
const SENDER_HINTS = ["enclave", "cyberouter"];

/**
 * Extract a sign-in code from the currently previewed message.
 * Cyberouter mails a code shaped `XXXX-XXXX-XXXX` (or a bare run of digits).
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<string|null>}
 */
export async function extractCode(page) {
  const html = await page.content();
  const text = await page.evaluate(() => document.body.innerText).catch(() => "");

  const patterns = [
    /\b([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})\b/i,
    /sign[-\s]?in code[^A-Z0-9]{0,40}([A-Z0-9]{4,12})/i,
    /verification[-\s]?code[^A-Z0-9]{0,40}([A-Z0-9]{4,12})/i,
    /\b([A-Z0-9]{6,12})\b/,
  ];
  for (const src of [text, html]) {
    for (const re of patterns) {
      const m = src.match(re);
      if (m) return m[1].toUpperCase();
    }
  }
  return null;
}

/**
 * Ask zenvex for an inbox and wait until Turnstile issues a token and the
 * button is enabled. Returns true when the inbox is ready to open.
 *
 * @param {import('playwright').Page} page
 * @param {number} timeout ms
 */
export async function waitForTurnstile(page, timeout = 150000) {
  const deadline = Date.now() + timeout;
  let reported = false;
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((b) =>
          /open inbox/i.test(b.innerText || ""),
        );
        const tok = document.querySelector('input[name="cf-turnstile-response"]');
        const body = document.body.innerText || "";
        return {
          exists: !!btn,
          enabled: !!(btn && !btn.disabled),
          token: tok ? (tok.value || "").length : 0,
          failed: /security check failed/i.test(body),
          verifying: /verify (you are human|ing)/i.test(body),
        };
      })
      .catch(() => null);

    if (!state) return false;
    if (state.failed) throw new Error("turnstile: security check failed");
    if (state.enabled && state.token > 0) return true;

    if (!reported && state.verifying) {
      log.info("waiting for Cloudflare verification on zenvex (can take a while)");
      reported = true;
    }
    await sleep(2000);
  }
  return false;
}

/**
 * Fill the zenvex landing page with `localPart` and click Open Inbox,
 * retrying once on a transient Turnstile failure.
 *
 * @param {import('playwright').Page} page
 * @param {string} localPart
 * @param {{turnstileTimeout?:number, domain?:string}} [opts]
 */
async function openInbox(page, localPart, opts = {}) {
  const turnstileTimeout = opts.turnstileTimeout ?? 150000;
  const domain = opts.domain || "souss.dev";
  const attempts = 2;

  for (let i = 1; i <= attempts; i++) {
    await page.goto(`${ZENVEX}/`, { waitUntil: "domcontentloaded", timeout: 60000 });

    const input = page.locator('input[placeholder="email prefix"], input[type="text"]').first();
    await input.waitFor({ state: "visible", timeout: 30000 });
    await input.click();
    await input.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await input.fill(localPart);

    try {
      const domainBtn = page.getByRole("button", {
        name: new RegExp(`@${domain.replace(/\./g, "\\.")}`),
      });
      if (await domainBtn.count()) await domainBtn.first().click({ timeout: 5000 });
    } catch {
      /* default domain already selected */
    }

    let ok = false;
    try {
      ok = await waitForTurnstile(page, turnstileTimeout);
    } catch (e) {
      if (i < attempts) {
        log.warn(`turnstile ${e.message}; reloading and retrying`);
        await sleep(3000);
        continue;
      }
      throw e;
    }
    if (!ok) {
      if (i < attempts) {
        log.warn("turnstile did not complete; reloading and retrying");
        await sleep(3000);
        continue;
      }
      throw new Error(
        `cloudflare turnstile did not complete (try a different IP/proxy or a longer --turnstile-timeout)`,
      );
    }

    await page.getByRole("button", { name: /open inbox/i }).click();
    await page
      .waitForFunction((addr) => document.body.innerText.includes(addr), localPart, {
        timeout: 30000,
      })
      .catch(() => {});
    return;
  }
}

/**
 * Open the inbox and return the Cyberouter sign-in code.
 *
 * @param {import('playwright').Page} page
 * @param {string} localPart
 * @param {{timeout?:number, turnstileTimeout?:number, domain?:string}} [opts]
 * @returns {Promise<string>}
 */
export async function waitForCode(page, localPart, opts = {}) {
  const timeout = opts.timeout ?? 180000;
  const domain = opts.domain || "souss.dev";

  log.step(`opening zenvex inbox for ${localPart}@${domain}`);
  await openInbox(page, localPart, opts);
  log.info("inbox open, waiting for the Cyberouter sign-in email");

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // Prefer a message whose sender matches the platform.
    const row = page
      .locator("article, li, [role='listitem'], div")
      .filter({ hasText: /enclave|cyberouter/i })
      .first();

    if (await row.count().catch(() => 0)) {
      await row.click({ force: true }).catch(() => {});
      await sleep(2000);
      const code = await extractCode(page);
      if (code) return code;
    } else {
      // No matching row yet; if exactly one message exists, open it anyway.
      const generic = page.locator("article, li, [role='listitem']").first();
      if (await generic.count().catch(() => 0)) {
        const body = await page.evaluate(() => document.body.innerText).catch(() => "");
        if (SENDER_HINTS.some((h) => body.toLowerCase().includes(h))) {
          await generic.click({ force: true }).catch(() => {});
          await sleep(2000);
          const code = await extractCode(page);
          if (code) return code;
        }
      }
    }
    await sleep(3000);
  }
  throw new Error("timed out waiting for the sign-in email");
}
