# c3-site

The c3.lab website: one Cloudflare Worker (`c3-lab`) with static pages and a small D1 database.

**[docs/build-plan.md](docs/build-plan.md)** is the build plan for what comes next (Codex handoff, tasks with acceptance criteria).
**[docs/redesign/blueprint.md](docs/redesign/blueprint.md)** explains the design (what was learned from a reference site, the tokens, budgets and next phases).
**[docs/architecture.html](docs/architecture.html)** (open in a browser) shows who talks to the Worker and what D1
keeps, with every box linked to its source lines. Source: `docs/architecture.archify.json`.

| Path | What it is |
| --- | --- |
| `/` | Home page |
| `/track-record/` | Public results. Says "no public results yet" until `TRACK_RECORD_PUBLIC` is `"true"` |
| `/join/` | Waitlist signup (email + optional note, honeypot and 5-an-hour limit per connection) |
| `/app/` | Private dashboard: bot status, session coverage, MNQ bot today, research (approve/retire strategies), research papers, swing desk, controls, track record preview, waitlist, webhooks |
| `/styleguide/` | Noindex instrument sheet: both themes, tokens, state chips, figures and controls. Synthetic fixtures only |
| `POST /api/ingest` | The MNQ bot's signed pushes (status every minute, snapshot every 5 minutes, paper stats) |
| `POST /hook/<path>` | TradingView front door, **off** (`WEBHOOK_ENABLED`) until the receiver design is agreed |
| `GET /api/hook/pull` | Signed; the receiver collects stored webhooks (exact text, duplicates flagged) |
| `/api/p/commands`, `/api/cmd/pull`, `/api/cmd/ack` | Controls: the dashboard queues a command signed with your control code (HMAC); the bot pulls it (signed), checks the HMAC, runs it and reports back |
| `/api/p/papers` (GET, POST, `DELETE /:id`), `/api/papers/pull`, `/api/papers/blob/:id` | Research papers: you add a PDF (up to 20 MB, stored in 1.5 MB D1 rows) or a link; pressing Analyse sends a control-code-signed `analyze_paper` command pinned to the file's SHA-256. The bot pulls the paper (signed), deletes the site's copy once it has its own, and pushes the analysis back as a signed `papers` ingest. At most 10 papers a day |

## No secrets in this repo

Everything in `wrangler.jsonc` is safe to read:

- `BOT_PUBLIC_KEY` is the public half of the bot's Ed25519 key. The private half is `ABG_SITE_SIGNING_KEY` in
  `mnq-bot/.env`. Every push is signed over `METHOD`, `path?query`, the time and the body's SHA-256; unsigned,
  altered, replayed or more-than-5-minutes-old requests are rejected.
- `VIEW_KEY_SHA256` is a hash of the private dashboard key (`ABG_SITE_VIEW_KEY` in `mnq-bot/.env`). The key travels
  in the link's `#fragment`, which browsers never send to servers, and then as an `Authorization` header.
- `WEBHOOK_PATH_SHA256` / `WEBHOOK_TOKEN_SHA256` are hashes too. Per-request logs are off so URLs never reach logs.

Get the private link on the bot's computer: `.venv\Scripts\mnq site link` (inside `mnq-bot`).

## Deploys

Pushing to `main` deploys through Cloudflare Workers Builds (`npx wrangler deploy`). The D1 database `c3-site` is
pinned by ID in `wrangler.jsonc`; the Worker creates its tables on first use.

## Local check

Use Node 22 or newer. CI runs the same checks on pull requests and pushes to `main`.
It uses generated test keys and an isolated local D1 database; no Cloudflare account or secrets are needed.

```sh
npm ci
npx playwright install chromium  # once; CI also installs the browser's Linux dependencies
npm test                         # fixtures, contrast, smoke, fuzz and browser checks
```

`npm run test:local` starts `wrangler dev --local`, waits for health, runs smoke, fuzz and browser
checks, then removes the temporary keys and database. It does not read the checkout's `.dev.vars` or
the private c3.lab repository. The optional Python cross-check in fuzz still needs c3.lab when run manually.

`npm run test:contrast` checks the actual CSS tokens: graphics at least 3:1 and text at least 4.5:1 on both
page and panel backgrounds. `npm run test:ui` runs the browser checks alone. Playwright covers all six routes
in light and dark at 320, 390, 768 and 1440 px, serious/critical axe violations, console errors, third-party
requests, theme persistence, reduced motion, keyboard controls and no-JS tables. Screenshots and the run report
go to git-ignored `test/artifacts/`; CI uploads them as `ui-screenshots`.

For a local before/after CSS review, save the prior stylesheet and pass its absolute path as
`C3_BASELINE_CSS` when running the UI suite. It captures both versions of the existing pages at 390 and
1440 px, including the home candles, and checks that their layout geometry stays the same. This supplements
visual review; it is not a pixel baseline for future design changes.

To test an already running local Worker with your own test keys:

```sh
npx wrangler dev --local          # .dev.vars with test keys (git-ignored)
node test/smoke.mjs http://127.0.0.1:8787 <test-keys.json>
node test/fuzz.mjs  http://127.0.0.1:8787 <test-keys.json> ../c3.lab/mnq-bot   # 300 generated cases
```

`test/smoke.mjs` covers pages and headers, research papers (upload limits, signed pull and download, chunk clean-up, result push, delete, the daily cap), signed/unsigned/tampered/stale/replayed pushes, the private views, the
public track record filter, the waitlist (dupes, bad email, honeypot, rate limit, CSV, delete) and the front door
(path, token, IP allowlist, duplicates, signed pull).

## Data fixtures and contract

[schemas/README.md](schemas/README.md) documents the version 1 bundle contract. JSON Schemas reject
unknown fields, including private parameters and trial rationale. The validator also checks file hashes,
byte limits, references, sample splits and P&L totals. Schema validation does not replace exporter redaction.

```sh
npm run fixtures                # regenerate the committed bundle with the default seed
node test/validate.mjs           # validate test/fixtures/bundle/
node test/validate.mjs <bundle-directory>
npm run test:fixtures            # determinism and invalid-bundle checks
```

The fixture bundle contains two runs, ten 78-bar sessions, thirty trades, twelve lab trials and three
parity days. All prices and results are synthetic. It lives outside `public/` and is not served or uploaded.
Regeneration is byte-identical for the same seed. Tests compare the committed files with a fresh generation.
R2 publishing and local R2 seeding come in S4.

## Turning things on later

- **Public results:** `TRACK_RECORD_PUBLIC` is `"true"` (since 2026-10-25); set it to `"false"` to hide them again.
- **TradingView front door:** generate a token and a path, put their SHA-256 hashes in `WEBHOOK_TOKEN_SHA256` /
  `WEBHOOK_PATH_SHA256`, set `WEBHOOK_ENABLED` to `"true"`, and point the alert at
  `https://<site>/hook/<path>`. Check TradingView's sender IPs in `TRADINGVIEW_IPS` against their support page.
