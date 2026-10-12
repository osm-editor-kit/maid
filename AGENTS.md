# Working in this repo

This file is for coding agents and for people. Read it before you change anything. `CLAUDE.md` imports it.

Maid is developed agent-first: every task must be doable, checkable and reportable from the command line without a person clicking through a browser. If a step needs manual work, that is a gap in the tooling. Fix the tooling or write the gap down in [docs/build-out/steps.md](docs/build-out/steps.md).

## Core rules

These rules are not up for trade-offs. If a task seems to need an exception, stop and ask.

### 1. Keep traffic on OSM infrastructure to an absolute minimum

OSM infrastructure means everything the OSMF and the community run for mappers: `api.openstreetmap.org`, `api06.dev.openstreetmap.org`, `tile.openstreetmap.org`, Nominatim, Overpass instances, taginfo, the OSM wiki.

- Automated runs (tests, benchmarks, CI, agent sessions) send **zero** requests to OSM infrastructure. The benchmark browser blocks every non-localhost request and a run fails when an editor tries to reach an OSM host.
- All three editors (Maid, iD, Rapid) read OSM data from the local mock API in `tools/mock-osm-api`, which serves frozen fixtures.
- Fixtures are created once, by a person running a script on purpose, from a bulk extract (not from the editing API), and are committed. Regenerating a fixture is a deliberate, reviewed change.
- Live OSM data is a manual, opt-in mode of the Maid app for a person exploring. It is off by default, never used in automation, cached, and only loads at editing zoom levels.
- Never sign in to OSM from an automated run. Never upload. The mock API rejects writes.
- Do not copy OAuth client ids or secrets from the reference editors into this repo.

### 2. Automation first

- Every workflow has a `bun run <script>` entry point at the repo root. Agents and docs only reference those script names.
- Every result an agent needs is written to a file in a stable, machine-readable format (JSON first, a rendered report second).
- Apps expose a debug handle on `window` in dev and test builds so agents and Playwright can inspect state without scraping the DOM.
- Commands must be non-interactive, exit non-zero on failure, and print where they wrote their output.

### 3. References

- iD: https://github.com/openstreetmap/iD
- Rapid: https://github.com/bhousel/Rapid (Rapid 3). **Never** use `facebook/Rapid` as a reference.
- Read their code from `.reference/id` and `.reference/rapid`: pinned commits that `bun run refs-setup` clones from GitHub (git-ignored). Benchmarks and ports use these, so everyone works from the same commit. This file names no other location on purpose.
- **Other repositories are read-only, wherever they are.** That covers `.reference/`, any other checkout of iD, Rapid or another project on the machine, and every repository on GitHub that is not this one. Never edit, commit, push, open or comment on issues and pull requests, or change settings there, even where the account has the rights to. A change we want upstream is prepared here as a draft and handed to a person.

## Stack

Follow the FMC `tech-stack` skill. In short: Bun workspaces, Vite, React 19 with the React Compiler, TypeScript 7, `react-map-gl/maplibre` (see the `react-map-gl` skill: declarative `<Source>`/`<Layer>`, `<Map>` event props, no `map.addLayer` in app code), Zustand for client state, Zod for validation, Tailwind, oxlint and oxfmt, Vitest, Playwright.

Performance experiments may need imperative MapLibre calls that the `react-map-gl` skill forbids for app code (for example `GeoJSONSource.updateData`). Keep those inside the renderer package behind a small API and say why in a comment.

## Workflow

1. Pick the next open step in [docs/build-out/steps.md](docs/build-out/steps.md). One step is about an hour and ends with one thing for Tobias to test. (Iteration 1, the proof of concept, is closed: [docs/iteration-1/steps.md](docs/iteration-1/steps.md).)
2. Do the work. Stay inside the step. Write down new findings in `docs/research/` and decisions in `docs/adr/`.
3. Run `bun run check` and fix what it reports. For changes to apps or the benchmark also run the script named in the step.
4. Tick the step, add the result and the test for Tobias under it, and commit (see the `finish-work` skill for the message format: `<Topic>: <outcome>` plus outcome bullets).
5. Do not push unless asked.

## Working with subagents

Learned on 2026-10-11 while porting Rapid's data model.

- **Do the mechanical part yourself, with a script.** Copying files and rewriting imports with `cp` and `sed` costs almost nothing and showed in minutes what was really left to do. Hand out what remains.
- **Measure before you brief.** Run the type-check and the tests first and give the agent the failure list and the done-when command. A brief without a command that proves "done" is not ready.
- **One folder per agent**, named in the brief, and nothing outside it: no `package.json`, no index files, no `bun install`, no commits. The orchestrator wires things together and commits.
- **Say what to copy and what to cut.** "Start with `cp`, then delete and edit, do not retype" keeps ported code identical to its source and keeps the agent's context small.
- **Haiku is the default for subagents; raise its effort before you switch models.** Set the effort in every brief, do not leave it to the default. Low or medium for lookups and measurements, high where the agent has to choose what to keep or design an API. **High is the ceiling: never use max or xhigh.** If high is not enough, split the task. Decided by Tobias on 2026-10-11 from a cost-against-score chart (CursorBench 4.0): Haiku at max effort scores like Sonnet at the same cost, and Haiku is ahead of Sonnet and Opus at every cost below that.
- **Sonnet only at medium effort**, and only when Haiku at high was not enough. **Opus never at low effort** (Haiku is cheaper there and scores higher). Opus is for orchestration, review and decisions that span packages.
- **Keep each agent under about 100k tokens of context**: one file or one package per agent, read with `grep -n` and `sed -n` in ranges. Haiku costs more per request above that size. `CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000` enforces it, but it is set per session and would also apply to the orchestrator.
- **Ask for a short report in a fixed shape**: what changed, what was cut and why, final numbers, what is unsure. Ask the agent to separate what it measured from what it inferred.
- **Treat reports as leads.** Re-run the done-when commands yourself, count tests and assertions against the source, and grep for skipped tests before accepting. Mark claims you did not check as unchecked in the docs.
- Agents that depend on each other's API can still run in parallel if the brief fixes the names both sides use.

## Scripts

These names are the contract. Agents and docs only reference these.

| Script | What it does |
| --- | --- |
| `bun run check` | Type-check, lint and format with fixes (oxlint, oxfmt), unit tests. Run before every commit. |
| `bun run check-ci` | The same, read-only. |
| `bun run dev` | Maid dev server (5173) and the mock OSM API (8090). |
| `bun run refs-setup` | Clone and build iD and Rapid at their pinned commits into `.reference/`, copy icon sprites into Maid. |
| `bun run refs-serve` | Serve the built reference editors: iD on 8081, Rapid on 8082. |
| `bun run bench` | Run all scenarios against all editors and write `reports/<run-id>/`. Starts the servers it needs. Options: `--editor`, `--scene`, `--repeat`, `--label`, `--variant`, `--maid-query`, `--id-query`. |
| `bun run bench-smoke` | One run per editor on the small scene. |
| `bun run bench-report [run-id ...]` | Render one or more runs as `report.md` and `report.html`. |
| `bun run bench-edit [scene] [query]` | Maid only: drag a node and measure change-to-screen time. Needs a Maid preview on 5175 (`bun run compare` starts one). |
| `bun run bench-model [--runs 5] [--browser chromium]` | Time loading each fixture into `maid-model` (JSON to entities, entities into the history), in the browser. Writes `reports/model-load-<browser>.json`. |
| `bun run check-undo [scene]` | Browser check: move a vertex, change a tag, undo and redo, and compare data and map after each step. Needs `bun run dev`. |
| `bun run check-draw` | Browser check with real keys and clicks: draw a line, continue it, snap to a node and a way, draw an area, cancel. Needs `bun run dev`. |
| `bun run check-edit [scene]` | Browser check: add a point, change it, delete it, delete a way, undo and redo, and compare data, lookups and map after each step. Needs `bun run dev`. |
| `bun run check-ops [scene]` | Browser check: square a building, split a road, merge the parts, undo; data and map after each step. Needs `bun run dev`. |
| `bun run check-render <name>` | Compare screenshots and feature counts of all scenes with a reference. Needs `bun run dev`. |
| `bun run check-render-save <name>` | Save that reference from the current state, before a change to the renderer. |
| `bun run compare` | Everything for the side-by-side page on http://localhost:5184. |
| `bun run fixtures-build <file.osm.pbf>` | Cut fixtures from a local extract. Manual only, see core rule 1. |
| `bun run style-generate [iD checkout]` | Regenerate the style data from iD's CSS and presets. |

Every editor is driven through one contract, `window.__bench` (`tools/refs/bench-api.d.ts`). Maid also exposes `window.__maid` with the map, the engine and the editor. To look at one editor: `bun tools/bench/shot.ts maid|id|rapid <scene> [zoom]`.

## Layout

```
apps/maid            the default editor: maid.config.ts (modules), shell, components, modules
apps/compare         page that shows Maid, iD and Rapid side by side
packages/style       iD's look as data: tag classes, CSS rules
packages/core        createEditor: the editor's data (context, history), Maid modules, extension points, hooks
packages/model       the data model, ported from Rapid 3: entities, graph, actions, history (see its README)
packages/operations  the edit menu's operations (reverse, split, merge, ...) on the model, headless
packages/presets     preset matching and fields on id-tagging-schema, headless
packages/ui          the shell and the inspector's fields: layout, top bar, sidebar, map controls, dock, theme; declares inspector.section
packages/renderer    feature builder, MapLibre layers, engine, module layers; draws from the model
tools/mock-osm-api   local stand-in for the OSM API, serves fixtures
tools/refs           pinned iD and Rapid: setup, host pages, bench adapters, notes
tools/bench          Playwright benchmark, report generator
fixtures/            frozen OSM data (ODbL, © OpenStreetMap contributors)
reports/             benchmark output
docs/                plan, working steps, research, decisions
.reference/          pinned builds of iD and Rapid (git-ignored)
```
