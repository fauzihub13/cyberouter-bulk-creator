/**
 * CapSolver Cloudflare Turnstile solver.
 *
 * Cyberouter renders Turnstile with `execution: "execute"` (deferred): the
 * widget only runs when the form is submitted, and a headless (or even headful
 * automated) browser never passes the challenge. Instead of driving the widget
 * we ask CapSolver for a token and inject it into the hidden
 * `cf-turnstile-response` input before submitting the form.
 *
 * API: https://docs.capsolver.com/en/guide/captcha/cloudflare_turnstile/
 *
 * @module utils/capsolver
 */

const API = "https://api.capsolver.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`capsolver ${path} HTTP ${res.status}`);
  return res.json();
}

/**
 * Solve a Turnstile challenge and return the token.
 *
 * @param {object} opts
 * @param {string} opts.clientKey   CapSolver API key
 * @param {string} opts.websiteURL  page URL, e.g. https://router.enclave.ai/login
 * @param {string} opts.websiteKey  Turnstile site key
 * @param {string} [opts.action]    optional Turnstile `action`
 * @param {number} [opts.timeout]   max ms to wait for the solution (default 120000)
 * @returns {Promise<string>} the Turnstile token
 */
export async function solveTurnstile(opts) {
  const { clientKey, websiteURL, websiteKey, action, timeout = 120000 } = opts;
  if (!clientKey) throw new Error("capsolver: missing CAPSOLVER_KEY");

  const task = {
    type: "AntiTurnstileTaskProxyLess",
    websiteURL,
    websiteKey,
  };
  if (action) task.metadata = { action };

  const created = await post("/createTask", { clientKey, task });
  if (!created.taskId) {
    throw new Error(
      `capsolver createTask failed: ${created.errorCode || ""} ${created.errorDescription || JSON.stringify(created)}`,
    );
  }

  const deadline = Date.now() + timeout;
  let lastStatus = "idle";
  while (Date.now() < deadline) {
    await sleep(2000);
    const res = await post("/getTaskResult", { clientKey, taskId: created.taskId });
    if (res.errorId) {
      throw new Error(
        `capsolver solve failed: ${res.errorCode || ""} ${res.errorDescription || ""}`.trim(),
      );
    }
    if (res.status === "ready") {
      const token = res.solution?.token;
      if (!token) throw new Error("capsolver returned an empty token");
      return token;
    }
    lastStatus = res.status || lastStatus;
  }
  throw new Error(`capsolver timed out (last status: ${lastStatus})`);
}

/** Log the account balance (best effort) so a low balance is visible early. */
export async function balance(clientKey) {
  try {
    const res = await post("/getBalance", { clientKey });
    return res.balance;
  } catch {
    return null;
  }
}