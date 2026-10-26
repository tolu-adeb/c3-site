# c3.site build plan: index

The goal is to make c3.site an eye into the engine of c3.lab. It gets a wireframe look with coloured price bars, backtests published from
c3.lab, and pages for the engine, strategies, backtests, session replay, the lab and methodology.

Give each Codex session **one task**, and only the file for that task's model. Each file is complete on its own.

| File | Model | Effort |
| --- | --- | --- |
| [luna-high.md](luna-high.md) | GPT-6 Luna | high |
| [sol-medium.md](sol-medium.md) | GPT-6.1 Sol | medium |
| [sol-high.md](sol-high.md) | GPT-6.1 Sol | high |

Keep speed on Standard. Move a task to the next level up only after it fails its acceptance criteria twice.

## Run order

| # | Task | File | Repo |
| --- | --- | --- | --- |
| 1 | S1 CI, schemas, fixtures | sol-medium | c3.site |
| 2 | S2 Design tokens v2 | luna-high | c3.site |
| 3 | S3 Chart kit core | sol-high | c3.site |
| 4 | S4 R2 publish API | sol-high | c3.site |
| 5 | D1 Exporter (42-day run) | sol-medium | c3.lab |
| 6 | D2 Two-year and walk-forward export | sol-high | c3.lab |
| 7 | D3 Publish command | sol-medium | c3.lab |
| 8 | S5 Dashboard "Published data" tab | luna-high | c3.site |
| 9 | S6 Backtests explorer | sol-medium | c3.site |
| 10 | S7 Session replay | sol-high | c3.site |
| 11 | S8 Strategies pages | sol-medium | c3.site |
| 12 | S9 Engine page | sol-medium | c3.site |
| 13 | S10 Lab page | sol-medium | c3.site |
| 14 | S11 Track record v2 | sol-medium | c3.site |
| 15 | S12 Methodology page | luna-high | c3.site |
| 16 | S13 Home rework | sol-medium | c3.site |
| 17 | S14 "How it could play out" | sol-medium | c3.site |
| 18 | S15 Nav, menu, footer | luna-high | c3.site |
| 19 | S16 Quality pass | sol-medium | c3.site |
| 20 | S17 Go public | luna-high | c3.site (needs KH) |

Tasks 1 to 4 come first, in order. After that, tasks 9 to 18 can run in any order, because they build against the
fixtures and don't need real data. Tasks 5 to 7 run in c3.lab: commit on the `kimi` branch, never read
`data/holdout/`, and pass its verification gate.

## Open decisions (KH)

1. How much of the strategy goes public? Recommended: publish the rules in words plus every trade and bar, and keep
   the exact params and the rationales of rejected trials private.
2. Should the MNQ bot lead the story, with the NQ engine shown as "in build"? Recommended: yes.
3. Should backtest data go through R2 rather than being committed to this public repo? Recommended: R2.
4. Should the swing desk and wide scan go on the public site? Recommended: not in this build.
5. Do you want a custom domain before going public?
