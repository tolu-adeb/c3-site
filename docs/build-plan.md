# c3.site build plan: an eye into the engine of c3.lab

Status: **draft 1, 2026-10-26**, written for handoff to Codex. Owner: KH (`khuovi`).
Repos: this site is `tolu-adeb/c3.site` (Cloudflare Worker `c3-lab`, live at `https://c3-lab.twaza18.workers.dev/`).
The engine is `khuovi/c3.lab` (private), which holds the NQ engine (`engine/`, `backtest/`) and `mnq-bot/`.

Read this first, then [redesign/blueprint.md](redesign/blueprint.md) (phase 1, what is already built and why) and
the [README](../README.md) (routes, signing, deploys). Section 9 is the ordered task list with acceptance criteria;
sections 1 to 8 are the reference those tasks point back to.

---

## 0. Summary

c3.site today is a well-built but thin brochure: one scroll story with an illustrative chart, a track record page
with a few numbers, a waitlist and a private dashboard. c3.lab has far more to show: a two-year backtest of the
live MNQ strategy (584 trades over 577 sessions, walk-forward out of sample), a 42-day real-bar backtest with every
trade and every 5-minute bar, a Strategy Lab ledger of 60 tried-and-judged ideas, daily live-vs-backtest parity
checks, the forward (paper) track record, and the NQ engine's build spec with its 12 gates and 0 to 100 score.

The build turns the site into a window onto that engine, in four moves:

1. **Look.** Move from "outline candles on chart paper" to a **wireframe instrument** look: hairline line-work
   everywhere (grids, schematics, frames), and **coloured price bars** (green up, red down, dual-encoded as hollow
   and filled) as the only saturated colour besides the cobalt signal.
2. **Data.** Add a one-way, signed **publish pipeline**: c3.lab exports versioned backtest bundles (summaries,
   trades, equity, per-session bars and decisions, lab trials, parity) and uploads them to an R2 bucket through the
   Worker. The site reads static JSON from `/data/*`. No strategy code runs on the site.
3. **Pages.** Add Engine, Strategies, Backtests, Session replay, Lab and Methodology; deepen Track record; rebuild
   the home hero around a real session replay.
4. **Visualise.** A small in-house chart kit (SVG for annotated charts, canvas for dense ones) for candles with
   trade overlays, equity and drawdown, monthly heatmap, R histogram, segment bars, in-sample vs out-of-sample,
   live vs backtest, and a bootstrap "how it could play out" fan chart.

Non-goals: no order execution, no live strategy logic in the browser, no third-party scripts, no accounts.

---

## 1. Ground truth (what exists today)

### 1.1 The site (this repo)

| Thing | Where | Notes |
| --- | --- | --- |
| Worker router | `src/index.js` (`route()`) | Static assets via `env.ASSETS`; `/api/*` and `/hook/*` run the Worker first |
| D1 tables | `src/schema.js` | `latest` (one row per push kind: `status`, `snapshot`, `track`, `papers`), `heartbeats`, `waitlist`, `join_attempts`, `webhooks`, `commands`, `papers`, `paper_chunks` |
| Signed ingest | `POST /api/ingest`, `checkSignature()` | Ed25519 over `METHOD\npath?query\nts\nsha256(body)`, 5-minute window, replay-protected. Public key in `wrangler.jsonc` `BOT_PUBLIC_KEY` |
| Public results | `GET /api/track` | Whitelisted fields only (`TRACK_FIELDS`); gated by `TRACK_RECORD_PUBLIC` (now `"true"`) |
| Pages | `public/index.html`, `track-record/`, `join/`, `404.html`, `app/` | No build step. Shared chrome in `assets/chrome.js`, theme in `assets/theme.js` (runs in `<head>`) |
| Styles | `public/assets/site.css` | Tokens on `:root`, dark under `prefers-color-scheme` and `[data-theme="dark"]`, reduced motion via `[data-motion="reduced"]` |
| Font | `public/assets/fonts/archivo-var.woff2` | Archivo variable, self-hosted, OFL |
| Security headers | `public/_headers` | CSP `default-src 'self'`; no third-party anything |
| Tests | `test/smoke.mjs` (72 checks), `test/fuzz.mjs` (300 cases) | Run against `wrangler dev --local` |
| Deploy | Cloudflare Workers Builds on push to `main` | `npx wrangler deploy` |
| CI | none | No `.github/` yet |

### 1.2 The engine (c3.lab)

| Source | Path in c3.lab | What it gives the site |
| --- | --- | --- |
| Live MNQ strategy (`orx`, opening-range trade with the 50-day trend; `orb` retest) | `mnq-bot/docs/14-alpha-mnq-bot.md` §14.2, §14.9 to §14.12 | Theory, rules, the two-year re-test tables |
| 42-day real-bar backtest | `mnq-bot/data/alpha_backtest.json` | `backtest.stats` (26 fields incl. `by_setup`, `by_regime`, `by_side`, `by_exit`, `by_time`), `params` (45), `trades` (25, with entry/stop/t1/final/opened/closed/mfe/mae/score/regime/reasons), `days` (42, with bias, fomc, `done` reason); `bars` meta |
| Bars | `mnq-bot/data/mnq_5m.csv`, `mnq_1m.csv`, `mnq_proxy_5m.csv`, `qqq_daily.csv` | `datetime,open,high,low,close,volume`. The proxy is QQQ 5-min x the MNQ/QQQ ratio, Jul 2024 onward |
| Two-year re-test and walk-forward | produced by `abg alpha backtest` (`mnq/backtest/backtest.py`) on the proxy bars | Not exported as a file today. **Needs an exporter** (task D2) |
| Strategy Lab | `mnq-bot/data/lab/lab.sqlite3` (`trials` 60 rows: 48 rejected, 6 failed holdout, 6 candidate; `peeks`; `proposals`), `mnq-bot/docs/17-strategy-lab.md` | Every hypothesis tried, its verdict, the search-window and holdout rules, number of holdout looks |
| Live vs backtest parity | `mnq-bot/data/parity/<day>.json` | Per day: verdict (`match`/`differs`), live and backtest trades, causes, notes, uptime gaps |
| R&D desk digests | `mnq-bot/data/rd/daily-*.json`, `weekly-*.json` | Optional, later |
| Swing desk and wide scan | `mnq-bot/data/swing/` | Optional, later (open decision 4) |
| Site client | `mnq-bot/mnq/app/site.py` | Signs and pushes `status`/`snapshot`/`track`; `redact()` strips paths, secret-looking keys and bulky series. **Reuse its signer for the new publish calls** |
| NQ engine (the original c3.lab bot) | `engine/`, `backtest/`, `docs/build-spec.md`, `reference/trades.csv` | Build spec (§1 to §19, appendices A to D), 12 gates, 0 to 100 score, REV/CONTINUATION models. Its backtest needs an automatic candidate provider first (`backtest/README.md`), so **no NQ engine results exist yet**. `reference/trades.csv` is the 199-trade reference record from the spec's Appendix D (someone else's published record, not c3.lab results) |
| Variant log | `research/variants.csv` (43 rows) | NQ engine ablation runs, all synthetic so far |

Agent rules that bind any work in c3.lab (from its `AGENTS.md`): commit on the `kimi` branch only, never read
`data/holdout/`, nothing in the decision path may touch network or clock, and run the verification gate
(pytest, ruff, ruff format, mypy, `tools/check_learnings.py`) before calling anything done.

### 1.3 The reference look (enpowertrading.co.za)

Studied for technique only; see the evidence table in [redesign/blueprint.md](redesign/blueprint.md) (E1 to E14).
What KH wants carried further: the **wireframe** feel (thin line-drawn technical scenes, outlines rather than
fills, technical index codes, hairline grids) and **colour in the price bars**. The reference reaches it with
~8 MB of WebGL; we reach it with SVG and canvas line-work at under 250 KB per page. Nothing on the site names the
reference or copies its copy, images, logo, palette or type.

---

## 2. Goals, audience and principles

**Goal.** Anyone can see how the engine thinks (theory), how it is built (process) and how it has done
(backtests, forward test, parity), and can replay any tested session bar by bar.

**Audiences.** (1) Prospective subscribers and followers: "is this real, and how does it behave?" (2) Technically
curious traders: "show me the rules, the data and the losses." (3) KH: one place to see the whole engine.

**Principles** (each one is testable):

1. **Every number has a source.** Each chart or stat names its run id, data range, data source (real MNQ or
   QQQ proxy), costs, and whether it is in-sample, out-of-sample, paper or live. A small "source" chip under each
   figure links to Methodology.
2. **Losses and failures are first-class.** Drawdowns, losing months, rejected lab ideas and parity mismatches
   are shown with the same weight as wins.
3. **Backtest is never mixed with forward results.** Separate colours of chip, separate pages, separate series.
4. **Nothing runs the strategy in the browser.** The site only draws what c3.lab exported. What-if views use
   precomputed variants or resampling of exported trades, never a JS re-implementation of the rules.
5. **Readable without JS, fast without a framework.** Every page renders its text and a static summary table
   with JS off; charts are progressive enhancement.
6. **Nothing third party.** CSP stays `default-src 'self'`.

---

## 3. Design system v2: wireframe instrument

Keep the phase 1 tokens (chart paper, ink, cobalt signal, Archivo, 12-column grid). Add line-work and price colour.

### 3.1 New and changed tokens (`site.css`)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bull` | `#117B56` (4.6:1 on `--bg`) | `#2FBF8A` (7.9:1) | Up candle stroke and body outline; positive P&L |
| `--bear` | `#C8322F` (4.6:1) | `#F0625A` (5.8:1) | Down candle stroke and fill; negative P&L |
| `--bull-wash` | `rgba(17,123,86,.10)` | `rgba(47,191,138,.14)` | Target zone, winning-trade band |
| `--bear-wash` | `rgba(200,50,47,.10)` | `rgba(240,98,90,.14)` | Stop zone, drawdown area |
| `--wire` | `#7E8998` (3.1:1 on `--bg`) | `#58697D` (3.3:1) | Wireframe line-work (grids, schematic edges, frames) |
| `--wire-faint` | `#CDD4DE` | `#222D3A` | Minor grid, construction lines |
| `--hair` | `1px` (`0.75px` on DPR ≥ 2) | same | Default stroke width |
| `--mono` | `ui-monospace, "SFMono-Regular", Menlo, monospace` | same | Prices, timestamps, run ids |

`--up`/`--down` stay for dashboard chips; candles and P&L use `--bull`/`--bear`. Contrast figures above are
against `--bg` and meet the 3:1 non-text minimum. Never encode direction by colour alone: **up candles are hollow
(stroke only), down candles are filled**; P&L numbers carry a sign; series carry direct labels.

S2 adjusts the draft palette to meet its acceptance criteria: the original wire colours were below 3:1.
Light bull, faint text, dashboard up and warning colours are also slightly darker so small text meets 4.5:1.
`node test/contrast.mjs` checks both the page and panel backgrounds in both themes. Faint grid and wash tokens
are decorative; they do not carry text or distinguish data by themselves.

### 3.2 The wireframe language

- **Grids.** Every chart sits on a visible construction grid (`--wire-faint`, 1 px) with corner ticks on the
  frame, like a drafting sheet. Axis labels are small mono text outside the frame.
- **Frames and index codes.** Each figure has a thin frame, a top-left index code (`FIG 3.2`, `§10 SCORE`,
  `RUN orx-2y-v3`) and a top-right state chip (`BACKTEST`, `OUT OF SAMPLE`, `PAPER`, `LIVE`).
- **Schematics.** The Engine page draws the pipeline as an isometric (30°) wireframe of boxes and pipes in
  `--wire`, with the active path in `--signal`. Pure SVG, built from a JSON description so it stays editable.
- **Price bars.** Candles: 1 px wick, body width 60% of slot, up hollow in `--bull`, down filled `--bear`.
  Overlays: levels as dashed `--wire` lines with right-edge labels; entry solid `--ink`; stop dashed `--bear`;
  targets dashed `--bull`; risk and reward boxes in `--bear-wash`/`--bull-wash`; the trade path in `--signal`.
- **Motion.** Line-drawing (`stroke-dashoffset`) for series and schematics; candles reveal left to right in
  replays. Durations from the existing `--quick`/`--calm`; zero when motion is reduced.
- **Type.** As phase 1. Add mono for numbers in tables and tooltips (tabular figures).

### 3.3 Components to add

`figure.fig` (frame, index code, state chip, caption, source chip, "data table" toggle), `stat-strip`
(4 to 6 stats, each with a source), `chip.state` (backtest / out of sample / paper / live / illustration),
`segmented` range picker, `scrubber` (replay timeline with keyboard support), `tooltip` (one shared, follows
pointer, keyboard-reachable through focusable points), `legend-inline` (direct labels preferred over legends).

---

## 4. Information architecture

| Route | Purpose | Main data | New? |
| --- | --- | --- | --- |
| `/` | Story: what c3.lab is, then a **real** session replay as the hero, then the engine in five steps, then headline results with sources | `manifest.json`, one featured session, headline run summary, `/api/track` | Rework |
| `/engine/` | The wireframe schematic of the whole pipeline; each node opens a panel with what it does, the spec section, and live/last-run state | `engine.json` (static description), `manifest.json` | New |
| `/strategies/` | Index of strategies with state (live, paper, research, retired, in build) and a sparkline each | `strategies.json` | New |
| `/strategies/<id>/` | Theory (mechanism, rules, exits, filters), how it is scored, its backtests, its forward record, its lab history | `strategies.json`, `runs/<id>/*` | New |
| `/backtests/` | Explorer: pick a run; equity and drawdown, monthly heatmap, R histogram, segment breakdowns, in vs out of sample, trade table | `runs/<run>/*` | New |
| `/replay/?run=<run>&day=<YYYY-MM-DD>` | Session replay: colored 5-min bars, levels, opening range, trade plan, entry, exits, decisions log, step or play | `runs/<run>/sessions/<day>.json` | New |
| `/lab/` | Strategy Lab ledger: every trial, verdict, the gate it failed, holdout looks used | `lab/trials.json` | New |
| `/track-record/` | Forward (paper) results: equity, monthly bars, table; plus live-vs-backtest parity days | `/api/track`, `parity/index.json` | Deepen |
| `/methodology/` | Data sources, fills and costs, walk-forward and holdout rules, random-walk check, proxy caveat, glossary, disclaimers | static | New |
| `/join/`, `/404` | As now | | Restyle only |
| `/app/` | Private dashboard | as now | Tokens only |

Navigation: top bar becomes `Engine · Strategies · Backtests · Track record · Lab` with Join as the button; the
tile menu lists all routes with index codes `01` to `08`. Footer adds Methodology and the disclaimer line.

---

## 5. Data contract (c3.lab → site)

### 5.1 Transport: signed publish to R2 (recommended)

Why R2 and not D1 or git: per-session bars for 577 sessions are a few MB in total, too large for D1 rows (2 MB
cap) and for the existing 700 KB ingest limit; committing them to this **public** repo would publish them before
review and bloat history. R2 keeps the bot as the only writer, under the same Ed25519 trust model.

Worker additions:

| Route | Method | Auth | Behaviour |
| --- | --- | --- | --- |
| `/api/publish/put?bundle=<id>&path=<rel>` | PUT | Bot signature (`checkSignature`) | Body ≤ 5 MB, `content-type: application/json`. Stores at `staging/<bundle>/<rel>` in R2. `rel` must match `^[a-z0-9][a-z0-9/_.-]{0,200}\.json$`, no `..`. Body must parse as JSON. Returns sha256 |
| `/api/publish/commit?bundle=<id>` | POST | Bot signature | Body is the bundle's `manifest.json`. Worker checks every file listed exists in staging with the listed sha256 and bytes, then copies (or re-points) to `live/<bundle>/` and writes `live/current.json` = `{bundle, committed_ms}` atomically last. Keeps the previous 3 bundles; deletes older ones |
| `/api/publish/abort?bundle=<id>` | POST | Bot signature | Deletes `staging/<bundle>/` |
| `/data/<rel>` | GET | Public, but 404 unless `BACKTESTS_PUBLIC === "true"` | Resolves `live/current.json` → serves `live/<bundle>/<rel>` with `cache-control: public, max-age=300` and a strong ETag (sha256). `/data/manifest.json` is the entry point |
| `/api/p/data/<rel>` | GET | View key | Same as `/data/` but works when not public, and can read `staging/` with `?staging=<bundle>` for preview in `/app/` |

Config: add `r2_buckets: [{ binding: "DATA", bucket_name: "c3-site-data" }]` and var `BACKTESTS_PUBLIC: "false"`
to `wrangler.jsonc`. Add `/data/*` to `run_worker_first`.

### 5.2 Bundle layout

```
manifest.json                       # schema_version, bundle id, generated_at, c3lab_commit, files[{path, sha256, bytes}], runs[], featured
strategies.json                     # every strategy: id, name, state, one-line, mechanism, rules[], exits[], filters[], scoring, params_public{}, runs[], lab_trials[]
engine.json                         # (optional; the site ships a static default) pipeline nodes and edges, each with spec section and short text
runs/<run_id>/summary.json          # run meta + stats + segment breakdowns
runs/<run_id>/trades.json           # one row per trade
runs/<run_id>/equity.json           # one row per session: date, n, net_r, net_usd, equity_usd, drawdown_usd, sample ("in"|"out")
runs/<run_id>/monthly.json          # month, trades, win_rate, net_r, net_usd
runs/<run_id>/sessions/index.json   # date, n_trades, net_r, has_bars, tags[]
runs/<run_id>/sessions/<date>.json  # bars + levels + trades + decisions for one session
lab/trials.json                     # all trials, newest first
lab/summary.json                    # counts by verdict, holdout windows and looks used
parity/index.json                   # day, verdict, live_r, backtest_r, causes[]
parity/<day>.json                   # the bot's parity file, redacted
```

Run ids are stable slugs: `<strategy>-<dataset>-<version>`, for example `orx-mnq42d-v1` (the 42-day real-bar
run) and `orx-proxy2y-v3` (the two-year proxy run with the current defaults). Every run's `summary.json` has:

```json
{
  "run_id": "orx-proxy2y-v3",
  "strategy": "orx",
  "label": "Two-year re-test, current defaults, costs in",
  "dataset": { "kind": "proxy", "source": "QQQ 5-min x MNQ/QQQ ratio", "start": "2024-07-01", "end": "2026-10-21", "sessions": 577 },
  "kind": "backtest",                     // backtest | walk_forward | paper | live
  "costs": { "commission_rt_usd": 1.24, "entry_slip_ticks": 1, "stop_slip_ticks": 1, "contract": "MNQ" },
  "split": { "in_sample": ["2024-07-01", "2026-04-21"], "out_of_sample": ["2026-04-22", "2026-10-21"] },
  "stats": { "trades": 566, "win_rate": 0.66, "avg_r": 0.12, "net_r": 0, "net_usd": 5478, "max_dd_usd": 584,
             "profit_factor": 0, "sharpe_daily": 0, "months_positive": 21, "months": 28, "worst_month_usd": -353 },
  "segments": { "by_side": {}, "by_regime": {}, "by_time": {}, "by_grade": {}, "by_exit": {}, "by_setup": {} },
  "checks": { "random_walk_avg_r": -0.02, "walk_forward_avg_r": 0.11 },
  "c3lab_commit": "abc1234",
  "params_hash": "sha256:…"
}
```

(Numbers shown are from `14-alpha-mnq-bot.md` §14.9 for shape only; the exporter fills the real values. Zeros
mark fields the doc doesn't state.)

`trades.json` row:

```json
{ "id": 1, "date": "2026-08-07", "setup": "orx", "side": "short", "grade": "A", "regime": "range",
  "opened": "2026-08-07T10:00:00-04:00", "closed": "2026-08-07T10:10:00-04:00",
  "entry": 29678.5, "stop": 29733.5, "t1": 29640.0, "final": 29568.5, "risk_pts": 55.0,
  "exit": 29678.75, "exit_reason": "breakeven", "t1_hit": true,
  "r": 0.35, "pts": 19.25, "usd": 37.26, "mfe_pts": 65.0, "mae_pts": 34.5, "score": 60, "reasons": ["…"],
  "sample": "in" }
```

`sessions/<date>.json`:

```json
{ "date": "2026-08-07", "tz": "America/New_York", "tf": "5m", "source": "real",
  "bars": [[1786111200, 29700.25, 29712.0, 29690.5, 29705.0, 1234]],        // [unix_s, o, h, l, c, v], 09:00–12:30 ET by default
  "levels": [{ "name": "ORH", "price": 29720.0, "from": 1786113000 }, { "name": "PDL", "price": 29610.0 }],
  "windows": [{ "name": "Opening range", "from": 1786109400, "to": 1786110300 }, { "name": "Entry window", "from": 1786110300, "to": 1786116600 }],
  "context": { "bias": "Mixed", "trend_50d": "down", "fomc": false, "mode": "trend" },
  "trades": [ /* same shape as trades.json rows */ ],
  "decisions": [{ "t": 1786111800, "kind": "signal", "text": "First 5-min close below the opening range, with the 50-day trend" }],
  "done": "entry window closed (10:30 ET)" }
```

`lab/trials.json` row: `{ id, ts, source, name, rationale, changes, verdict, failed_check, summary: {trades, win_rate, net_usd, max_dd_usd, avg_r}, baseline: {…}, holdout_looks }`.
Map `source` values like `claude-session-oct22` to a display label ("research agent", "KH", "CLI").

Schemas live in this repo as JSON Schema at `schemas/*.schema.json` and are the contract. The exporter validates
against a copy before upload; the site's tests validate the fixtures and a fetched bundle.

### 5.3 What is public and what is not

Published: trades, bars for tested sessions, stats, segment stats, lab verdicts and summaries, parity days,
strategy descriptions at the level already on `14-alpha-mnq-bot.md`. **Not** published unless KH says so (open
decision 1): the full `params` object, the adaptive-book state, `rationale` text of rejected trials, anything
under `data/holdout/`, raw R&D digests. The exporter runs every file through `site.redact()` and an explicit
allowlist of keys per file type.

### 5.4 Fixtures for building without c3.lab

`test/fixtures/bundle/` holds a small synthetic bundle (2 runs, 10 sessions with bars, 30 trades, 12 trials,
3 parity days) generated by `test/make-fixtures.mjs` with a seeded RNG. Every page is built and tested against
the fixtures first. `wrangler dev --local` plus a `scripts/seed-r2.mjs` loads them into local R2.

---

## 6. Visualisations

All charts come from `public/assets/charts/` (ES modules, no dependencies). Each chart exports
`render(el, data, opts)` and `destroy()`; each draws a `<table>` fallback that is visible without JS and
reachable with the figure's "data table" toggle. Follow the dataviz skill rules: recessive axes, direct labels,
one accent per chart, tooltips that never hide the point.

| # | Chart | Where | Rendering | Notes |
| --- | --- | --- | --- | --- |
| V1 | **Candles with trade overlay** | Replay, home hero, strategy pages | SVG ≤ 400 bars, canvas above | Colored bars per 3.2; levels, windows, entry/stop/targets, risk/reward boxes, trade path; crosshair with OHLC readout in mono |
| V2 | **Equity curve** | Backtests, strategy, track record | SVG | Cumulative $ per micro (toggle R). In-sample segment in `--ink`, out-of-sample in `--signal`, a vertical rule at the split labelled "holdout starts" |
| V3 | **Underwater drawdown** | Under V2, shared x-axis | SVG area in `--bear-wash`, line `--bear` | Max DD annotated with value and dates |
| V4 | **Monthly heatmap** | Backtests, track record | SVG grid, year rows × month columns | Diverging `--bear` ↔ `--bull` around 0, value printed in each cell, empty months hatched |
| V5 | **R-multiple histogram** | Backtests, strategy | SVG bars | Bins of 0.25R from −1.5 to +4; losses `--bear`, wins `--bull`; mean and median marked |
| V6 | **Segment bars** | Backtests | SVG horizontal bars | Avg R with n per bar for side, regime, time, grade, exit; bars with n < 30 drawn hatched and labelled "small sample" |
| V7 | **In vs out of sample** | Backtests, methodology | Paired dots | Win rate, avg R, net/DD for in-sample vs walk-forward |
| V8 | **Live vs backtest** | Track record | Two-row strip per day | Backtest R vs live R; mismatches flagged with the cause text |
| V9 | **How it could play out** (fan) | Strategy, backtests | Canvas | Bootstrap 2,000 sequences of the run's trades (seeded, in a Web Worker), next 100 trades; median line plus 50% and 90% bands; caption states it's a resample of past trades, not a forecast |
| V10 | **Lab funnel and ledger** | Lab | SVG | Tried → passed search window → passed holdout → approved, with counts; below it, a dot per trial (x: Δ win rate, y: Δ net/DD vs baseline), colored by verdict |
| V11 | **Engine schematic** | Engine, home | SVG from `engine.json` | Isometric wireframe; hover/focus a node to highlight its path and open its panel |
| V12 | **Score and gates card** | Replay, engine | SVG | Score dial 0–100 with threshold marker; 12 gate squares pass/fail with names on focus |
| V13 | **Sparklines** | Strategies index, stat strips | SVG | Equity, 24×80 px, no axes |

Performance rules: canvas for anything over 2,000 marks; `requestAnimationFrame` for scrubbing; no layout
thrash; charts render only when scrolled into view (`IntersectionObserver`).

---

## 7. Page specs

### 7.1 Home `/`

1. Hero: label chip, display headline (keep "Every alert has to pass twelve gates first" or a new line),
   intro, and **a real session replay** (V1) of the bundle's `featured` session auto-playing once (static last
   frame when motion is reduced or JS is off, with "Real session, 7 Aug 2026, backtest" chip).
2. Engine in five steps: keep the scroll story and section rail, but each step now highlights the matching node
   of a small V11 schematic and the matching layer of the hero replay.
3. Headline results: stat strip from the headline run (trades, win rate, avg R, net $/micro, max DD,
   out-of-sample avg R) with sources; V2 equity thumbnail; links to Backtests and Track record.
4. Lab honesty strip: "60 ideas tried, 0 adopted" style counts from `lab/summary.json`, link to Lab.
5. Footer as now plus Methodology.

### 7.2 Engine `/engine/`

Full-width V11. Nodes: Feed (TradingView/Tradovate, bars) → Structure (§4) → Context (§5) → Intraday (§6) →
Models (§8, §9) → Score (§10) → Gates (§11) → Tracker (§12) → Alerts (§13) → Ledger and storage (§14) → Lab
(walk-forward, holdout) → Site. Each node panel: one paragraph, the spec section, inputs and outputs, a "state"
line (for example "last run 2026-10-24, 1 signal") from `manifest.json`. Below: the two engines explained,
the NQ engine (in build, step N of 9) and the MNQ bot (paper trading), and how they relate.

### 7.3 Strategies `/strategies/` and `/strategies/<id>/`

Index: cards with name, state chip, one-liner, V13 sparkline, trades and avg R of the headline run.
Detail: Theory (mechanism: why the market would pay for this), Rules (entry, stop, targets, management, filters,
each a short list), Scoring, then the headline run (stat strip, V2+V3, V5, V6), a "best day / worst day / typical
day" trio of mini V1 replays linking to Replay, the forward record for this strategy, and its lab trials.
Initial strategies: `orx` (live, paper), `orb` (live, paper), `sweep` and `vwap` (retired: "lost on real bars"),
`nq-rev` and `nq-cont` (in build; theory only, from the build spec), swing desk and wide scan (open decision 4).

### 7.4 Backtests `/backtests/`

Run picker (segmented control of runs in the manifest), then: stat strip; V2 + V3 with a range brush; V4; V5;
V6; V7; V9; trade table (sortable, filterable by side/setup/exit/month, each row links to Replay). URL state:
`?run=&from=&to=&side=` so views are shareable.

### 7.5 Replay `/replay/`

Left: V1 for the session with a scrubber (play, pause, step a bar with ←/→, jump to signal with S). Right: the
decision log, revealing entries as the scrubber passes their time, plus V12 for the signal bar. Top: day
context (bias, 50-day trend, FOMC, mode). Day picker: calendar of sessions colored by net R (from
`sessions/index.json`), prev/next buttons, "random day". Without JS: there is no server rendering, so show a
`<noscript>` message that the replay needs JS and link to the trade table on Backtests.

### 7.6 Lab `/lab/`

Explain the judging rules (from `17-strategy-lab.md` §17.1) as a short checklist, then V10, then the ledger table:
date, name, source, verdict chip, the first check it failed, Δ win rate, Δ net/DD. Counts of holdout looks used
per window. Rationale text hidden unless open decision 1 allows it.

### 7.7 Track record `/track-record/`

Keep the current stats and monthly table. Add V2 for paper equity since `since`, V4 monthly, and the parity
section (V8 plus the list of differing days with their causes). Make clear these are paper (virtual) trades.
Needs the bot's `track` push to include a daily equity series (task D3).

### 7.8 Methodology `/methodology/`

Plain text page: data (real MNQ 5-min from Aug 2026; QQQ proxy before that and how it was validated: 43
overlapping days reproduced all 26 trades on the same side), fills and costs, walk-forward method, locked holdout
and the 6-look rule, random-walk check, what counts as in- and out-of-sample, known limits (short real-bar
sample, proxy differences, overnight data), the hypothetical-performance disclaimer, glossary (R, MFE, MAE,
drawdown, profit factor, ORH/ORL/PDH/PDL/ONH/ONL, FVG, MSS, BOS).

---

## 8. Engineering constraints

- **Stack.** Stay on one Worker, static assets, D1, plus R2. No framework and no build step. ES modules loaded
  with `<script type="module">`. If the page count makes shared chrome painful, a tiny Node script
  (`scripts/build-pages.mjs`) may stamp shared header/footer partials into `public/**/index.html` at commit time
  (output committed), but only if needed.
- **CSP.** Keep `default-src 'self'`. Web Worker for V9 must be same-origin (`worker-src 'self'`). No inline
  scripts except the existing `theme.js` pattern if it is already allowed by hash.
- **Budgets** (per page, gzip, excluding `/data` JSON): HTML+CSS+JS ≤ 250 KB; home ≤ 150 KB; any single
  `/data` file ≤ 1.5 MB, session files ≤ 60 KB; LCP < 2.0 s mobile; CLS < 0.05; no long task > 200 ms on a
  mid-range phone profile; 60 fps while scrubbing a replay.
- **Accessibility.** WCAG 2.2 AA. Keyboard-complete scrubber and charts; `aria-live="polite"` for replay readout;
  focus visible; every chart has a table; colour never the only cue.
- **Resilience.** If `/data/manifest.json` 404s (not public yet) every new page shows a clear "results not
  published yet" state, not an error.
- **Caching.** `/data/*` 5 minutes plus ETag; pages as now.
- **Testing.** Extend `test/smoke.mjs` for every new route and API; add `test/publish.mjs` for the publish flow
  (signed, unsigned, tampered, path traversal, oversize, commit with a missing file, commit with a wrong hash,
  public flag off); add Playwright checks (`test/ui.mjs`): no horizontal scroll at 320/390/768/1440 px, no console
  errors, light and dark, motion reduced, each chart renders the fixture's known values (for example the
  equity end value), axe 0 serious violations.
- **CI.** Add `.github/workflows/ci.yml`: `npm ci`, start `wrangler dev --local` with test keys and fixtures,
  run smoke, publish, fuzz and UI tests. Required before merge to `main` (merging deploys).

---

## 9. Ordered tasks with acceptance criteria

Tasks are sized for one Codex PR each. "S" ≈ half a day, "M" ≈ 1 day, "L" ≈ 2 days. Site tasks (S*) are in this
repo; data tasks (D*) are in c3.lab (`mnq-bot/`), on its `kimi` branch, under its verification gate.

### Phase A: foundations

**S1. CI and fixtures (M).** Add `.github/workflows/ci.yml`, `test/make-fixtures.mjs`, `test/fixtures/bundle/`,
`schemas/*.schema.json` (manifest, strategies, summary, trades, equity, monthly, sessions index, session,
trials, lab summary, parity index).
- Accept: CI green on a PR; fixtures validate against the schemas (`node test/validate.mjs`); smoke and fuzz
  still pass unchanged.

Implementation: schemas, deterministic fixtures, validation and a local test runner are in place. `npm test`
passes bundle validation, 13 fixture tests, 72 unchanged smoke checks and 300 unchanged fuzz cases. The CI
workflow runs these checks on pull requests and pushes to `main`. Per AGENTS.md, this work goes directly to
`main`; a green PR run is therefore not recorded for S1.

**S2. Design tokens v2 and components (M).** Tokens from 3.1, wireframe styles from 3.2, components from 3.3.
Update the home illustration candles to the colored style as a first visible change.
- Accept: tokens defined for light, dark and `[data-theme]`; a `/styleguide/` page (noindex) shows every token,
  chip, figure frame and candle style in both themes; contrast check script reports ≥ 3:1 for `--bull`, `--bear`,
  `--wire` against `--bg` in both themes and ≥ 4.5:1 for text tokens; no visual regressions in the existing pages
  (Playwright screenshots reviewed in the PR).

Implementation: `/styleguide/` shows both themes, all tokens and component specimens from the synthetic
fixtures. Tables are authored in HTML and open without JS. Range radios and the scrubber use native keyboard
controls; candles share a focus/pointer tooltip. The home illustration uses hollow bull bars and filled bear
bars. Inactive story text keeps full contrast; cobalt rules and numbers mark the active step.
Playwright checks 48 route/theme/width combinations (320/390/768/1440), keyboard controls, motion settings,
system and saved themes, DPR and the no-JS fallback. CI saves screenshots as an artifact. Local before/after
screenshots and layout comparisons cover the existing pages; as for S1, work goes directly to main under
AGENTS.md, so there is no PR screenshot review. Next: S3.

**S3. Chart kit core (L).** `public/assets/charts/` with shared scales, axes, grid, frame, tooltip, table
fallback, and V1 (candles + overlays), V2, V3, V13.
- Accept: the styleguide renders each chart from fixtures; V1 draws a 78-bar session in under 16 ms on desktop
  and 300+ bars via canvas; the table fallback matches the drawn values; keyboard focus moves point to point with
  arrow keys and the tooltip follows focus; no third-party code.

Implementation: shared scales, axes, construction grids, frames, source chips, tables, tooltips and resize
cleanup live in `public/assets/charts/`. Candles use SVG below 300 bars and canvas from 300; equity separates
in/out segments and labels the holdout boundary; drawdown shares its date axis; sparklines are 80 × 24 px.
The styleguide includes both themes, authored no-JS tables, a 78-bar fixture and a clearly labeled 320-bar
density specimen. The browser gate checks known values, keyboard focus, cursor visibility, canvas, R units
and a 16 ms render budget. Local warm 78-bar render median: 2.7 ms. Next: S4.

### Phase B: data pipeline

**S4. R2 publish API and `/data` (M).** Routes and config in 5.1.
- Accept: `test/publish.mjs` passes all cases listed in section 8; with `BACKTESTS_PUBLIC="false"` `/data/*`
  returns 404 and `/api/p/data/*` works with the view key; `live/current.json` only changes on a successful
  commit; old bundles beyond 3 are deleted; README documents the routes.

Implementation: signed, bounded JSON uploads; single-use signatures; serialized publish mutations; verified
byte copies; immutable committed IDs; atomic final pointer; private staging preview; ETags and public gating
are covered by local D1/R2 tests. Retention keeps current plus two previous bundles, following this task's
three-bundle acceptance limit. `scripts/seed-r2.mjs` validates and publishes fixtures to local hosts only.
Production bucket provisioning could not be checked from this machine: Wrangler has no Cloudflare API token.
The configured bucket is `c3-site-data`; publishing remains private. KH will provision the bucket later.
Site tasks continue against fixtures.

**D1. Exporter skeleton in c3.lab (M).** New `mnq site export --out <dir>` (in `mnq-bot/mnq/app/`) that writes
the bundle layout in 5.2 for the 42-day real-bar run from `data/alpha_backtest.json` + `data/mnq_5m.csv`, plus
`strategies.json`, `lab/*.json` from `lab.sqlite3`, and `parity/*` from `data/parity/`. Allowlist plus `redact()`.
- Accept: output validates against the site's schemas (copied into `mnq-bot/tests/fixtures/schemas/`); a test
  proves no key outside the allowlist and no path-like string survives; deterministic (two runs, identical
  bytes); never reads `data/holdout/`; c3.lab verification gate passes.

**D2. Two-year and walk-forward runs in the exporter (M).** Run the current defaults over the proxy dataset and
the walk-forward, and export `orx-proxy2y-v<n>` with per-trade `sample` tags and per-session bars for every
session that traded (bars from `mnq_proxy_5m.csv`, `source: "proxy"`).
- Accept: exported stats match the numbers the CLI prints for the same run (test compares them); session files
  ≤ 60 KB each; the totals reconcile (sum of trade R = summary net R within 1e-6).

**D3. Publish command (S).** `mnq site publish <dir>` uploads with the existing Ed25519 signer, then commits;
`--preview` stops before commit. Extend the `track` push with a daily paper equity series.
- Accept: against `wrangler dev --local` with test keys, a publish then commit makes `/api/p/data/manifest.json`
  return the new bundle id; a failed upload leaves `current.json` unchanged; the dashboard `/app/` gains a
  "Published data" tab (S5) showing the current and staged bundle.

**S5. Dashboard "Published data" tab (S).** Shows current bundle, staged bundles, file list and sizes, and a
preview link that opens public pages against a staged bundle (`?staging=` passed through `/api/p/data/`).
- Accept: smoke check for the tab's API; no public route can read staging.

Implementation: the authenticated inventory lists current, retained and staged bundles with sizes and
SHA-256, and marks complete staged previews. The dashboard uses it in a keyboard-accessible tab. The shared
data client preserves `?staging=` / `?preview=current` and sends the saved view key only to private endpoints.
Local browser checks cover inventory, file lists, preview reads, mobile layout and absence of keys from HTTP
URLs. The Backtests preview destination is implemented in the next task, S6.

### Phase C: pages

**S6. Backtests explorer (L).** Page 7.4 with V2, V3, V4, V5, V6, V7, trade table, URL state.
- Accept: with fixtures, every figure shows its source chip with run id and sample; filters change the table and
  charts consistently (test: filtering side=short gives the fixture's known short count); deep links restore the
  view; renders its summary table without JS; budgets met.

Implementation: the explorer filters exported trades and aggregates the same selection into equity,
drawdown, monthly values, R bins, segments and sample comparisons. Dates, side, setup, exit, month, sort and
run are shareable in the URL; the two range controls update on animation frames. Source chips name the run,
data, sample, dates and costs. A small Worker HTML insertion supplies the exported full-run table when public,
so it is readable without JS; private previews still require JS authorization. Bundle file hashes prevent a
mid-load publication from silently mixing versions. Fixture checks cover seven short trades, their exact net,
deep links, sorting, range selection, no-JS numbers and unpublished states. Page resource budget: about 114 KiB
gzip. Next: S7.

**S7. Session replay (L).** Page 7.5 with V1, scrubber, decision log, V12, day picker.
- Accept: keyboard controls work (←/→/space/S/Home/End); the readout announces bar time and OHLC politely; with
  motion reduced the replay jumps instead of animating; the trade path and exits line up with the fixture
  trade's times and prices (pixel test within 1 px); 60 fps while scrubbing in a Playwright trace.

Implementation: run/day links, next/previous/random sessions, a signed-R calendar, native scrubber,
play/pause, signal jumps and all requested keyboard controls display only recorded bars and decisions.
Exported windows, trade plans, entry/exit paths and crosshairs use the chart kit. The score/gate card displays
an optional exported threshold; it never evaluates a gate. Fixtures include a rejected candidate to cover
failed gates. Reduced motion shows the final frame and Play jumps without animation. The polite readout names
time and OHLC. Tests check trade coordinates within one pixel, day navigation, every key, and the no-JS
Backtests trade-table destination. Local trace: 59.9 fps median cadence, 2.6 ms p95 scrub update. Next: S8.

**S8. Strategies index and detail (M).** Pages 7.3, content from `strategies.json`.
- Accept: each strategy's state chip matches the data; retired strategies say why; "in build" strategies show
  theory only with no numbers; best/worst/typical day links open the replay on those days.

Implementation: index and detail pages read the exported descriptions and states, show retired reasons,
and isolate theory-only strategies from performance requests. Hypothetical headline runs reuse the chart kit;
best, worst and median daily net-R sessions link to their recorded replays. The exporter contract has no
strategy-specific forward series yet, so the page states that limit and links to the separately labeled
aggregate paper record. Public descriptions and the strategy-state table are inserted into static HTML for
no-JS readers. Fixtures now cover paper, retired and in-build states. Browser checks cover all six routes and
their state/number separation. Next: S9.

**S9. Engine page and schematic (M).** `engine.json` default in `public/assets/`, V11, node panels.
- Accept: every node links to its spec section in Methodology or the strategy page; keyboard can walk every node
  in pipeline order; works without JS as an ordered list of the same nodes.

Implementation: JSON drives twelve isometric wireframe boxes and their pipes. Focus, hover and keyboard
selection highlight the upstream path and open the node’s description, spec link, inputs, outputs and exported
state. Unpublished data falls back to the shipped static process description, with no invented last-run
counts. The MNQ paper desk and NQ in-build model descriptions remain separate. The ordered list is authored
in HTML and updated from public exports for no-JS readers. Browser checks walk every node in pipeline order,
check panel/spec links and verify both the no-JS list and unpublished fallback. Next: S10.

**S10. Lab page (M).** Page 7.6 with V10 and the ledger.
- Accept: counts equal the fixture's verdict counts; failed checks render human names ("win rate not 1 point
  better"); rationale hidden unless the bundle includes it.

**S11. Track record v2 (M).** Page 7.7 with paper equity, monthly heatmap, parity.
- Accept: the page never shows backtest numbers; parity days list causes in plain text; works when the bot has
  not pushed an equity series yet (falls back to the current view).

**S12. Methodology (S).** Page 7.8.
- Accept: every source chip across the site links to an anchor that exists on this page (test crawls them).

**S13. Home rework (M).** Page 7.1 with the featured real replay hero and schematic-linked story.
- Accept: home ≤ 150 KB before `/data`; LCP < 2.0 s on mobile profile with the hero's static last frame as
  the LCP element; story steps still work without JS; "Illustration" chip removed only when real data loads, kept
  when it falls back to the illustration.

### Phase D: what-if and polish

**S14. How it could play out (M).** V9 with a seeded bootstrap in a Web Worker; optional switch between
precomputed variants (for example T1 at 0.5R / 0.7R / 1.0R) if the bundle includes them as separate runs.
- Accept: same seed gives the same bands; caption and Methodology explain it is a resample of past trades;
  no strategy rule is reimplemented in JS.

**S15. Navigation, tile menu, footer, 404 (S).** New nav per section 4.
- Accept: menu focus trap and Esc still work; `aria-current` correct on every page.

**S16. Quality pass (M).** Lighthouse and axe on every route in CI, 320 px checks, budgets table in README
updated with measured values.
- Accept: all budgets in section 8 met and recorded; axe 0 serious; Lighthouse mobile performance ≥ 90 on home,
  backtests and replay.

**S17. Go public (S, needs KH).** Publish the first real bundle, review in `/app/` preview, then set
`BACKTESTS_PUBLIC` to `"true"`.
- Accept: KH has reviewed every public page against the real bundle; disclaimers present on every page that
  shows a number.

Dependency order: S1 → S2 → S3 → (S4 ∥ D1) → D2 → D3 → S5 → S6 → S7 → S8 → S9 → S10 → S11 → S12 → S13 → S14 →
S15 → S16 → S17. S6 to S12 can proceed in any order once S3 and the fixtures exist; they do not need real data.

---

## 10. Content and compliance

- Label every backtest figure "Hypothetical backtest results" with the costs used; label paper results "Paper
  (virtual) trades"; never call either "returns" or "profit" without the qualifier.
- Standard line in the footer and on Methodology: alert-only, educational, not financial advice, futures carry
  substantial risk of loss, past and hypothetical results do not guarantee future results. If the site is ever
  used to market a paid service to US persons, get advice on the CFTC Rule 4.41 hypothetical-performance
  disclosure; this plan is not legal advice.
- Show the number of ideas tried next to any "best" result (the Lab page and the home honesty strip do this).
- No cookies, trackers or third-party requests, as now.

---

## 11. Open decisions for KH

1. **How much of the rules goes public?** Recommended: mechanism, rules and exits in words plus all trades and
   bars; keep the exact `params` and trial rationales private. (Affects D1 allowlist, S8, S10.)
2. **Which engine leads the story?** Recommended: the MNQ bot leads (it has results), the NQ engine appears as
   "in build" with theory only until its Step 9 backtest exists. (Blueprint open question 1.)
3. **R2 publish vs committing data to this repo.** Recommended: R2 (section 5.1), because this repo is public.
4. **Swing desk and wide scan on the public site?** Recommended: not in this build; add later as strategies.
5. **Custom domain** before going public (S17)?

---

## 12. Handoff notes for Codex

- Work in this repo on a feature branch per task, open a PR per task, keep CI green. Merging to `main` deploys.
- Read `AGENTS.md` in this repo before starting. For D-tasks, follow c3.lab's own `AGENTS.md` (branch `kimi`,
  holdout isolation, verification gate).
- Build every page against the fixtures; do not wait for real data.
- Keep comments and copy in the existing voice: short, plain sentences, no hype, state limits.
- When a task's acceptance criterion can't be met, stop and write down why in the PR rather than weakening the
  test.
