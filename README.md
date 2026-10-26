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

```sh
npm install
npx wrangler dev --local          # needs a .dev.vars with test keys (git-ignored)
node test/smoke.mjs http://127.0.0.1:8787 <test-keys.json>
node test/fuzz.mjs  http://127.0.0.1:8787 <test-keys.json> ../c3.lab/mnq-bot   # 300 generated cases
```

`test/smoke.mjs` covers pages and headers, research papers (upload limits, signed pull and download, chunk clean-up, result push, delete, the daily cap), signed/unsigned/tampered/stale/replayed pushes, the private views, the
public track record filter, the waitlist (dupes, bad email, honeypot, rate limit, CSV, delete) and the front door
(path, token, IP allowlist, duplicates, signed pull).

## Turning things on later

- **Public results:** `TRACK_RECORD_PUBLIC` is `"true"` (since 2026-10-25); set it to `"false"` to hide them again.
- **TradingView front door:** generate a token and a path, put their SHA-256 hashes in `WEBHOOK_TOKEN_SHA256` /
  `WEBHOOK_PATH_SHA256`, set `WEBHOOK_ENABLED` to `"true"`, and point the alert at
  `https://<site>/hook/<path>`. Check TradingView's sender IPs in `TRADINGVIEW_IPS` against their support page.
