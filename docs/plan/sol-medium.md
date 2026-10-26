# Tasks for GPT-6.1 Sol, medium effort

Do only the task you were given. The run order is in [README.md](README.md). After S1, the data shapes are in
`schemas/` and the sample data is in `test/fixtures/bundle/`. Chart primitives are in `public/assets/charts/` (S3).

**Rules for every c3.site task.**
- Use plain HTML, CSS and ES modules. Don't add a framework, a build step or third-party code; the CSP stays
  `default-src 'self'`.
- The site never runs strategy logic, it only draws exported data.
- Every figure shows a source chip (run id, data source, sample) that links to `/methodology/#…`.
- Never mix backtest and paper results.
- Text and a summary table must show without JS.
- If `/data/manifest.json` returns 404, show "Results aren't published yet".
- Before opening a PR, run `npx wrangler dev --local`, then `node test/smoke.mjs`, `node test/fuzz.mjs` and any new
  test.
- If a criterion can't be met, say why in the PR. Don't weaken a test.

**Rules for c3.lab tasks (D1, D3).** Work in `khuovi/c3.lab` on the `kimi` branch only. Never read `data/holdout/`.
Pass the gate: pytest, ruff, ruff format, mypy, `tools/check_learnings.py`.

---

## S1. CI, schemas, fixtures

1. Add `.github/workflows/ci.yml`. It runs `npm ci`, starts `wrangler dev --local` with test keys and the fixtures,
   then runs smoke, fuzz and the new tests.
2. Add `schemas/*.schema.json` (JSON Schema 2020-12) for the bundle below.
3. Add `test/make-fixtures.mjs`, which uses a seeded RNG to write `test/fixtures/bundle/`: 2 runs, 10 sessions with
   bars, 30 trades, 12 trials and 3 parity days.
4. Add `test/validate.mjs`, which checks the fixtures against the schemas.

**The bundle** (c3.lab exports it; the site serves it at `/data/<path>`):

```
manifest.json            schema_version, bundle, generated_at, c3lab_commit, files[{path,sha256,bytes}], runs[], featured{run,day}
strategies.json          [{id,name,state(live|paper|research|retired|in_build),one_line,mechanism,rules[],exits[],filters[],scoring,retired_why?,runs[]}]
runs/<run>/summary.json  run_id,strategy,label,kind(backtest|walk_forward|paper),dataset{kind(real|proxy),source,start,end,sessions},
                         costs{commission_rt_usd,entry_slip_ticks,stop_slip_ticks,contract},split{in_sample[2],out_of_sample[2]},
                         stats{trades,win_rate,avg_r,net_r,net_usd,max_dd_usd,profit_factor,sharpe_daily,months_positive,months,worst_month_usd},
                         segments{by_side,by_regime,by_time,by_grade,by_exit,by_setup: {<key>:{n,win_rate,avg_r,net_usd}}},
                         checks{random_walk_avg_r,walk_forward_avg_r},c3lab_commit
runs/<run>/trades.json   [{id,date,setup,side(long|short),grade,regime,opened,closed,entry,stop,t1,final,risk_pts,exit,exit_reason,
                           t1_hit,r,pts,usd,mfe_pts,mae_pts,score,reasons[],sample(in|out)}]
runs/<run>/equity.json   [{date,n,net_r,net_usd,equity_usd,drawdown_usd,sample}]
runs/<run>/monthly.json  [{month,trades,win_rate,net_r,net_usd}]
runs/<run>/sessions/index.json   [{date,n_trades,net_r,has_bars,tags[]}]
runs/<run>/sessions/<date>.json  {date,tz,tf,source,bars[[unix_s,o,h,l,c,v]],levels[{name,price,from?}],windows[{name,from,to}],
                                  context{bias,trend_50d,fomc,mode},trades[],decisions[{t,kind,text}],score?{total,threshold,gates[{name,pass}]},done}
lab/trials.json          [{id,ts,source_label,name,changes,verdict(rejected|failed_holdout|candidate|approved),failed_check?,
                           summary{trades,win_rate,net_usd,max_dd_usd,avg_r},baseline{…same},holdout_looks}]
lab/summary.json         {counts{…by verdict},windows[{start,looks_used,looks_max}]}
parity/index.json        [{day,verdict(match|differs),live_r,backtest_r,causes[]}]
```

The full `params` and the trial rationales are not part of the bundle.

**Accept**
- CI is green.
- `node test/validate.mjs` passes.
- Smoke and fuzz pass unchanged.

---

## D1. Exporter skeleton (in c3.lab)

Add `mnq site export --out <dir>` in `mnq-bot/mnq/app/`. It writes the bundle above from:
- `data/alpha_backtest.json` and `data/mnq_5m.csv` → run `orx-mnq42d-v1` (`source: "real"`);
- `data/lab/lab.sqlite3` (tables `trials`, `peeks`) → `lab/`;
- `data/parity/*.json` → `parity/`;
- the descriptions in `docs/14-alpha-mnq-bot.md` → `strategies.json`, covering `orx`, `orb`, `sweep` and `vwap`
  (the last two retired because they "lost on real bars"), and `nq-rev` and `nq-cont` (in build).

Pass every file through `site.redact()` and a per-file key allowlist. Map `source` values such as
`claude-session-oct22` to a display label ("research agent", "KH", "CLI").

**Accept**
- The output validates against copies of the site's schemas in `mnq-bot/tests/fixtures/schemas/`.
- A test shows no key outside the allowlist and no path-like string survives.
- Two runs give identical bytes.
- The gate passes.

---

## D3. Publish command (in c3.lab)

Add `mnq site publish <dir> [--preview]`. It uploads each file with `PUT /api/publish/put` using the existing
Ed25519 signer (`site.sign_headers`), then calls `POST /api/publish/commit` with the manifest. `--preview` stops
before the commit. Also extend the `track` push with a daily paper equity series (`equity: [{date, net_usd,
equity_usd}]`), and add `equity` to `TRACK_FIELDS` in the site's `src/index.js`.

**Accept**
- Against `wrangler dev --local` with test keys, publish then commit makes `/api/p/data/manifest.json` return the
  new bundle.
- A failed upload leaves `current.json` unchanged.

---

## S6. Backtests explorer `/backtests/`

- A run picker (`.segmented`) over `manifest.runs`.
- A stat strip.
- V2 and V3 with a range brush.
- **V4 monthly heatmap:** years as rows and months as columns, coloured from `--bear` to `--bull` around 0, with the
  value printed and empty months hatched.
- **V5 R histogram:** 0.25R bins from −1.5 to +4, losses `--bear` and wins `--bull`, with the mean and median
  marked.
- **V6 segment bars:** avg R with n, for side, regime, time, grade and exit. Hatch any segment with n < 30 and label
  it "small sample".
- **V7:** paired dots for in-sample vs out-of-sample (win rate, avg R, net/DD).
- A trade table that sorts and filters (side, setup, exit, month). Each row links to `/replay/?run=&day=`.
- Keep the URL state in `?run=&from=&to=&side=`.

**Accept**
- Filtering to side=short gives the fixture's short count in both the table and the charts.
- Deep links restore the view.
- The summary table shows without JS.

---

## S8. Strategies `/strategies/` and `/strategies/<id>/`

- **Index:** cards with a state chip, the one-liner, a V13 sparkline, trades and avg R.
- **Detail:**
  - Theory, Rules, Exits, Filters and Scoring, all from `strategies.json`.
  - The headline run: stat strip, V2+V3, V5 and V6.
  - Best, worst and typical day, linking to the replay.
  - Forward record and lab trials.
- Retired strategies show `retired_why`. `in_build` strategies show theory only, with no numbers.
- Pages are `public/strategies/index.html` plus one `public/strategies/<id>/index.html` per strategy, each loading
  `assets/strategy.js` with its id.

**Accept**
- Each state chip matches the data.
- `in_build` pages show no numbers.
- The best and worst links open the right days.

---

## S9. Engine page `/engine/`

Add `public/assets/engine.json`, which lists nodes `{id, label, spec, text, inputs[], outputs[]}` and edges. The
nodes, in order: Feed, Structure §4, Context §5, Intraday §6, Models §8–9, Score §10, Gates §11, Tracker §12,
Alerts §13, Ledger §14, Lab, Site.

**V11:** an isometric (30°) wireframe of boxes and pipes in `--wire`, with the active path in `--signal`. Focus or
hover on a node opens a panel showing its text, inputs and outputs, and a state line from `manifest.json`. Below the
schematic: the two engines (the NQ engine is in build; the MNQ bot is paper trading) and how they relate.

**Accept**
- The keyboard walks the nodes in pipeline order.
- Without JS the page shows an ordered list of the same nodes.

---

## S10. Lab page `/lab/`

- The judging rules as a checklist: at least 250 trades; at least 80% of the current trade count; at least 90% of
  the current net profit; win rate at least 1 point better; net/DD at least 5% better; consistent in 3 of 4
  sub-periods; a neighbouring value also beats the current; no edge on random walk; then a holdout that allows 6
  looks; then a person approves.
- **V10:** a funnel (tried → passed search → passed holdout → approved) and a scatter of Δ win rate against
  Δ net/DD, coloured by verdict.
- A ledger table: date, name, source, verdict chip, the first check failed (in plain words), Δ win rate and
  Δ net/DD.
- Holdout looks used per window.

**Accept**
- The counts equal the fixture's verdict counts.
- Failed checks read as plain words.

---

## S11. Track record v2

Keep the current `/track-record/` content (`/api/track`). Add:
- V2 paper equity from `stats.equity`. Fall back to the current view if it's missing.
- V4 monthly.
- A parity section from `/data/parity/index.json`: per day, a strip comparing backtest R with live R, with the
  causes in plain text.
- The "Paper (virtual) trades" chip throughout.

**Accept**
- The page shows no backtest numbers.
- It works without the equity series and without `/data`.

---

## S13. Home rework

- **Hero:** keep the headline and intro, and replace the illustration with V1 replaying `manifest.featured` once.
  With motion reduced or no data, show the static last frame, or the old illustration with its "Illustration" chip.
- **Story:** keep the five steps and the rail. Each step highlights the matching V11 node and V1 layer.
- **Results:** a stat strip and a V2 thumbnail from the headline run, with source chips, linking to Backtests and
  Track record.
- **Lab strip:** "N ideas tried, M adopted" from `lab/summary.json`.

**Accept**
- The home page is at most 150 KB before `/data`.
- Mobile LCP is under 2.0 s.
- The story works without JS.
- The "Illustration" chip appears only on the fallback.

---

## S14. "How it could play out"

Add **V9**, a canvas fan chart. A same-origin Web Worker bootstraps 2,000 sequences of the run's trades with a
seeded RNG and projects the next 100 trades. Draw the median line plus 50% and 90% bands. The caption reads:
"A resample of past trades, not a forecast" and links to `/methodology/#samples`. If the bundle has variant runs (for
example T1 at 0.5R, 0.7R or 1.0R), add a switch between them. Place V9 on `/backtests/` and the strategy pages.

**Accept**
- The same seed gives the same bands.
- No trading rule is reimplemented in JS.

---

## S16. Quality pass

Add Playwright (`test/ui.mjs`) and axe-core as dev dependencies only, and run them in CI on every route:
- no horizontal scroll at 320, 390, 768 and 1440 px;
- no console errors;
- light, dark and reduced motion all work;
- each chart shows a known fixture value;
- axe reports 0 serious violations.

Run Lighthouse on mobile for home, backtests and replay. Record the measured budgets in the README: page JS+CSS+HTML
at most 250 KB gzip, session files at most 60 KB, LCP under 2.0 s, CLS under 0.05.

**Accept**
- Everything passes in CI.
- Lighthouse performance is at least 90 on those three pages.
