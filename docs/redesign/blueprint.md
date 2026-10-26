# c3.lab redesign blueprint

Reference: enpowertrading.co.za (an electricity trader's site, studied 2026-10-25 for technique only).
Diagram: [architecture.html](architecture.html) (open in a browser; source `architecture.archify.json`).
Status: **phase 1 is built and live** (home story, tile menu, display panel, restyled inner pages and dashboard).
Phases 2 and 3 below are proposals.

## Conclusions first

1. The reference is memorable for one thing: a scroll-driven story told through a line-drawn technical scene,
   with a section bar that shows how far through the story you are. That technique carries over to c3.lab; the
   way it was built does not (about 8 MB of 3D models and a loader that hides the page).
2. c3.lab keeps the technique and changes the medium. The story is the path from a one-minute bar to a tracked
   virtual trade, drawn as a single SVG session chart that gains one layer per step. The home page weighs about
   **103 KB** against the reference's **~8.2 MB**, makes **no third-party requests** (the reference loads Google
   Ads, Google Analytics, Tag Manager and LinkedIn Insight before consent), and shows all of its text without JS.
3. What else was worth adopting: an editorial 12-column grid with hairline rules and very large light display
   type; small solid label chips with an index code; a numbered tile menu; a settings panel for theme and motion;
   a giant footer link. Each is rebuilt for c3.lab with real controls and stated state.
4. What's deliberately not copied: their copy, images, 3D models, logo, colour pairing (cream with red-orange),
   type choices and section codes. Nothing on the site names or implies a link with the reference.

## How the reference was examined

REA (morluto/rea 6.8.0) could not attach: both this cloud workspace and the laptop's sandbox block the site at
their network allowlist, so REA's CDP tools never reached it. The same questions were answered from the desktop
app's built-in browser (public pages only, a handful of loads, no forms submitted, cookie banner left
unanswered): the accessibility tree, the DOM, computed styles, Performance API entries (resources, LCP, CLS,
long tasks, frame timing) and the sitemap. Bulk download of their JavaScript bundles for fingerprinting was
stopped at the owner's request; library identification below therefore rests on runtime evidence only.
Screenshots stayed out of git.

Evidence (E-numbers are cited below; all measured at a 618 px wide viewport, so desktop numbers will differ):

| # | Finding | How it was observed |
| --- | --- | --- |
| E1 | robots.txt allows everything; the sitemap lists 16 URLs (home, products, team, FAQ, contact, eight service landing pages, buy energy, privacy) | `/robots.txt`, `/sitemap.xml` |
| E2 | Next.js pages router (`__NEXT_DATA__`, `/_next/static/chunks/*`), build `UmNkeWAb…`; 415 KB of scripts | `window` globals, `document.scripts`, resource timing |
| E3 | Home is one WebGL2 canvas (1236×1382 backing store) over a one-screen document (scrollHeight = viewport): the scroll is virtual; the real headings sit underneath at ~6 px for search and screen readers | canvas probe, computed styles |
| E4 | Seven Draco-compressed GLB scenes (overview 2.5 MB, towers 1.5 MB, solar 0.8 MB, factory, turbines, hydro, central) plus textures; ~7 MB of the ~8.2 MB transferred | resource timing |
| E5 | Smooth scrolling is Lenis (`html.lenis.lenis-smooth`) | root element classes |
| E6 | Idle home: 30 fps, worst frame 34 ms, 13 long tasks (longest 958 ms, model decoding); load event at 3.7 s; LCP 1.07 s; CLS 0.0003 | PerformanceObserver, rAF sampling |
| E7 | "Energy usage" panel: a letter grade, memory/CPU/GPU meters and three toggles (dark mode, reduce animations, high-quality render). Memory (60 MB) matches `performance.memory`; there's no browser API behind the GPU figure, so it's likely an estimate | panel text vs `performance.memory` |
| E8 | Toggles are `<button>`s whose on/off state lives only in a class (no `aria-pressed`); the menu button has no `aria-expanded`; focus stays on the page when the menu opens | DOM attributes, `document.activeElement` |
| E9 | Dark mode inverts to `#010101` on `#F9F8F3` and isn't saved (no storage key, no cookie): it resets on every visit | storage and cookie keys after toggling |
| E10 | Inner pages open behind a "Loading 100%" screen that only clears on the first scroll or input (FAQ still covered 42 s after load) | polling the loader element |
| E11 | Ad and analytics beacons (googlesyndication, google-analytics, px.ads.linkedin.com) fire and `li_adsId` is stored while the cookie banner is still unanswered | resource timing, localStorage keys |
| E12 | FAQ: 24 accordion rows, `aria-expanded` on the `<li>` instead of the button. Contact: fields marked `*` but not `required`; an unlabelled multi-select | DOM attributes |
| E13 | Type: one neo-grotesk family (rendering as Arial here) at three steps: ~86 px display (line-height 0.83, tracking −3%), ~14 px body, ~6 px labels; sizes scale with the viewport, so labels get unreadably small on narrow screens | computed styles |
| E14 | Motion: 0.3 s `cubic-bezier(.4,.4,.1,1)` on most transitions, 0.2 s `cubic-bezier(.8,0,.2,1)` for quick state changes | computed `transition-*` across 4,000 nodes |

## Teardown: sections, tabs and controls

| Reference element | What it does | Built with | Cost |
| --- | --- | --- | --- |
| Hero | One statement headline, two short paragraphs, a scroll cue | WebGL scene behind DOM text (E3) | 2.5 MB scene before anything moves (E4) |
| Story (Solar → Wind → Hydro → Transmission → Aggregation → Customer → Future Market) | Each scroll step flies the camera to a new scene; a corner card shows the title, an index code and Show/Hide Info | Virtual scroll + per-section GLB (E3–E5) | 30 fps idle, long tasks (E6) |
| Section bar | Thin strip of section names with ticks; finished sections fill; a % at the right | DOM, driven by the virtual scroll | Cheap; the best idea on the site |
| Menu | Full-screen grid of black numbered tiles, current page marked with a small square | DOM | Keyboard focus not moved (E8) |
| Energy panel | Grade + meters + three settings | DOM + estimates (E7) | Settings unlabelled for assistive tech (E8), not remembered (E9) |
| Products, Team, FAQ, Contact | Editorial grid: label chips, huge light headings, hairlines, giant numerals, accordions, forms | DOM | Loader hides them (E10); ARIA misplaced (E12) |
| Footer | Giant "email us" link, newsletter form, link columns, back to top | DOM | Fine |

Worth adapting: the section bar, the scroll story structure, the line-drawn illustration style, the editorial
grid and type scale contrast, the tile menu, a settings panel, the giant footer link.
Weak, with the measurement: preloader blocking content (E10); 8 MB and 30 fps for an informational page
(E4, E6); stateless and unlabelled controls (E8, E9, E12); tracking before consent (E11); viewport-scaled labels
that fall to ~6 px (E13).

## c3.lab sitemap and section map

| Page | Sections, in order | Content source | Interactive pieces |
| --- | --- | --- | --- |
| `/` | Hero → Story (01 Read §3, 02 Structure §4, 03 Context §5, 04 Score §8, 05 Track §12) → Results → footer | Static, plus `/api/track` when the track record is public | Sticky chart that gains a layer per step, "How it works" disclosures (`<details>`), section rail with %, tile menu, display panel |
| `/track-record/` | Label, heading, intro, stats, monthly table | `/api/track` (D1 `latest` row from the bot's signed push) | Same chrome |
| `/join/` | Label, heading, intro, form, privacy note | `POST /api/join` | Form with honeypot and rate limit |
| `/404` | Label, heading, link home | Static | Same chrome |
| `/app/` (private) | Status header, coverage strip, tabs: MNQ bot today, Research, Research papers, Swing desk, Controls, Track record, Waitlist, Webhooks | `/api/p/*` with the view key | Unchanged behaviour; adopts the new tokens and type, stays utilitarian |

Mapping: reference story steps → our five pipeline steps (a real sequence, so numbering is honest); reference
index codes → our build-spec section numbers; reference corner cards with Show/Hide Info → native `<details>`;
energy panel → a Display panel; reference product numerals P1/P2 → not used (we have one product).
Dropped: the preloader, the 3D scenes, the energy grade, the newsletter form (the waitlist covers it).

## Design system (as built)

- **Colour.** Light: chart paper `#EDF0F3`, ink `#0D141C`, soft `#4B5767`, rule `#C3CBD6`, panel `#F6F8FA`,
  signal cobalt `#2B46E0` (the armed window, the trade path, progress, focus). Dark: `#0E141B` / `#E6ECF3` /
  `#8197FF`. Up/down/warn keep the dashboard's existing greens, reds and amber. Reasoning: a cool chart-paper
  ground and one blue signal read as instrumentation, not as the reference's warm editorial palette.
- **Type.** Archivo variable (weight 100–900, width 62–125%), served from this site (87 KB). Display: weight
  300, width 74%, tracking −2.8%, `clamp(3rem, 10.5vw, 8.6rem)`. Step numerals: weight 200, width 62%. Body
  17 px / 1.6. Labels never go under 13 px.
- **Space and grid.** 12 columns, gutter `clamp(1rem, 3.2vw, 2.25rem)`, max width 78 rem, hairline rules for
  structure, a solid ink rule to open each major band.
- **Motion.** `--ease: cubic-bezier(.3,.6,.1,1)`, quick 0.18 s, calm 0.42 s, the trade path draws in 1.1 s.
  "Reduced" (Display panel, saved) or the OS setting sets every duration to 0.
- **Components.** Label chip (solid or outline), pill tool button with `aria-expanded`, segmented buttons with
  `aria-pressed`, tile menu with focus trap and Esc, disclosure, section rail, stat, table, form controls.

## Motion and illustration

No WebGL. One 8 KB inline SVG of an illustrative session: outline candles, then swing points and the swept
overnight low, then the 9:30–12:00 window, then a model/score/gates card, then entry, stop, target and the
trade path. CSS shows layer *n* when the story reaches step *n*; without JS every layer is visible. The chart
sits in a sticky column on desktop and pins under the top bar on phones. There's no loader: content renders
first, the font swaps in. The Display panel's page-weight line is measured by the browser
(`performance.getEntriesByType`), not estimated.

## Technical plan

Stay on one Worker with static assets and D1, no build step. Files: `public/index.html`,
`public/assets/{site.css,theme.js,chrome.js,home.js,track.js,join.js}`, `public/assets/fonts/`
(Archivo, OFL). `theme.js` runs in `<head>` so a saved theme applies before paint. The CSP tightened to
`style-src 'self'; font-src 'self'` (Google Fonts removed). No new routes. A framework (Astro) or a CMS isn't
worth it yet: five static pages, and the CSP would need loosening for most CMS preview tooling.
Track record charts (phase 2) follow the dataviz rules: a single-series monthly bar chart, recessive axes, a
hover tooltip, and the existing table kept as the accessible view.

## Budgets and quality bar

| Budget | Now | How it's checked |
| --- | --- | --- |
| Home transfer under 150 KB before any extra media | 103 KB, 7 requests | Display panel readout; Playwright run |
| No horizontal scroll at 320–1440 px | None at 390 and 1440 | Playwright `scrollWidth` check (phase 2: add 320) |
| No third-party requests | 0 | Display panel; CSP blocks them anyway |
| Readable without JS | All text and every chart layer | `html:not(.js)` styles; tool buttons hidden without JS |
| Keyboard-complete | Menu focus trap and Esc, Display panel focus and Esc, skip link, `<details>` | Manual + phase 2 axe run |
| Mobile LCP under 2.0 s, CLS under 0.05 | Not yet measured on the live site | Phase 2 Lighthouse run |

## Content and compliance

Every number is paper or virtual-trade results: the home page and track record say "virtual trades", the footer
says alert-only and "Educational, not financial advice", and the chart is labelled "Illustration, not real
data". No performance promises. Waitlist: email used once, never shared. No cookies or trackers. No mention of
the reference anywhere on the public site.

## Build phases

| Phase | Scope | Done when | Effort |
| --- | --- | --- | --- |
| 1 (built) | Tokens and type, self-hosted font, home story + chart + rail, tile menu, Display panel, restyled inner pages and dashboard, tighter CSP | Smoke 72/72, fuzz 301/301, Playwright: no overflow at 390/1440, no console errors, light and dark | Done |
| 2 | Track record chart (monthly bars, tooltip), a methodology page from the build spec, 320 px and axe checks in CI, Lighthouse budgets | New smoke checks for the methodology page; axe 0 violations; Lighthouse mobile LCP < 2 s | 1–2 days |
| 3 | Optional: real (anonymised) session replays in the story once the forward test has enough history; a public FAQ | Content review with khuovi; same budgets hold | 2–3 days |

## Open questions

1. Should the public pages describe khuovi's NQ engine (as now) or your MNQ bot, whose results feed the track record?
2. Is a public methodology page from the build spec OK to publish, or does the spec stay private?
3. Do you want a custom domain before sharing the site?
