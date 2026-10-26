# c3.site agent instructions

This is the c3.lab website: one Cloudflare Worker (`c3-lab`) with static pages, D1 and (from the build plan) R2.
Claude Code and Codex both work here.

1. **Start from the plan.** [docs/plan/README.md](docs/plan/README.md) gives the run order. Read only the plan file
   your task is in. Do one task per branch and pull request. Merging to `main` deploys.
2. **No third parties.** No CDN scripts, fonts, analytics or trackers. The CSP stays `default-src 'self'`.
3. **No framework, no build step.** Plain HTML, CSS and ES modules under `public/`. Charts live in
   `public/assets/charts/` and have no dependencies.
4. **The site never runs the strategy.** It only draws data that c3.lab exported. Don't reimplement trading rules
   in JS.
5. **Label every number.** Each figure shows its run id, data source, sample (in or out of sample, paper or live)
   and links to Methodology. Never mix backtest and forward results.
6. **No secrets in the repo.** `wrangler.jsonc` holds only public keys and hashes. Test keys go in `.dev.vars`,
   which is git-ignored.
7. **Build against fixtures.** Use `test/fixtures/bundle/`. Don't wait for real data.
8. **Done means tested.** Run `node test/smoke.mjs` and `node test/fuzz.mjs` against `npx wrangler dev --local`,
   plus any new test the task adds, before you open a PR. If an acceptance criterion can't be met, say why in the
   PR. Don't weaken the test.
9. **Keep the voice.** Write short, plain sentences with no hype, and state the limits.
