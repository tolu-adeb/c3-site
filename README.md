# c3.site

The c3.lab website: one Cloudflare Worker (`c3-lab`) with static pages, D1 and private R2 data storage.

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
| `/backtests/` | Exported hypothetical runs, filters, equity/drawdown, monthly values, distributions, sample comparisons and a replay-linked trade table |
| `/replay/?run=<id>&day=<date>` | Exported five-minute session, trade overlays, decision log, score/gates and keyboard scrubber |
| `/strategies/`, `/strategies/<id>/` | Exported states and theory, separate hypothetical headline runs and recorded session examples |
| `/engine/` | JSON-driven wireframe pipeline, keyboard node panels and a no-JS ordered list |
| `POST /api/ingest` | The MNQ bot's signed pushes (status every minute, snapshot every 5 minutes, paper stats) |
| `PUT /api/publish/put?bundle=<id>&path=<relative.json>` | Signed bot upload to private R2 staging; JSON only, at most 5 MiB |
| `POST /api/publish/commit?bundle=<id>` | Signed manifest; verifies every staged file's SHA-256 and bytes before switching the current bundle |
| `POST /api/publish/abort?bundle=<id>` | Signed; removes an unpublished bundle's staged files and incomplete live copies |
| `GET /data/<relative.json>` | Public only when `BACKTESTS_PUBLIC` is `"true"`; 5-minute cache and SHA-256 ETag |
| `GET /api/p/data/<relative.json>` | View-key read of current data; `?staging=<bundle>` previews staging; always `no-store` |
| `GET /api/p/published` | View-key inventory: current and staged bundles, readiness, paths, sizes and hashes |
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
The public Strategy Lab feature was cancelled. Legacy Lab fixture files remain for compatibility; exporters
may omit both Lab files and the deprecated strategy `lab_trials` field. No Lab UI or public history is rendered.
Regeneration is byte-identical for the same seed. Tests compare the committed files with a fresh generation.
For local R2 seeding, use `node scripts/seed-r2.mjs <local-base-url> <test-keys.json> [bundle-directory]`.
Add `--preview` to leave the bundle staged. The script refuses non-local hosts and validates the bundle before
uploading. Test keys must match the local Worker's `.dev.vars`; the automated runner generates both.

## Signed bundle publishing

The `DATA` binding uses bucket `c3-site-data`. New backtest data stays private: `BACKTESTS_PUBLIC` is `"false"`.
The signer uses the existing `METHOD\npath?query\ntimestamp\nsha256(body)` envelope. Signatures are single-use
within the freshness window. Retry a refused or interrupted request with a fresh signature (timestamp or
signed query nonce). The publisher serializes mutations with a renewable, five-minute D1 lease.

Upload files to `staging/<bundle>/`, then POST the manifest as the commit body. A staging manifest may also be
uploaded for preview. The inventory excludes the manifest itself. Relative paths cannot contain traversal,
empty segments or non-JSON suffixes. The manifest enforces the contract's 1.5 MB file and 60 KB session limits.
Committed bundle IDs are immutable; publish a new ID for a revision. Failed verification leaves the current
pointer untouched. The Worker copies verified bytes to `live/<bundle>/` and atomically writes `live/current.json`
last. Private reads never cache; public reads support GET, HEAD and conditional ETags. Public requests cannot
select staging. Retention keeps **three total bundles**: current plus two previous (the S4 acceptance limit).
Cleanup failures do not undo a successful publication; the next commit retries them.

The private dashboard's **Published data** tab shows the inventory. A staged preview is ready only when its
manifest is valid and every listed file has the expected size and hash. Preview links use `?staging=<bundle>`
or `?preview=current`; `public/assets/data.js` routes those reads through `/api/p/data/` with the browser's
saved view key. The key stays out of HTTP URLs. Preview links preserve their mode as you move between pages.
Public requests never use the saved key unless a preview mode was explicitly selected.

`npm run test:publish` exercises local D1/R2 with generated test keys, including unsigned, tampered, stale,
replayed and concurrent requests, traversal, oversize, missing/wrong inventory, abort, immutability and the
public flag in both states. Unit checks cover retention pagination and bounded chunked uploads.

## Chart kit

The dependency-free ES modules in `public/assets/charts/` expose `render(el, data, opts)` and `destroy(el)`.
`render` also returns a `destroy()` handle. One chart owns each host; rendering a different type disposes the
previous observer and handlers. `opts.meta` requires `run_id`, `source` and `sample`, with optional range,
costs and Methodology link. Every chart includes a source caption and data table.

Candles use SVG below 300 bars and canvas above that, with exported levels, trade plans and exits. Passing
`cursor` limits visible bars and hides future entries/exits. Equity supports USD or cumulative exported R;
drawdown uses daily closing loss from peak. Sparkline SVGs are 80 × 24 px. Charts load near the viewport
and redraw on width changes. No strategy logic runs in them.

`node scripts/update-chart-specimens.mjs` refreshes the styleguide's committed fixture projection and
no-JS tables. `--check` verifies the projection. The public specimen is explicitly synthetic. Browser checks
cover its known end equity and drawdown, keyboard tooltips, 320-bar canvas rendering and the 16 ms
78-bar SVG render budget.

Backtests keep run, date range, side, setup, exit, month and sort in the URL. Every chart uses the selected
exported trades, with costs already included; it never recomputes fills. Public full-run summary tables are
inserted by the Worker into the static HTML, so their values work without JavaScript. Preview authorization,
charts and interactive filters need JavaScript. File hashes are checked against the manifest before drawing
to avoid mixing data from different publications. `npm run test:budgets` walks first-party resource imports
and enforces the gzip page budgets; current Backtests resources are about 114 KiB, home about 103 KiB.

Replay supports ←/→, Space, S, Home and End, plus run/day selectors and a signed-R calendar. Only exported
scores, thresholds and gates are displayed; no trading rule is evaluated. Reduced-motion playback jumps
to the final frame. `test/replay.mjs` checks keyboard controls, hidden future decisions, one-pixel trade
alignment and animation-frame scrubbing, saving `replay-trace.zip` and timing samples to `test/artifacts/`.
The no-JS message links to the exported Backtests table, which the Worker inserts alongside the public
summary with 100-row pages. Private previews require JavaScript and retain their mode in navigation links.

Strategies show no performance figures or requests for `in_build` rows. Retired rows retain the reason.
Best/worst/median replay examples are ranked from exported daily net R; the median is not an expectation.
The current contract has no per-strategy forward series, so detail pages state that limit and link to the
aggregate paper record separately. Public strategy descriptions and the index table work without JS.
`scripts/page-shell.mjs` is an optional authoring helper for shared chrome; its plain HTML output is committed.

The Engine page reads optional exported `engine.json`, falling back to `public/assets/engine.json` when no
description is published. Its graph traversal only highlights diagram ancestors; it does not run engine
logic. Nodes show last-run state only when exported. The default explicitly says it is unavailable.

Track record accepts optional `sample: "paper"`, `run_id`, `source`, `costs`, and `equity` in signed `track`
pushes. Daily rows use `date`, `equity_usd`, and optional `net_usd`, `drawdown_usd`, `n`, `net_r`.
Dates must ascend; supplied daily changes/drawdowns and the final net total must reconcile. Invalid curves
are withheld while legacy totals remain visible. Backtest and live samples are never projected as paper.
Parity is a separately labeled diagnostic; its paired backtest values never enter paper totals.

`/methodology/` defines data sources, sample labels, fill/cost limits, paper and parity semantics, engine
stages and chart terms. It distinguishes unverified project notes from published evidence.
`test/methodology.mjs` crawls every static and rendered source-chip destination against its anchors.

## Turning things on later

- **Public results:** `TRACK_RECORD_PUBLIC` is `"true"` (since 2026-10-25); set it to `"false"` to hide them again.
- **TradingView front door:** generate a token and a path, put their SHA-256 hashes in `WEBHOOK_TOKEN_SHA256` /
  `WEBHOOK_PATH_SHA256`, set `WEBHOOK_ENABLED` to `"true"`, and point the alert at
  `https://<site>/hook/<path>`. Check TradingView's sender IPs in `TRADINGVIEW_IPS` against their support page.
