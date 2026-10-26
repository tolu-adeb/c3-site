# Tasks for GPT-6.1 Sol, high effort

Do only the task you were given. The run order is in [README.md](README.md). The data shapes are in `schemas/`,
written by S1. Build against `test/fixtures/bundle/`.

**Rules for every c3.site task.** Use plain HTML, CSS and ES modules. Don't add a framework, a build step or
third-party code; the CSP stays `default-src 'self'`. The site never runs strategy logic, it only draws exported
data. Before opening a PR, run `npx wrangler dev --local`, then `node test/smoke.mjs`, `node test/fuzz.mjs` and any
test the task adds. If a criterion can't be met, say why in the PR. Don't weaken a test.

---

## S3. Chart kit core

Create `public/assets/charts/` with no dependencies. Each chart exports `render(el, data, opts)` and `destroy()`.
It also writes a `<table>` holding the same values, which shows when JS is off or through the figure's "data table"
toggle.

**Shared modules:** scales (linear and time, which skips non-session gaps), axes (small mono labels outside the
frame), grid (`--wire-faint`), frame with corner ticks, one tooltip (follows the pointer and keyboard focus), and
an `IntersectionObserver` so charts render only when visible. Read colours from CSS variables at render time, so a
theme change only needs a redraw.

**Charts**
- **V1 candles with trade overlay.**
  - Bars: 1 px wick; body 60% of the slot; up bars hollow with a `--bull` stroke, down bars filled `--bear`.
  - Overlays: levels as dashed `--wire` lines with labels on the right edge; windows as `--signal-wash` bands;
    entry as a solid `--ink` line; stop dashed `--bear`; targets dashed `--bull`.
  - Risk and reward boxes in `--bear-wash` and `--bull-wash`; the trade path in `--signal`.
  - A crosshair with an OHLC readout.
  - Use SVG up to 400 bars and canvas above that.
- **V2 equity.** Cumulative $ per micro, with a toggle to R. In-sample in `--ink`, out-of-sample in `--signal`, and
  a labelled rule at the split ("holdout starts").
- **V3 underwater drawdown.** Shares V2's x-axis. Area in `--bear-wash`, line in `--bear`. Label the max drawdown
  with its value and dates.
- **V13 sparkline.** 24×80 px, no axes.

Arrow keys move focus from point to point, and the tooltip follows focus. Show every chart on
`/styleguide/` from the fixtures.

**Accept**
- V1 draws a 78-bar session in under 16 ms on desktop, and 300 or more bars through canvas.
- The table values equal the drawn values.
- Keyboard navigation works.
- No third-party code.

---

## S4. R2 publish API and `/data`

Edit `src/index.js` and `wrangler.jsonc`:
- add `r2_buckets: [{binding:"DATA", bucket_name:"c3-site-data"}]`;
- add the var `BACKTESTS_PUBLIC: "false"`;
- add `/data/*` to `run_worker_first`.

Reuse `checkSignature()`. It is Ed25519 over `METHOD\npath?query\nts\nsha256(body)`, with a 5-minute window and
replay protection.

| Route | Auth | Behaviour |
| --- | --- | --- |
| `PUT /api/publish/put?bundle=<id>&path=<rel>` | bot signature | Body at most 5 MB and must parse as JSON. `rel` must match `^[a-z0-9][a-z0-9/_.-]{0,200}\.json$` with no `..`, and `id` must match `^[a-z0-9-]{1,64}$`. Stores the body at `staging/<id>/<rel>` and returns its sha256 |
| `POST /api/publish/commit?bundle=<id>` | bot signature | The body is the bundle's `manifest.json`. Check that every listed file exists in staging with the listed sha256 and byte count, then copy them to `live/<id>/`. Write `live/current.json` = `{bundle, committed_ms}` last. Keep 3 bundles and delete older ones |
| `POST /api/publish/abort?bundle=<id>` | bot signature | Deletes `staging/<id>/` |
| `GET /data/<rel>` | public | Returns 404 unless `BACKTESTS_PUBLIC === "true"`. Otherwise serves `live/<current>/<rel>` with `cache-control: public, max-age=300` and ETag = sha256 |
| `GET /api/p/data/<rel>` | view key | Same as `/data/` but ignores the public flag. `?staging=<id>` reads from staging |

Add `test/publish.mjs`, which covers: signed, unsigned, tampered, stale and replayed requests; path traversal;
oversize bodies; bodies that aren't JSON; commit with a missing file; commit with a wrong hash; the public flag
off; and pruning down to 3 bundles. Document the routes in the README.

**Accept**
- All of those cases pass.
- `current.json` changes only on a successful commit.
- The existing smoke and fuzz tests still pass.

---

## D2. Two-year and walk-forward export (in c3.lab)

Work in `khuovi/c3.lab` on the `kimi` branch. Never read `data/holdout/`. Pass the gate: pytest, ruff, ruff format,
mypy, `tools/check_learnings.py`.

Extend the D1 exporter (`mnq site export`, in `mnq-bot/mnq/app/`). Run the current defaults over
`data/mnq_proxy_5m.csv` with `data/qqq_daily.csv`, using the same simulator as `abg alpha backtest`
(`mnq/backtest/backtest.py`), plus its walk-forward.
- Export the run `orx-proxy2y-v<n>`.
- Tag each trade with `sample: "in"|"out"`. The split is the lab's: search window Jul 1 2024 to Apr 21 2026,
  holdout from Apr 22 2026.
- Write `sessions/<date>.json` for every session that traded, with `source: "proxy"`.
- Fill `checks.random_walk_avg_r` and `checks.walk_forward_avg_r`.

**Accept**
- A test shows the exported stats equal what the CLI prints for the same run.
- The sum of trade R equals the summary's net R within 1e-6.
- Each session file is at most 60 KB.
- Two runs give identical bytes.
- The output validates against the site's schemas.

---

## S7. Session replay `/replay/?run=&day=`

Create `public/replay/index.html` and `assets/replay.js`. It loads `/data/runs/<run>/sessions/<day>.json` and
`sessions/index.json`.
- **Main:** V1 with a scrubber that has play/pause and a speed setting.
- **Keys:** ←/→ steps one bar, Space plays or pauses, S jumps to the signal, Home/End jump to the ends.
- **Side panel:** the decision log, with each entry appearing as the scrubber passes its time, and the V12 card on
  the signal bar. V12 is a 0–100 score dial with a threshold marker and a pass/fail square for each gate, named on
  focus.
- **Header:** context chips for bias, 50-day trend, FOMC and mode, plus the state chip ("Backtest · proxy bars").
- **Day picker:** a calendar coloured by net R, prev/next buttons and "random day".
- **Readout:** `aria-live="polite"` announces the bar time and OHLC.
- With motion reduced, jump instead of animating. With JS off, show a `<noscript>` link to the trade table on
  `/backtests/`.
- If `/data` returns 404, say "Results aren't published yet".

**Accept**
- The keyboard controls work.
- Entry, exits and the trade path line up with the fixture trade's times and prices within 1 px (Playwright).
- A Playwright trace shows 60 fps while scrubbing.
- Deep links restore the view.
