# Public bundle schema v1

These JSON Schemas cover every file in [build-plan.md §5.2](../docs/build-plan.md).
The public Strategy Lab feature was cancelled. `lab/trials.json` and `lab/summary.json` are an optional legacy
pair, and strategy `lab_trials` references are optional. When present, they still validate and reconcile;
new exporters may omit them. The public site does not render Lab data.
They use JSON Schema draft 2020-12 and local relative `$ref`s. `$id` URLs identify schemas;
validation resolves them from disk and does not fetch them. Copy **all** `.schema.json` files
to an exporter, including `common.schema.json`. Ajv and its format support are development dependencies
only; the browser and Worker gain no runtime dependencies.

| Bundle file | Schema |
| --- | --- |
| `manifest.json` | `manifest.schema.json` |
| `strategies.json` | `strategies.schema.json` |
| `engine.json` (optional) | `engine.schema.json` |
| `runs/<run>/summary.json` | `summary.schema.json` |
| `runs/<run>/trades.json` | `trades.schema.json` |
| `runs/<run>/equity.json` | `equity.schema.json` |
| `runs/<run>/monthly.json` | `monthly.schema.json` |
| `runs/<run>/sessions/index.json` | `sessions-index.schema.json` |
| `runs/<run>/sessions/<date>.json` | `session.schema.json` |
| `lab/trials.json` | `trials.schema.json` |
| `lab/summary.json` | `lab-summary.schema.json` |
| `parity/index.json` | `parity-index.schema.json` |
| `parity/<date>.json` | `parity.schema.json` |

The plan sketches some fields without specifying their JSON shape. S1 makes these choices explicit:

- `schema_version` is the integer `1`. `bundle` is a slug. `runs` is an array of run slugs;
  `featured` is `{run, day}`. Optional `synthetic: true` identifies test bundles.
- The manifest lists every file **except itself**, with lowercase SHA-256 and the byte length of the
  exact UTF-8 file including its final newline. Hashing the manifest itself would be recursive.
- Strategy, trade, equity, monthly, session-index, trial and parity-index documents are arrays.
  Engine documents contain `nodes` and `edges`; node order is pipeline order. Optional node `state`
  is display text. Edges identify nodes by `from` and `to`.
- `one_line` is the strategy card's one-line description. Strategy states are `live`, `paper`,
  `research`, `retired`, `in_build`. Retired rows require a reason; in-build rows have no result runs.
- `params_public` and trial `changes` are empty objects until KH approves an explicit field allowlist.
  Trial `rationale`, full `params`, adaptive-book state and raw digests are excluded per §5.3.
  Schema validation is not a substitute for exporter redaction of free text.
- Segments map display names to `{n, win_rate, avg_r, net_r, net_usd}`. The run summary always names
  costs, data provenance and non-overlapping in/out date ranges. Rates are fractions from 0 to 1.
  `profit_factor` and `sharpe_daily` can be `null` when undefined. Empty `checks` means checks were not run.
- Equity starts from zero. Drawdown is a **nonnegative loss magnitude** from the prior running peak
  (including zero); P&L stays signed. Max drawdown here means maximum daily closing drawdown.
  All P&L aggregates must reconcile within `1e-6`.
- OHLCV bars are exactly six numbers: `[unix_s, open, high, low, close, volume]`.
  Session `source` and run dataset `kind` can be `synthetic` for fixtures, or `real`/`proxy` for exports.
  Optional decisions include `score`, an exported `threshold` and exactly twelve named pass/fail `gates`.
  The site displays a threshold only when exported; it does not choose or evaluate one. Fixtures include
  a rejected candidate before accepted signals so both gate states can be tested.
- Trial timestamps are ISO datetimes, newest first. Sources are display labels (`research agent`,
  `KH`, `CLI`); verdicts are `rejected`, `failed_holdout`, `candidate`, `approved`.
  Lab funnel counts include approved trials in passed holdout, and passed holdout in passed search.
  Holdout windows expose dates and at most six looks, never raw holdout market data.
- Parity detail is an allowlisted projection with public trade rows, human-readable `causes`/`notes`,
  and `uptime_gaps` containing `{from, to, note}`. It is not a dump of the engine's raw parity file.

Objects reject unknown fields. New public fields require a deliberate schema change. Dates and datetimes
are checked with `ajv-formats`. The validator also checks inventory completeness, safe paths, no symlinks,
file budgets (1.5 MB per file, 60 KB per session), references and aggregate consistency. It accepts a local
bundle directory, including one downloaded from a future `/data/` endpoint; HTTP fetching is not part of S1.

The synthetic fixture bundle is outside `public/` and is not published by this task. S1 does not modify
the site's design, implement the R2 publisher or export private engine data.
