<div align="center">

<img src="docs/assets/banner.svg" alt="cyberouter-bulk-creator" width="720">

# cyberouter-bulk-creator

**Bulk, end-to-end provisioning of [Cyberouter](https://router.enclave.ai) (router.enclave.ai) accounts and API keys, verified through [zenvex.dev](https://zenvex.dev) temporary inboxes.**

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

1. Generates a fresh temporary email at **zenvex.dev**.
2. Requests a sign-in code from **Cyberouter**.
3. Reads the emailed code from the temporary inbox.
4. Signs in and creates an **`sk-cyberouter_...` API key**.
5. Writes everything to a JSON file.

It runs the real browser flow with Playwright, so Cloudflare Turnstile and the
platform's HTML form POSTs behave exactly as they do for a person.

```
┌────────────┐   1. email    ┌──────────────┐   2. POST /login   ┌────────────┐
│ zenvex.dev │ ───────────▶  │ inbox window │                    │ Cyberouter │
│  inbox     │               └──────────────┘                    │  /login    │
└────────────┘                                                   └─────┬──────┘
      ▲  3. read code                                                  │
      └──────────────────────────────────────────────────────────────┘
                                                                      │ 4. POST /keys
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
    "email": "swiftfox482913@souss.dev",
    "api_key": "sk-cyberouter_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "key_name": "prod-token-7421",
    "email_provider": "zenvex.dev (souss.dev)",
    "elapsed_ms": 48210,
    "created_at": "2026-10-03T00:00:00.000Z"
  }
]
```

## CLI

| Flag | Description | Default |
|------|-------------|---------|
| `-n, --count N` | number of accounts | `1` |
| `-d, --domain D` | zenvex receiving domain | `souss.dev` |
| `-o, --out FILE` | output JSON file | `cyberouter-accounts-<ts>.json` |
| `-t, --timeout MS` | max wait for the sign-in email | `180000` |
| `--turnstile-timeout MS` | max wait for Cloudflare | `150000` |
| `--retries N` | retries per account | `3` |
| `--concurrency N` | accounts in parallel | `1` |
| `--key-name NAME` | fixed API-key name | random |
| `--proxy URL` | proxy for the browser | none |
| `--headful` | show the browser | off |
| `--keep-browser` | leave the browser open | off |
| `--doctor` | check the environment | – |
| `-q, --quiet` | summary only | off |

## Configuration

Copy `.env.example` to `.env`. CLI flags override environment values, which
override the defaults. Common keys:

```dotenv
CYBEROUTER_DOMAIN=souss.dev
CYBEROUTER_COUNT=1
CYBEROUTER_CONCURRENCY=1
CYBEROUTER_RETRIES=3
CYBEROUTER_TIMEOUT=180000
CYBEROUTER_TURNSTILE_TIMEOUT=150000
CYBEROUTER_PROXY=
```

## The hard parts (and how they are handled)

| Challenge | Symptom | Handling |
|-----------|---------|----------|
| **Turnstile on zenvex** | "Open Inbox" stays disabled | Poll until the challenge issues a token, then click |
| **Transient Turnstile failure** | "security check failed" | Reload, re-fill the address, retry the open |
| **Turnstile on Cyberouter** | submit does nothing | Wait for the widget token before submitting the form |
| **Mail delay** | no code arrives quickly | Bounded polling with a clear `mail-timeout` error |
| **Expired code** | "invalid or expired" | Classified as `code-expired` and retried with a fresh inbox |
| **Rate limits** | HTTP 429 / "too many" | Classified as `rate-limit` and aborted (retry cannot help) |
| **Proxy leaks** | requests bypass the proxy | Proxy is applied to the browser context, so form traffic uses it too |

## Requirements

- **Node.js 18+** (tested on 22)
- **Chromium** via `npx playwright install --with-deps chromium` (needs apt)
- A network egress IP that Cloudflare is willing to pass. A clean residential
  or VPS IP works best; public free proxies almost never pass Turnstile.

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

**Which zenvex domain works?**
`souss.dev` is the one verified to deliver Cyberouter mail. Others are listed
for reference but not verified.

**Why one browser context per job?**
The temporary inbox must not share cookies with the Cyberouter session, so
`--concurrency` spawns isolated contexts.

**Can I run this headless on a server?**
Yes, with Chromium installed and a clean egress IP. Use `--proxy` for
residential egress.

**Is the API key shown again later?**
No. Cyberouter shows it exactly once. It is written to the output JSON; store
that file safely. It is git-ignored.

## Disclaimer

This tool automates a third-party sign-up flow. Use it only where you are
authorised to, and in line with Cyberouter's and zenvex.dev's terms of service.
The authors are not affiliated with either service and accept no liability for
misuse.

## License

[MIT](LICENSE) © cyberouter-bulk-creator contributors
