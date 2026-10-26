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

S1 checks need Node.js 24 and no Cloudflare credentials:

```sh
npm ci
npm test
```

This validates the committed synthetic bundle, checks deterministic generation and invalid bundles, then
starts `wrangler dev --local` with fresh Ed25519/view/webhook test keys and an empty local D1 database.
The keys (including a temporary `.dev.vars`), config and database live in a temporary directory and are
removed when the run finishes. The existing `test/smoke.mjs` and `test/fuzz.mjs` run unchanged. The runner
reads the site's Wrangler config but replaces the database ID and authentication settings for the local
process; it does not deploy or use the checkout's `.dev.vars`.

The [CI workflow](.github/workflows/ci.yml) runs these checks on pull requests and pushes to `main`.
It has read-only repository permissions and needs no secrets or access to the private engine repository.
The fuzz suite runs all 300 site cases; its optional Python cross-check against `mnq-bot` remains available
locally through the manual command below.

For manual testing with your own test keys:

```sh
npm install
npx wrangler dev --local          # needs a .dev.vars with test keys (git-ignored)
node test/smoke.mjs http://127.0.0.1:8787 <test-keys.json>
node test/fuzz.mjs  http://127.0.0.1:8787 <test-keys.json> ../c3.lab/mnq-bot   # 300 generated cases
```

`test/smoke.mjs` covers pages and headers, research papers (upload limits, signed pull and download, chunk clean-up, result push, delete, the daily cap), signed/unsigned/tampered/stale/replayed pushes, the private views, the
public track record filter, the waitlist (dupes, bad email, honeypot, rate limit, CSV, delete) and the front door
(path, token, IP allowlist, duplicates, signed pull).

## Bundle contract and fixtures

[schemas/README.md](schemas/README.md) documents the version 1 JSON Schemas for every file in the
build plan's section 5.2, including the optional engine description and parity detail files. The schemas
and their shared definitions are the public data contract, not production strategy exports.

```sh
node test/make-fixtures.mjs                         # regenerate the committed fixture bundle
node test/make-fixtures.mjs /tmp/c3-fixtures 123     # separate output, different uint32 seed
node test/validate.mjs                             # validate test/fixtures/bundle/
node test/validate.mjs /tmp/c3-fixtures             # validate an exported/downloaded bundle
node --test test/fixtures.test.mjs                  # reproducibility and negative cases
```

Fixtures contain **2 synthetic runs, 10 sessions of 78 bars, 30 trades, 12 trials and 3 parity days**.
The generator uses a fixed seed and timestamp, no network, clock or private engine files. Both runs include
long/short trades, gains/losses and in/out-of-sample rows. There is a losing month, all four trial verdicts,
and one parity mismatch. These are invented test values, never c3.lab performance. The fixture manifest is
marked `synthetic: true`, run datasets/session sources say `synthetic`, and the commit is a zero sentinel.
Prices are fixture execution prices (slippage assumed embedded); USD is signed points × $2 minus the stated
$1.24 round-trip commission, and R is net USD divided by the $16 initial risk. No trading rules run here.

Known values for later page tests:

| Run | Trades | Short trades | Ending equity (USD) | Net R | Max daily drawdown (USD) |
| --- | --- | --- | --- | --- | --- |
| `orx-synthetic-v1` | 15 | 7 | 25.40 | 1.5875 | 43.44 |
| `orb-synthetic-v1` | 15 | 8 | 25.40 | 1.5875 | 27.72 |

`test/validate.mjs` checks schemas, hashes/bytes, file size budgets, references, sample ranges, OHLC shape,
chronology, and reconciliation of trade, session, daily, monthly, lab and parity totals. Fixture tests compare
the committed files byte-for-byte with the seeded generator; CI does not regenerate them before this check.
Data stays under `test/`, outside the served `public/` assets. R2 seeding and publish routes belong to S4.

## Turning things on later

- **Public results:** `TRACK_RECORD_PUBLIC` is `"true"` (since 2026-10-25); set it to `"false"` to hide them again.
- **TradingView front door:** generate a token and a path, put their SHA-256 hashes in `WEBHOOK_TOKEN_SHA256` /
  `WEBHOOK_PATH_SHA256`, set `WEBHOOK_ENABLED` to `"true"`, and point the alert at
  `https://<site>/hook/<path>`. Check TradingView's sender IPs in `TRADINGVIEW_IPS` against their support page.
