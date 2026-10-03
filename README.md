<div align="center">

<img src="docs/assets/banner.svg" alt="cyberouter-bulk-creator" width="720">

# cyberouter-bulk-creator

**Bulk, end-to-end provisioning of [Cyberouter](https://router.enclave.ai) (router.enclave.ai) accounts and API keys, verified through [tempmail.cloud](https://tempmail.cloud) temporary inboxes, with the Cloudflare Turnstile challenge solved by [CapSolver](https://capsolver.com).**

[![License: MIT](https://img.shields.io/badge/license-MIT-38e1ff.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-8b5cff.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/playwright-1.47.2-2ead33.svg?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev)
[![Platform](https://img.shields.io/badge/platform-cyberouter-0b1020.svg?style=flat-square)](https://router.enclave.ai)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-38e1ff.svg?style=flat-square)](CONTRIBUTING.md)
[![No CI](https://img.shields.io/badge/CI-none-lightgrey.svg?style=flat-square)](#philosophy)

**English** · [Bahasa Indonesia](README.id.md) · [中文](README.zh.md) · [Español](README.es.md) · [日本語](README.ja.md)

</div>

---

## What it does

One command creates Cyberouter accounts and API keys, end to end:

1. Creates a fresh temporary email at **tempmail.cloud** (over its JSON API).
2. Solves Cyberouter's Cloudflare Turnstile with **CapSolver**.
3. Requests a sign-in code from **Cyberouter**.
4. Reads the emailed code from the temporary inbox.
5. Signs in and creates an **`sk-cyberouter_...` API key**.
6. Writes everything to a JSON file.

It drives the real Cyberouter browser flow with Playwright, so cookies, CSRF
tokens, and the platform's HTML form POSTs behave exactly as they do for a
person; only the Turnstile token is obtained out-of-band, because the widget is
deferred and never solves in an automated browser.

```
┌───────────────┐  1. mailbox   ┌──────────────┐  2. POST /login  ┌────────────┐
│ tempmail.cloud│ ────────────▶ │ inbox (API)  │                  │ Cyberouter │
│   REST API    │               └──────────────┘                  │  /login    │
└───────────────┘                      ▲                          └─────┬──────┘
        ▲  4. read code                │ 3. CapSolver token              │
        └──────────────────────────────┴─────────────────────────────────┘
                                                                        │ 5. POST /keys
                                                                        ▼
                                                          sk-cyberouter_xxxxxxxx
```

## Quick start

```bash
git clone https://github.com/your-org/cyberouter-bulk-creator.git
cd cyberouter-bulk-creator
npm install
npx playwright install --with-deps chromium
cp .env.example .env
# then set CAPSOLVER_KEY in .env (https://dashboard.capsolver.com)

# one account
node src/index.mjs

# five accounts, two at a time
node src/index.mjs -n 5 --concurrency 2
```

Output lands in `cyberouter-accounts-<timestamp>.json`:

```json
[
  {
    "ok": true,
    "email": "bright.7b06a5@digital.tempmail.cloud",
    "api_key": "sk-cyberouter_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "key_name": "prod-token-7421",
    "email_provider": "tempmail.cloud (digital.tempmail.cloud)",
    "elapsed_ms": 19579,
    "created_at": "2026-10-03T00:00:00.000Z"
  }
]
```

## CLI

| Flag | Description | Default |
|------|-------------|---------|
| `-n, --count N` | number of accounts | `1` |
| `-d, --domain D` | tempmail receiving domain | tempmail default |
| `-o, --out FILE` | output JSON file | `cyberouter-accounts-<ts>.json` |
| `-t, --timeout MS` | max wait for the sign-in email | `180000` |
| `--turnstile-timeout MS` | max wait for CapSolver | `120000` |
| `--retries N` | retries per account | `3` |
| `--concurrency N` | accounts in parallel | `1` |
| `--key-name NAME` | fixed API-key name | random |
| `--capsolver-key KEY` | CapSolver API key | `CAPSOLVER_KEY` |
| `--proxy URL` | proxy for the browser and API | none |
| `--headful` | show the browser | off |
| `--keep-browser` | leave the browser open | off |
| `--doctor` | check the environment | – |
| `-q, --quiet` | summary only | off |

## Configuration

Copy `.env.example` to `.env`. CLI flags override environment values, which
override the defaults. Common keys:

```dotenv
CAPSOLVER_KEY=your-capsolver-key
CYBEROUTER_DOMAIN=
CYBEROUTER_COUNT=1
CYBEROUTER_CONCURRENCY=1
CYBEROUTER_RETRIES=3
CYBEROUTER_TIMEOUT=180000
CYBEROUTER_TURNSTILE_TIMEOUT=120000
CYBEROUTER_PROXY=
```

`CAPSOLVER_KEY` is required. Optionally set `CYBEROUTER_DOMAIN` to pin one of
tempmail.cloud's receiving domains; leave it empty to let the service choose.

## The hard parts (and how they are handled)

| Challenge | Symptom | Handling |
|-----------|---------|----------|
| **Turnstile on Cyberouter** | deferred `execute` widget never solves; submit does nothing | Solve with CapSolver and inject the token into `cf-turnstile-response` |
| **Solve timing** | context destroyed on submit | Submit on the next tick so the injection evaluate resolves first |
| **Mail delay** | no code arrives quickly | Bounded polling of the tempmail.cloud API with a `mail-timeout` error |
| **Expired code** | "invalid or expired" | Classified as `code-expired` and retried with a fresh inbox |
| **Rate limits** | HTTP 429 / "too many" | Classified as `rate-limit` and aborted (retry cannot help) |
| **Proxy leaks** | requests bypass the proxy | Proxy is applied to the browser context; the inbox API shares it |

## Requirements

- **Node.js 18+** (tested on 24)
- **Chromium** via `npx playwright install --with-deps chromium` (needs apt)
- A **CapSolver API key** with credit — it solves the Turnstile challenge.
- A network egress IP that Cloudflare is willing to pass. A clean residential
  or VPS IP works best.

Run `node src/index.mjs --doctor` to verify the environment.

## Philosophy

This repository is intentionally minimal:

- **No CI.** No workflows, no pipelines. Run `node --check` and `--doctor`
  locally.
- **No roadmap.** Issues and pull requests are welcome; there is no published
  plan.
- **No version releases.** The `main` branch is the project. Use `VERSION` in
  `src/index.mjs` if you need to pin behaviour.

## FAQ

**Which tempmail domain works?**
Any of tempmail.cloud's active receiving domains works; Cyberouter mail is
delivered to whichever one the service assigns. Pin one with `-d`/`--domain`
only if you need to.

**Why two contexts for the same job?**
The Cyberouter session and the tempmail.cloud API are isolated: the inbox API
runs through a Playwright `APIRequestContext` that shares the egress proxy but
not the Cyberouter cookie jar. `--concurrency` therefore spawns isolated
platform contexts.

**Can I run this headless on a server?**
Yes. Turnstile is solved by CapSolver, so no interactive browser is needed.

**Is the API key shown again later?**
No. Cyberouter shows it exactly once. It is written to the output JSON; store
that file safely. It is git-ignored.

## Disclaimer

This tool automates a third-party sign-up flow. Use it only where you are
authorised to, and in line with Cyberouter's, tempmail.cloud's, and CapSolver's
terms of service. The authors are not affiliated with any service and accept no
liability for misuse.

## License

[MIT](LICENSE) © cyberouter-bulk-creator contributors
