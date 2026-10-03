# Contributing

Thanks for your interest. This project automates a real sign-up flow, so a few
ground rules keep it healthy.

## Setup

```bash
git clone https://github.com/your-org/cyberouter-bulk-creator.git
cd cyberouter-bulk-creator
npm install
npx playwright install --with-deps chromium
cp .env.example .env
```

## Running checks locally

```bash
node --check src/index.mjs
node src/index.mjs --doctor
node src/index.mjs -n 1 --headful
```

## Guidelines

- **Never commit credentials.** Output files (`cyberouter-accounts-*.json`),
  `.env`, and anything containing an `sk-cyberouter_...` key are git-ignored.
  Do not force-add them.
- **Keep it dependency-light.** `playwright` is the only runtime dependency.
- **No CI, no build step.** This repository intentionally ships without
  continuous integration, release automation, or a roadmap. Run the checks
  above by hand before opening a pull request.
- **One concern per change.** Provider and platform selectors change often;
  isolate such changes in the relevant module (`src/cyberouter`,
  `src/inbox`).
- **Document failure modes.** If you fix a selector or a timing bug, add a
  short note to the module docstring explaining the symptom and the fix.

## Reporting issues

Include the command you ran, the `error_kind` from the output, and the
relevant log lines. Redact any `sk-` key and any email address.

## Legal

Use this software only where you are permitted to. Respect Cyberouter's and
zenvex.dev's terms of service. You are responsible for how you use it.
