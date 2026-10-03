#!/usr/bin/env node
/**
 * cyberouter-bulk-creator — CLI entry point.
 *
 * Bulk, end-to-end provisioning of Cyberouter (router.enclave.ai) accounts and
 * API keys, using BlipMail temporary inboxes for email verification and
 * CapSolver for the Cloudflare Turnstile challenge.
 *
 * Exit codes: 0 = every requested account succeeded, 1 = at least one failed,
 * 2 = bad arguments.
 *
 * @module index
 */

import { readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { provisionOne } from "./core/provision.mjs";
import { buildOptions, parseProxy } from "./utils/config.mjs";
import { balance as capsolverBalance } from "./utils/capsolver.mjs";
import { log, color } from "./utils/logger.mjs";

/** Serialize file writes so concurrent workers never interleave appends. */
let writeQueue = Promise.resolve();
function enqueue(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

/** Load an existing results JSON array, tolerating a missing/corrupt file. */
async function loadResults(path) {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Load Playwright lazily so `--help`, `--version` and `--doctor` work even
 * before `npm install`, and so the failure is a clear message rather than a
 * module-resolution stack trace.
 */
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    log.error(
      "playwright is not installed — run `npm install` and " +
        "`npx playwright install --with-deps chromium`",
    );
    process.exit(1);
  }
}

const VERSION = "1.0.0";

function help() {
  process.stdout.write(`
  ${color.bold("cyberouter-bulk-creator")} v${VERSION}

  Bulk-provision Cyberouter (router.enclave.ai) accounts + API keys.

  Usage:
    node src/index.mjs [options]

  Options:
    -n, --count N               number of accounts              (default 1)
    -d, --domain D              blipmail receiving domain       (default: any)
        --results-json FILE     append successful accounts here  (default results.json)
        --results-txt FILE      append email|apikey here         (default results.txt)
    -t, --timeout MS            max wait for the sign-in email  (default 180000)
        --turnstile-timeout MS  max wait for CapSolver          (default 120000)
        --retries N             retries per account              (default 3)
        --concurrency N         accounts in parallel             (default 1)
        --key-name NAME         fixed API-key name (default random)
        --key-pattern PATTERN   random key pattern               (default "{adj}-{noun}-{num}")
        --capsolver-key KEY     CapSolver API key                (or CAPSOLVER_KEY)
        --proxy URL             proxy for browser + requests     (or CYBEROUTER_PROXY)
        --headful               show the browser
        --keep-browser          leave the browser open at the end (debugging)
    -q, --quiet                 print only the final summary
        --doctor                check the environment and exit
    -v, --version               print the version
    -h, --help                  show this help

  Examples:
    node src/index.mjs
    node src/index.mjs -n 5 --concurrency 2
    node src/index.mjs -n 3 --proxy http://user:pass@host:port
    CYBEROUTER_PROXY=socks5://127.0.0.1:1080 node src/index.mjs -n 2 --retries 5
`);
}

/** Environment self-check for `--doctor`. */
async function doctor() {
  const checks = [];
  const node = process.versions.node;
  const major = parseInt(node.split(".")[0], 10);
  checks.push(["node >= 18", major >= 18, `v${node}`]);

  try {
    const { chromium: c } = await loadPlaywright();
    const b = await c.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await b.newPage();
    await page.goto("about:blank");
    await b.close();
    checks.push(["playwright chromium", true, "launch ok"]);
  } catch (e) {
    checks.push(["playwright chromium", false, e.message.slice(0, 80)]);
  }

  let allOk = true;
  log.banner(color.cyan("doctor"));
  for (const [name, ok, detail] of checks) {
    if (!ok) allOk = false;
    const mark = ok ? color.green("✔") : color.red("✘");
    process.stdout.write(`${mark} ${color.white(name.padEnd(22))} ${color.dim(detail)}\n`);
  }
  process.exit(allOk ? 0 : 1);
}

async function main() {
  let opts;
  try {
    opts = buildOptions(process.argv);
  } catch (e) {
    log.error(e.message);
    process.exit(2);
  }
  if (opts.help) return help();
  if (opts.version) return log.raw(VERSION);
  if (opts.doctor) return doctor();

  const resultsJson = opts.resultsJson || "results.json";
  const resultsTxt = opts.resultsTxt || "results.txt";
  const proxy = parseProxy(opts.proxy);

  if (!opts.capsolverKey) {
    log.error("CAPSOLVER_KEY is missing — set it in .env or the environment");
    process.exit(2);
  }

  log.banner(
    color.cyan("◆ cyberouter-bulk-creator") + color.dim(`  v${VERSION}`),
  );
  log.kv({
    accounts: opts.count,
    concurrency: opts.concurrency,
    retries: opts.retries,
    domain: opts.domain || "blipmail default",
  });
  log.kv({
    proxy: proxy ? proxy.server : "none (direct)",
    results: `${resultsJson} + ${resultsTxt}`,
  });

  // Durable success-only store, appended on every successful account.
  const successes = await loadResults(resultsJson);
  const recordSuccess = (r) =>
    enqueue(async () => {
      successes.push({
        email: r.email,
        api_key: r.api_key,
        key_name: r.key_name,
        email_provider: r.email_provider,
        created_at: r.created_at,
      });
      await writeFile(resultsJson, JSON.stringify(successes, null, 2));
      await appendFile(resultsTxt, `${r.email}|${r.api_key}\n`);
    });

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: !opts.headful,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...(proxy ? { proxy } : {}),
  });

  const baseContextOpts = {
    locale: "en-US",
    viewport: { width: 1366, height: 900 },
    ...(proxy ? { proxy } : {}),
  };

  const bal = await capsolverBalance(opts.capsolverKey);
  if (bal !== null) {
    const low = bal < 0.05;
    log.info(
      `${color.dim("capsolver balance")} ${
        low ? color.red(`$${bal}`) + color.yellow("  (low — top up soon)") : color.green(`$${bal}`)
      }`,
    );
  }

  const results = [];

  let next = 0;
  async function worker(id) {
    while (true) {
      const i = next++;
      if (i >= opts.count) return;
      if (!opts.quiet) log.section(`account ${i + 1}/${opts.count}`);
      const r = await provisionOne(browser, baseContextOpts, {
        domain: opts.domain || undefined,
        timeout: opts.timeout,
        turnstileTimeout: opts.turnstileTimeout,
        capsolverKey: opts.capsolverKey,
        retries: opts.retries,
        keyName: opts.keyName,
        keyNamePattern: opts.keyNamePattern,
      });
      results[i] = r;
      if (r.ok) await recordSuccess(r);
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(opts.concurrency, opts.count) }, (_, k) => worker(k)),
    );
  } finally {
    if (!opts.keepBrowser) await browser.close().catch(() => {});
    else log.warn("--keep-browser set: browser left open (stop the process to exit)");
  }

  const ok = results.filter((r) => r?.ok).length;
  const total = results.filter(Boolean).length || 0;
  const allOk = ok === opts.count && total === opts.count;
  log.raw("");
  log.banner(
    `${allOk ? color.green("✔ all succeeded") : color.yellow("⚠ finished")}  ` +
      `${color.bold(`${ok}/${total}`)} ${color.dim("accounts")}`,
  );
  for (const r of results.filter(Boolean)) {
    if (r.ok) {
      log.success(
        `${color.white(r.email)}  ${color.dim("key=")}${color.green(r.api_key)}  ` +
          color.dim(`(${(r.elapsed_ms / 1000).toFixed(1)}s)`),
      );
    } else {
      log.failure(
        `${color.white(r.email || "?")}  ${color.dim(`${r.error_kind}:`)} ${color.red(r.error)}`,
      );
    }
  }
  if (ok > 0) log.info(color.dim(`saved success log → ${resultsJson} + ${resultsTxt}`));
  process.exit(ok === opts.count ? 0 : 1);
}

main().catch((e) => {
  log.error(e.stack || e.message);
  process.exit(1);
});
