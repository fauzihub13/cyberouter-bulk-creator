/**
 * Cyberouter (router.enclave.ai) provisioning client.
 *
 * The platform is server-rendered: auth and key creation are HTML form POSTs,
 * not a JSON API. This module drives the real forms through the page context
 * so cookies and CSRF tokens behave the same as a human session. The Turnstile
 * challenge is solved out-of-band with CapSolver and injected into the form.
 *
 * Verified flow
 *   1. GET  /login                      -> capture csrf_token + cookies + sitekey
 *   2. CapSolver solves Turnstile       -> token injected into cf-turnstile-response
 *   3. POST /login   {csrf_token,email,legal_version,cf-turnstile-response}
 *   4. GET  /login   (code step)        -> capture fresh csrf_token
 *   5. POST /login/code {csrf_token,email,code} -> session cookie
 *   6. GET  /keys                       -> session form
 *   7. POST /keys    {name}             -> key shown once in the page
 *
 * @module cyberouter/client
 */

import { log, color } from "../utils/logger.mjs";
import { solveTurnstile } from "../utils/capsolver.mjs";

export const CYBEROUTER = "https://router.enclave.ai";

/** Fallback Turnstile site key, used if the page cannot be parsed. */
export const TURNSTILE_SITEKEY = "0x4AAAAAADo_sGx9Lbpp7iVl";

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

/** Read the Turnstile site key from the page's inline render call. */
async function readSiteKey(page) {
  const html = await page.content().catch(() => "");
  const m = html.match(/sitekey:\s*"([^"]+)"/i) || html.match(/data-sitekey="([^"]+)"/i);
  return m ? m[1] : TURNSTILE_SITEKEY;
}

/**
 * Step 1+2: request a sign-in code for `email`.
 *
 * Cloudflare Turnstile on this form is `execution: "execute"`, so it never
 * runs until submit and a headless/automated browser cannot pass it. We solve
 * it with CapSolver and inject the token into the hidden input. Leaving the
 * page on the "Check your email" code step.
 *
 * @param {import('playwright').Page} page
 * @param {string} email
 * @param {{capsolverKey:string, turnstileTimeout?:number}} opts
 */
export async function requestCode(page, email, opts = {}) {
  await page.goto(`${CYBEROUTER}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 30000 });
  await page.fill('input[name="email"]', email);

  const siteKey = await readSiteKey(page);
  log.step(`${color.dim("solving turnstile")} ${color.dim(`sitekey=${siteKey.slice(0, 12)}…`)}`);
  const token = await solveTurnstile({
    clientKey: opts.capsolverKey,
    websiteURL: `${CYBEROUTER}/login`,
    websiteKey: siteKey,
    action: opts.turnstileAction || "login",
    timeout: opts.turnstileTimeout ?? 120000,
  });
  log.ok(color.dim("turnstile solved via capsolver"));

  const injected = await page.evaluate((t) => {
    const input = document.querySelector('input[name="cf-turnstile-response"]');
    const form = document.querySelector('form[action="/login"]');
    if (!input || !form) return false;
    input.value = t;
    // Submit on the next tick so this evaluate resolves before the navigation
    // tears down the execution context.
    setTimeout(() => form.submit(), 0);
    return true;
  }, token);
  if (!injected) throw new Error("could not inject the turnstile token into the login form");

  // The form POSTs and the server responds with the code step (same URL).
  await page
    .waitForFunction(() => /check your email|sign-in code/i.test(document.body.innerText), null, {
      timeout: 30000,
    })
    .catch(() => {});
  await sleep(1000);

  const text = await page.evaluate(() => document.body.innerText);
  if (!/check your email|sign-in code/i.test(text)) {
    throw new Error(`code request did not reach the code step: ${text.slice(0, 160)}`);
  }
  log.ok(color.dim("sign-in code requested"));
}

/**
 * Step 3+4: submit the emailed code and confirm we are signed in.
 *
 * @param {import('playwright').Page} page
 * @param {string} email
 * @param {string} code
 */
export async function submitCode(page, email, code) {
  log.step(color.dim("submitting code + signing in"));
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
  log.ok(color.bold(color.green("signed in")));
}

/**
 * Step 5+6: create an API key and return the one-time plaintext value.
 *
 * @param {import('playwright').Page} page
 * @param {string} name
 * @returns {Promise<string>} the `sk-cyberouter_...` key
 */
export async function createApiKey(page, name) {
  log.step(`${color.dim("creating API key")} ${color.dim(`name=${name}`)}`);
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
  log.ok(color.bold(color.green(`API key created`)) + "  " + color.dim(key));
  return key;
}
