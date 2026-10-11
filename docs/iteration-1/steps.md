# Iteration 1 – working steps

Plan: [PLAN.md](../../PLAN.md). Rules and workflow: [AGENTS.md](../../AGENTS.md).

## Status on 2026-10-10

The proof of concept was built in one pass to get to an answer, not step by step. The answer is in [report.md](report.md). What that pass covered, against the steps below:

| Milestone | State | Not done |
| --- | --- | --- |
| 0 Foundation | Partly | Lint and format (oxlint, oxfmt), CI, Dependabot, license file, `.claude/settings.json`, glossary. `check` is type-check plus unit tests. The app now uses Tailwind and nuqs |
| 1 Fixtures and mock API | Done | Synthetic generator (1.2). The network guard lives in the benchmark runner, not in a shared Playwright fixture (1.5) |
| 2 Maid draws OSM data | Done | `osm-data` was not evaluated ([ADR 0005](../adr/0005-own-store-for-the-proof-of-concept.md)). Live mode is a URL switch without UI, cache or test (2.6) |
| 3 iD and Rapid under automation | Done | Pins are per editor in `tools/refs/*/pin.json`. Adapters live in the host pages, so there are no separate driver files (3.4 to 3.7) |
| 4 Benchmark and report | Done | Zod schema for results, CDP traces, check of the frame-cap flags, CI smoke (4.6). No run on plain geometry before styling (4.5) |
| 5 Core style, hover, select | Mostly | Fill patterns, sided markers, midpoints. The look review is a table in the report, not a per-item screenshot checklist (5.8) |
| 6 Compare page | Works | Opens three windows instead of frames. Camera relay is tested; leading by real pointer input was not verified in the automated test. No scenario replay (6.3) |
| 7 Renderer experiments | Mostly | deck.gl was not needed and not tried (7.5). Sources split by area is the open experiment |
| 8 Answer | Second edition | The report has the fair comparison, the drag scenario, Firefox and WebKit. The thresholds were never confirmed, and the decision is Tobias's (8.3) |

The checkboxes below are left as they were. Tick them when a step is done to the letter.

## How to use this file

- Work top to bottom. Steps inside a milestone depend on each other unless marked **(parallel)**.
- One step is one commit. Tick the box in that commit and add a line `Result:` with what happened, the numbers if any, and links to files.
- **Done when** is the check. If it cannot be checked by a command, the step is not finished.
- If a step turns out wrong or too big, change this file first, in its own commit, and say why.
- Steps marked **(person)** need Tobias: a decision, or an action that core rule 1 reserves for a person.

## Milestone 0: Foundation and automation

Goal: an agent can clone the repo, run one command to set up, pick a step, and verify its work.

- [ ] **0.1 Workspace.** Bun workspaces root with `apps/*`, `packages/*`, `tools/*`. `bunfig.toml`, `.nvmrc`, TypeScript 7 with the app and scripts tsconfig profiles, oxlint and oxfmt configs from the `tech-stack` skill, Vitest.
  Done when: `bun install && bun run check` passes on an empty workspace.
- [ ] **0.2 Scripts contract.** Add every script from the table in AGENTS.md to the root `package.json`. Scripts that have no implementation yet exit non-zero with "not implemented, see step X.Y".
  Done when: each name in the AGENTS.md table exists in `package.json`.
- [ ] **0.3 Maid app shell.** `apps/maid` with Vite, React 19 and the React Compiler, Tailwind, `react-map-gl/maplibre`, an empty map without a basemap (plain background colour), `MapProvider`, and `window.__maid` exposed in dev and test builds (map instance, version). Check here that `react-map-gl` 8 runs with MapLibre 6; if not, pin MapLibre 5 and record it in an ADR.
  Done when: `bun run dev` serves the app and a Playwright smoke test reads `window.__maid.map.getZoom()`.
- [ ] **0.4 Agent setup.** `.claude/settings.json` with an allowlist for the repo scripts and read access to `.reference/`; `.claude/launch.json` for the dev servers with fixed ports (see 0.5); `docs/adr/` with a template and ADR 0001 "Records decisions here"; `docs/GLOSSARY.md` with the terms used in PLAN.md (scene, scenario, driver, fixture, settle time, core subset).
  Done when: a fresh agent session can run `bun run check` and `bun run dev` without a permission prompt.
- [ ] **0.5 Ports.** One file `tools/ports.ts` as the single source: Maid 5173, compare 5174, iD 8081, Rapid 8082, mock API 8090. Everything else imports it.
  Done when: no other file contains these numbers (`grep`).
- [ ] **0.6 CI.** GitHub Actions: `check-ci` on every push. A placeholder job for `bench-smoke` that is enabled in 4.6. Dependabot from the `tech-stack` template.
  Done when: the workflow file passes `actionlint` and runs green once the repo is pushed. **(person)** to push.
- [ ] **0.7 License and attribution.** `LICENSE.md` (ISC, decided), a note on ODbL for `fixtures/`.

## Milestone 1: Fixtures and mock API

Goal: the same frozen data for every editor, with no request leaving the machine.

- [ ] **1.1 Fixture format and tooling.** `tools/fixtures`: a script that cuts a bounding box from a local `.osm.pbf` with osmium and writes OSM API JSON (`elements` with nodes, ways, relations, complete ways) plus a `meta.json` (bbox, counts, source file, extract date, osmium version). The script takes a local file path and never downloads.
  Done when: unit tests pass on a tiny hand-written `.osm` file.
- [ ] **1.2 Synthetic generator.** `fixtures-synthetic --nodes N`: a deterministic grid city (roads of several classes, buildings, landuse, POIs, some `layer` and `bridge` tags) in the same format, around a fixed Berlin coordinate.
  Done when: the same seed gives byte-identical output; fixtures for 10k, 100k and 500k nodes are generated in tests, and 10k is committed.
- [ ] **1.3 Real fixtures. (person)** Tobias downloads one Geofabrik Berlin extract and runs `fixtures-build` for `small`, `medium` and `dense` (areas from the decisions in PLAN.md). Commit the JSON (gzip) and `meta.json`.
  Done when: three scenes are in `fixtures/` with counts in `meta.json` that match the size targets.
- [ ] **1.4 Mock OSM API.** `tools/mock-osm-api` on Bun: `/api/capabilities(.json)`, `/api/0.6/map(.json)?bbox=` answered from a spatial index over one scene (selected by `?scene=` at start or a path prefix), `/api/0.6/node/ID.json`, `/api/0.6/{way,relation}/ID/full.json`, CORS headers, 405 for every write, optional `--latency ms`. It logs each request as a JSON line.
  Done when: tests cover each endpoint; a `map` request for a bbox returns exactly the nodes inside plus complete ways, like the real API.
- [ ] **1.5 Network guard.** A Playwright fixture used by every test and benchmark: abort and record any request to a non-localhost host; fail the test if a blocked host matches the OSM infrastructure list in AGENTS.md; write `blocked-requests.json`.
  Done when: a test that tries to fetch `https://api.openstreetmap.org/api/capabilities` fails with a clear message, and the request never leaves (asserted by the abort).

## Milestone 2: Maid draws OSM data

Goal: a fixture on screen in MapLibre as plain geometry. No iD styling yet.

- [ ] **2.1 Evaluate `@osm-editor-kit/osm-data`.** Read it (`osmberlin/street-space-editor`), load the `dense` fixture, measure parse and index time and memory, check for hard-coded hosts. Decide in an ADR: use as is, improve upstream, or write `packages/data` here. Update `docs/research/osm-editor-kit.md`.
  Done when: the ADR exists with the measurements.
- [ ] **2.2 Data loading.** `apps/maid` loads a scene from the mock API per z16 tile for the viewport, like iD and Rapid do, into the store. The API host comes from config; the default is the mock. A `?scene=` parameter selects the fixture.
  Done when: `window.__maid.stats()` returns node, way and relation counts that match `meta.json` after panning over the whole scene.
- [ ] **2.3 Feature builder.** `packages/renderer`: store to GeoJSON for areas, lines, points and vertices with stable ids (`w123`, `n4`). Closed ways become areas by iD's rules (start with the `area=yes` and key-based rule; note what is missing). Multipolygon relations become polygons with holes.
  Done when: unit tests on small inputs; counts per geometry type for each fixture are written to a snapshot.
- [ ] **2.4 Plain layers.** `<OsmLayers>`: one source per geometry type with `promoteId`, layers for area outline and light fill, lines in one colour, points and vertices as circles. Read `modules/core/Map3dSystem.ts` in `.reference/rapid` first.
  Done when: a Playwright test opens each scene, waits for `idle`, and `queryRenderedFeatures` finds features of every type; a screenshot is saved.
- [ ] **2.5 Debug handle.** `window.__maid`: `ready()` (promise), `settled()` (resolves on the next `idle` after data and tiles are done), `setCamera`, `stats()` (entities loaded, features per source, features rendered), `hover(id)`, `select(id)` as stubs for now.
  Done when: the Playwright helpers in `tools/bench` use only this handle, no DOM scraping.
- [ ] **2.6 Live mode (manual).** A switch in the dev UI to point Maid at the real OSM API: off by default, refused when `navigator.webdriver` is set, only at z >= 16, with a response cache and a visible notice. Not used by any test.
  Done when: a test asserts that live mode cannot be enabled under automation.

## Milestone 3: iD and Rapid under automation

Goal: both reference editors show the same fixture from the mock API and can be driven by script.

- [ ] **3.1 Pins.** `tools/refs/pins.json` with repo URL and commit for iD (latest upstream release of `openstreetmap/iD`, decided) and Rapid (`bhousel/Rapid`, current `main`).
- [ ] **3.2 `refs-setup`.** Clone both at their pins into `.reference/` (from GitHub), install and build (iD: `npm ci`, `npm run build`; Rapid: `bun install`, `bun run build`). Idempotent: skip when the built commit matches the pin. Record tool versions and build output paths in `.reference/manifest.json`.
  Done when: running it twice does the work once; the manifest exists.
- [ ] **3.3 Host pages.** Our own `index.html` for each editor, kept in `tools/refs/hosts/`: sets the API to the mock (iD: `context.connection().switch`, or the build-time env if `switch` turns out to send unwanted requests; Rapid: `context.preauth`), local assets, no background imagery, no OAuth credentials, exposes `window.context` or `window.rapidContext`. `refs-serve` serves them on the ports from 0.5.
  Done when: with the network guard on, each editor shows the `small` scene and `blocked-requests.json` lists what the editor tried to reach. Turn off or stub what can be turned off (Nominatim, imagery index, user details) and list the rest in the research notes.
- [ ] **3.4 Driver interface.** `tools/bench/drivers/types.ts`: `open(scene)`, `waitUntilSettled()`, `setCamera()`, `moveCamera(path, duration)`, `hover(id)`, `select(id)`, `stats()`, `screenshot()`. Define "settled" per editor in a comment and in the glossary.
- [ ] **3.5 iD driver. (parallel with 3.6, 3.7)** Uses `context.map()`, the `drawn` event, `modeSelect`, and real pointer moves on `.target` elements for hover. `stats()` includes the DOM element counts and `context.features().stats()` with hidden and auto-hidden counts. Verify the open claims in `docs/research/id.md` (throttle trailing call, static serving, CORS).
  Done when: a smoke test opens `small`, pans, hovers and selects a known way, and the stats match the fixture.
- [ ] **3.6 Rapid driver. (parallel)** Uses `rapidContext`, the `draw` and `merge` events, scheduler metrics and the `app-N` and `draw-N` measures. Check whether the CSP blocks injected scripts; use `bypassCSP` if it does.
  Done when: the same smoke test passes for Rapid.
- [ ] **3.7 Maid driver. (parallel)** Thin wrapper over `window.__maid`.
  Done when: the same smoke test passes for Maid.

## Milestone 4: Benchmark and report

Goal: first numbers for all three editors on plain geometry.

- [ ] **4.1 Probes.** Page-side collectors injected by the harness: frame intervals via `requestAnimationFrame`, long tasks, marks for scenario phases; harness-side: CDP `Performance.getMetrics`, optional trace. Test the uncap flags and record in `docs/research/maplibre.md` what works on the pinned Chromium.
  Done when: a unit-tested summary function turns raw samples into median, p95, p99 and over-budget shares.
- [ ] **4.2 Scenarios.** Implement the scenario table from PLAN.md against the driver interface. Camera paths and hover tracks are data files per scene, so every editor follows the same path.
  Done when: `bun run bench --scene small --editor maid --scenario pan-warm` writes a result.
- [ ] **4.3 Runner.** `bun run bench` with `--scene`, `--editor`, `--scenario`, `--repeat` (default 5), `--gpu real|software`. Starts and stops the mock API and servers itself. Writes `reports/<run-id>/results.json` (schema validated with Zod), screenshots, `environment.json` (machine, OS, GPU from `chrome://gpu`, Chromium version, editor commits, fixture hashes) and `blocked-requests.json`.
  Done when: a full run on `small` finishes unattended and exits 0; a run with a deliberately failing editor exits non-zero and still writes partial results.
- [ ] **4.4 Report.** `bun run bench-report`: Markdown and a self-contained HTML page per run with tables per scenario, charts, the fairness notes, drawn-feature counts per editor, and a screenshot contact sheet. Optional comparison of two runs.
  Done when: the report for the run from 4.3 is generated and linked from the step result.
- [ ] **4.5 First full run.** Real GPU, all scenes, all scenarios, plain geometry in Maid. Write a short interpretation in `docs/iteration-1/results-01.md`: where Maid stands before any styling, and what looks suspicious in the measurements.
  Done when: the results file is committed with the run id.
- [ ] **4.6 CI smoke.** Enable `bench-smoke` in CI with software rendering: one scenario per editor on `small`. Fails on errors and blocked OSM requests, not on timings.

## Milestone 5: Core style, hover and select

Goal: Maid looks like iD for the core subset. Each step ends with a screenshot next to iD's in the report.

- [ ] **5.1 Tag classifier.** `packages/style`: port the parts of iD's `modules/svg/tag_classes.ts` that the core subset needs into a pure function `classify(tags, geometry)`. Tests use tag combinations taken from the fixtures.
- [ ] **5.2 Style as data.** A typed style definition (colours, widths per zoom band, dashes per class) taken from iD's `css/20_map.css`, `25_areas.css`, `30_highways.css`, `45_waterways.css` and `50_misc.css`. Look at Rapid's `data/rapid_style.json5` for the shape. A function turns it into MapLibre layer specs.
- [ ] **5.3 Roads and paths. (parallel with 5.4, 5.5 after 5.2)** Casing and stroke, zoom bands, dashed paths and tracks, bridges and tunnels, `layer` ordering. Record how far `line-sort-key` gets and what differs from iD.
- [ ] **5.4 Areas. (parallel)** Stroke and fill for buildings, landuse, natural and water. Prototype partial fill: offset wide line versus inward buffer in the feature builder. Pick one in an ADR, or record the gap.
- [ ] **5.5 Points and vertices. (parallel)** Pin with preset icon from a sprite built from the icon sets iD uses (start with the icons that occur in the fixtures), vertex circles with iD's zoom bands and the "important vertices only" rule.
- [ ] **5.6 Labels and oneway arrows.** Symbol layers with iD's label priorities as sort keys; arrows along oneway lines.
- [ ] **5.7 Hover and select.** Halo layers driven by feature state; picking with a tolerance box and iD's priority; selected ways show all their vertices. Implement `hover(id)` and `select(id)` in the debug handle.
- [ ] **5.8 Look review.** A checklist in `docs/iteration-1/look-review.md` with one row per item of the core subset: screenshots of iD, Rapid and Maid for the same view, a verdict (comparable, gap with plan, blocker) and notes. **(person)** Tobias reviews the verdicts.
- [ ] **5.9 Second full run.** Benchmark with the full core style. Compare with the run from 4.5 in `results-02.md`: what did styling cost?

## Milestone 6: Compare page

Goal: see the three editors react to the same camera with your own eyes.

- [ ] **6.1 Page.** `apps/compare`: three iframes (Maid, iD, Rapid) on the fixed ports, a scene selector, one camera synced through `postMessage` adapters in the host pages, a toggle for who leads.
- [ ] **6.2 Live readout.** Per editor: frame time graph, last settle time, features drawn. Uses the probes from 4.1.
- [ ] **6.3 Replay.** A button to play a benchmark scenario in all three at once.
  Done when (milestone): a Playwright test opens the page, selects `medium`, moves the camera in the leader, and all three report the same centre and zoom.

## Milestone 7: Renderer experiments

Goal: know the cost of data changes in MapLibre and the best way to feed it. Each experiment is a variant of the renderer behind a URL flag, measured with the same harness.

- [ ] **7.1 Data-change scenario.** Move one node of a long way at 60 Hz for two seconds through the debug handle (in iD and Rapid through their graph APIs if feasible; otherwise Maid only and say so). Measure time to paint and frame times.
- [ ] **7.2 Baseline: `setData`.**
- [ ] **7.3 `updateData` diffs. (parallel after 7.1)**
- [ ] **7.4 Split sources. (parallel)** An "edited" source for the features being changed, the rest untouched.
- [ ] **7.5 deck.gl overlay. (parallel)** Only for the geometry types where 7.2 to 7.4 fail the 50 ms target.
- [ ] **7.6 Decision.** ADR with the numbers and the approach Maid takes into iteration 2.

## Milestone 8: Answer

- [ ] **8.1 Final run** on Tobias's Mac with all scenes, pinned editors and the chosen renderer variant.
- [ ] **8.2 Report.** `docs/iteration-1/report.md`: the question, the answer for look, speed and data changes against the thresholds in PLAN.md, the gaps, and what we did not measure.
- [ ] **8.3 Iteration 2 proposal.** What comes next (editing, presets, package boundaries for forks), based on what we learned. **(person)** Tobias decides.
