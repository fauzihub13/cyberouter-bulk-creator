/**
 * Cyberouter (router.enclave.ai) provisioning client.
 *
 * The platform is server-rendered: auth and key creation are HTML form POSTs,
 * not a JSON API. This module drives the real forms through the page context
 * so cookies, CSRF tokens and the Cloudflare Turnstile widget all behave the
 * same as a human session.
 *
 * Verified flow
 *   1. GET  /login                      -> capture csrf_token + cookies
 *   2. POST /login   {csrf_token,email,legal_version}  (Turnstile token attached)
 *   3. GET  /login   (code step)        -> capture fresh csrf_token
 *   4. POST /login   {csrf_token,email,code}           -> session cookie
 *   5. GET  /keys                       -> session form
 *   6. POST /keys    {name}             -> key shown once in the page
 *
 * @module cyberouter/client
 */

import { log } from "../utils/logger.mjs";

export const CYBEROUTER = "https://router.enclave.ai";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read the CSRF token (and legal version) from the current document. */
async function readFormState(page) {
  return page.evaluate(() => {
    const get = (name) => document.querySelector(`input[name="${name}"]`)?.value ?? null;
    return {
      csrf: get("csrf_token"),
      legal: get("legal_version"),
      email: get("email"),
    };
  });
}

/** Wait until a Turnstile response token exists (if the form uses Turnstile). */
async function settleTurnstile(page, timeoutMs = 150000) {
  const deadline = Date.now() + timeoutMs;
  const hasWidget = await page
    .locator('[data-turnstile], .cf-turnstile, input[name="cf-turnstile-response"]')
    .count()
    .catch(() => 0);
  if (!hasWidget) return;
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => {
        const tok = document.querySelector('input[name="cf-turnstile-response"]');
        return {
          token: tok ? (tok.value || "").length : 0,
          failed: /security check failed/i.test(document.body.innerText || ""),
        };
      })
      .catch(() => null);
    if (state?.failed) throw new Error("turnstile: security check failed");
    if (state && state.token > 0) return;
    await sleep(1500);
  }
  throw new Error("turnstile did not issue a token before the timeout");
}

/**
 * Step 1+2: request a sign-in code for `email`.
 * Leaves the page on the "Check your email" code step.
 *
 * @param {import('playwright').Page} page
 * @param {string} email
 * @param {{turnstileTimeout?:number}} [opts]
 */
export async function requestCode(page, email, opts = {}) {
  await page.goto(`${CYBEROUTER}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 30000 });
  await page.fill('input[name="email"]', email);

  await settleTurnstile(page, opts.turnstileTimeout ?? 150000);
  await Promise.all([
    page.waitForLoadState("domcontentloaded").catch(() => {}),
    page.click('form[action="/login"] button[type="submit"], button:has-text("Email me a code")'),
  ]);
  await sleep(1500);

  const text = await page.evaluate(() => document.body.innerText);
  if (!/check your email|sign-in code/i.test(text)) {
    throw new Error(`code request did not reach the code step: ${text.slice(0, 160)}`);
  }
  log.info("sign-in code requested");
}

/**
 * Step 3+4: submit the emailed code and confirm we are signed in.
 *
 * @param {import('playwright').Page} page
 * @param {string} email
 * @param {string} code
 */
export async function submitCode(page, email, code) {
  const state = await readFormState(page);
  const csrf = state.csrf;
  if (!csrf) throw new Error("no csrf_token found on the code step");

  await page.locator('input[name="code"]').waitFor({ state: "visible", timeout: 30000 });
  await page.fill('input[name="code"]', code);
  await Promise.all([
    page.waitForLoadState("domcontentloaded").catch(() => {}),
    page.click('form button[type="submit"], button:has-text("Sign in")'),
  ]);
  await sleep(2000);

  const url = page.url();
  const text = await page.evaluate(() => document.body.innerText);
  if (/invalid or expired|expired|incorrect/i.test(text) && !/Overview|API Keys/i.test(text)) {
    throw new Error("verification code is invalid or expired");
  }
  if (!/Overview|API Keys|Credits|Playground/i.test(text) && url.includes("/login")) {
    throw new Error("sign-in did not establish a session");
  }
  log.ok("signed in");
}

/**
 * Step 5+6: create an API key and return the one-time plaintext value.
 *
 * @param {import('playwright').Page} page
 * @param {string} name
 * @returns {Promise<string>} the `sk-cyberouter_...` key
 */
export async function createApiKey(page, name) {
  await page.goto(`${CYBEROUTER}/keys`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const keyInput = page.locator('input[name="name"]');
  await keyInput.waitFor({ state: "visible", timeout: 30000 });
  await keyInput.fill(name);

  await Promise.all([
    page.waitForLoadState("domcontentloaded").catch(() => {}),
    page.click('form[action="/keys"] button[type="submit"], button:has-text("New key")'),
  ]);
  await sleep(1500);

  const key = await page.evaluate(() => {
    const body = document.body.innerText;
    const m = body.match(/sk-cyberouter_[a-z0-9]+/i);
    return m ? m[0] : null;
  });
  if (!key) throw new Error("API key was not shown after creation");
  log.ok("API key created");
  return key;
}

/**
 * Full end-to-end provisioning for one account.
 *
 * @param {import('playwright').Page} page
 * @param {object} opts
 * @returns {Promise<{email:string, api_key:string, key_name:string}>}
 */
export async function provisionOnPage(page, opts) {
  const { email, keyName } = opts;
  await requestCode(page, email, opts);
  const code = await opts.waitForCode(page, email.split("@")[0]);
  await submitCode(page, email, code);
  const apiKey = await createApiKey(page, keyName);
  return { email, api_key: apiKey, key_name: keyName };
}
