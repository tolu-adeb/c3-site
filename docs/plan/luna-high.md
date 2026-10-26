# Tasks for GPT-6 Luna, high effort

Do only the task you were given. The run order is in [README.md](README.md).

**Rules for every task.** Use plain HTML, CSS and ES modules under `public/`. Don't add a framework, a build step or
third-party code; the CSP stays `default-src 'self'`. Every page must read without JS. Before opening a PR, run
`npx wrangler dev --local`, then `node test/smoke.mjs` and `node test/fuzz.mjs`. If a criterion can't be met, say
why in the PR. Don't weaken a test. Write copy in short, plain sentences.

---

## S2. Design tokens v2

Edit `public/assets/site.css`. Define each token in three places: `:root` (light), under
`@media (prefers-color-scheme:dark){:root:not([data-theme="light"])}`, and under `:root[data-theme="dark"]`.

| Token | Light | Dark |
| --- | --- | --- |
| `--bull` | `#12805A` | `#2FBF8A` |
| `--bear` | `#C8322F` | `#F0625A` |
| `--bull-wash` | `rgba(18,128,90,.10)` | `rgba(47,191,138,.14)` |
| `--bear-wash` | `rgba(200,50,47,.10)` | `rgba(240,98,90,.14)` |
| `--wire` | `#9AA6B5` | `#3A4758` |
| `--wire-faint` | `#CDD4DE` | `#222D3A` |
| `--mono` | `ui-monospace,"SFMono-Regular",Menlo,monospace` | same |

Keep `--up` and `--down` for the dashboard chips.

**Wireframe style**
- Figure frame: 1 px `--wire`. Put an index code top left (for example `FIG 3.2`) and a state chip top right.
- Chart grid: 1 px `--wire-faint`.
- Up candles are hollow with a `--bull` stroke. Down candles are filled `--bear`.

**Components:**
- `figure.fig`: frame, index code, state chip, caption, source chip and a "data table" toggle.
- `.stat-strip`: four to six stats.
- `.chip.state`: variants `backtest`, `oos`, `paper`, `live` and `illustration`.
- `.segmented`: a group of `<button aria-pressed>`.

Recolour the home page's SVG candles (`public/index.html`, `.s1`) in the new style.

Add `public/styleguide/index.html` with `<meta name="robots" content="noindex">`. It should show every token,
chip, figure and candle style.

**Accept**
- The tokens exist in all three places.
- A small script (`scripts/contrast.mjs`) reports at least 3:1 for `--bull`, `--bear` and `--wire` against `--bg`
  in both themes, and at least 4.5:1 for the text tokens.
- Existing pages look the same apart from the candles.
- Smoke passes.

---

## S5. Dashboard "Published data" tab

This needs S4. Add a tab to `public/app/` (`assets/app.js`, `PANELS`) that reads `/api/p/data/manifest.json`,
which needs the view key. It shows:
- the current bundle id and its commit time;
- the file list with sizes;
- for each staged bundle, a preview link (`/api/p/data/manifest.json?staging=<id>`).

**Accept**
- A smoke check covers the tab's API.
- No public route can read `staging/`.

---

## S12. Methodology page

Create `public/methodology/index.html` in the existing page chrome. Use one `<h2>` per anchor.
1. `#data`: real MNQ 5-minute bars from Aug 2026. Before that, a QQQ 5-minute proxy scaled by the MNQ/QQQ ratio.
   Over 43 overlapping days the proxy reproduced all 26 real trades on the same side.
2. `#costs`: entry at the signal close plus 1 tick, stop minus 1 tick, and $1.24 commission per micro round turn.
   When a bar touches both the stop and a target, the stop counts first.
3. `#walk-forward`: settings are picked on earlier half-years and tested on the next.
4. `#holdout`: the last 6 months are locked, with 6 counted looks per window, and a person approves changes.
5. `#random-walk`: on structureless bars the strategy shows no edge, which shows the simulator doesn't leak.
6. `#samples`: what in-sample, out-of-sample, paper and live mean.
7. `#limits`: the real-bar sample is short, the proxy differs from MNQ, and the backtest has no overnight data.
8. `#glossary`: R, MFE, MAE, drawdown, profit factor, ORH/ORL, PDH/PDL, ONH/ONL, FVG, MSS, BOS.
9. `#disclaimer`: alert-only, educational, not financial advice. Backtests are hypothetical. Past and
   hypothetical results don't guarantee future results.

**Accept**
- A test crawls every `href="/methodology/#…"` on the site and finds the anchor.
- The page loads without JS.

---

## S15. Nav, tile menu, footer, 404

Change the top bar to `Engine · Strategies · Backtests · Track record · Lab`, with Join as the button. Edit the
shared chrome in `assets/chrome.js` and each page's header. The tile menu lists every route with codes 01 to 08.
Add Methodology and the disclaimer line to the footer. Restyle `404.html`.

**Accept**
- The menu still traps focus and closes on Esc.
- `aria-current="page"` is correct on every page.
- There's no horizontal scroll at 320 px.

---

## S17. Go public (with KH)

1. KH reviews every page against the staged real bundle through `/app/` preview.
2. On KH's word, set `BACKTESTS_PUBLIC` to `"true"` in `wrangler.jsonc`.
3. Check that every page showing a number carries the disclaimer and source chips.

**Accept:** KH has approved in writing on the PR.
