# Working in this repo

For coding agents and people; `CLAUDE.md` imports it. Read it before you change anything.

Maid is developed agent-first: every task must be doable, checkable and reportable from the command line. A step that needs a person clicking is a gap in the tooling: fix the tooling or note the gap in [docs/build-out/steps.md](docs/build-out/steps.md).

## Core rules

Not up for trade-offs. If a task seems to need an exception, stop and ask.

### 1. Clear states: automation uses only the fixtures

OSM infrastructure is everything the OSMF and the community run for mappers: the API and the development API, tiles, Nominatim, Overpass, taginfo, the wiki.

- **Automated runs** (tests, benchmarks, CI, agent sessions) send **zero** requests to OSM infrastructure, never sign in and never upload. Maid, iD and Rapid read the frozen fixtures of the local mock API (`tools/mock-osm-api`), which rejects writes. The benchmark browser blocks every non-localhost request; under automation (`isAutomated()`) Maid always uses the mock.
- **Fixtures** are cut once by a person from a bulk extract (`bun run fixtures-build`), not from the editing API, and committed. Regenerating one is a reviewed change.
- **A person** tests against the development server (staging) and OpenStreetMap (production), never an agent. Maid is built to be released for both: `?api=mock|osm|dev` picks the data (the mock is the default in development; a deployed build starts on the editor's first server), and the person logs in to and saves on that server. `osm.servers` in the app's `maid.config.ts` says which servers an editor offers, as iD's `ID_API_CONNECTION`. Decided by Tobias on 2026-10-14.
- **Environment variables** hold only what each fork sets for itself: the client ids (`VITE_OSM_CLIENT_ID`, `VITE_OSM_DEV_CLIENT_ID` in `apps/<app>/.env.local`; repository variables `OSM_CLIENT_ID`, `OSM_DEV_CLIENT_ID`) and the Pages app and path (`deploy.env`). Client ids are public. Maid is a public PKCE client: no client secret, ever. Never copy ids or secrets from the reference editors.

### 2. Automation first

- Every workflow has a `bun run <script>` at the repo root; agents and docs reference only those names.
- Results an agent needs go to a file in a stable format (JSON first, a rendered report second).
- Dev builds and builds with `VITE_BENCH=1` (`bun run bench`, `bun run compare`) expose `window.__bench` and `window.__maid`; a deployed build has none.
- Commands are non-interactive, exit non-zero on failure and print where they wrote their output.

### 3. References

- iD: https://github.com/openstreetmap/iD. Rapid 3: https://github.com/bhousel/Rapid (**never** `facebook/Rapid`). When in doubt, follow iD.
- Read their code in `.reference/id` and `.reference/rapid`: pinned commits from `bun run refs-setup` (git-ignored). This file names no other location on purpose.
- **Other repositories are read-only**, wherever they are, `.reference/` included: never edit, commit, push, open or comment on issues and pull requests, or change settings there. Changes we want upstream are drafted here (`docs/upstream/`) and handed to a person.

## Stack

The FMC `tech-stack` skill: Bun workspaces, Vite, React 19 with the React Compiler, TypeScript 7, `react-map-gl/maplibre` (the `react-map-gl` skill: declarative `<Source>`/`<Layer>`, no `map.addLayer` in app code), Zustand, Zod, TanStack Query, Tailwind, oxlint and oxfmt, Vitest, Playwright. Imperative MapLibre calls needed for performance (for example `GeoJSONSource.updateData`) stay inside the renderer package behind a small API, with a comment saying why.

## Workflow

1. Pick the next open step in [docs/build-out/steps.md](docs/build-out/steps.md): about an hour, ending with one thing for Tobias to test.
2. Stay inside the step. Findings go to `docs/research/`, decisions to `docs/adr/`.
3. Run `bun run check` and fix what it reports; for apps or the benchmark also the script the step names.
4. Tick the step with its result and the test for Tobias, and commit (`finish-work` skill: `<Topic>: <outcome>` plus outcome bullets).
5. Do not push unless asked.

## Working with subagents

- **Do the mechanical part yourself, with a script** (`cp`, `sed`), then hand out what remains. Tell agents what to copy and what to cut: "start with `cp`, then delete and edit, do not retype".
- **Measure before you brief**: give the agent the failure list and the command that proves "done".
- **One folder per agent**, nothing outside it: no `package.json`, index files, `bun install` or commits. The orchestrator wires and commits.
- **Models** (Tobias, 2026-10-11): Haiku by default, with the effort set in every brief: low or medium for lookups and measurements, high where it must choose or design. **High is the ceiling, never max or xhigh**; split the task instead. Sonnet only at medium and only when Haiku at high was not enough. Opus never at low; it orchestrates, reviews and decides across packages.
- **Keep each agent under about 100k tokens**: one file or package, read in ranges (`grep -n`, `sed -n`).
- **Reports in a fixed shape**: what changed, what was cut and why, final numbers, what is unsure, measured apart from inferred. Treat them as leads: re-run the done-when commands, count tests against the source, grep for skipped tests, and mark unchecked claims in the docs.
- **Parallel agents never run `bun run check`**: its lint fixes rewrite other agents' half-written files. They use read-only commands on their folder (`bun run type-check`, `bunx oxlint --deny-warnings -c oxlint.config.mjs <folder>`, `bun test <folder>`), and the orchestrator runs `bun run check` when nobody edits.
- **Parallel agents never run browser checks**: the dev server reloads on every save and kills them. A check counts only with exit code 0 and the expected number of `ok` lines.

## Scripts

These names are the contract.

| Script | What it does |
| --- | --- |
| `bun run check` | Compiles the texts, then type-check, lint and format with fixes, the missing-texts check, unit tests. Before every commit. |
| `bun run check-ci` | The same, read-only. |
| `bun run i18n-compile` | Paraglide output for the app (`packages/i18n`) and each module with its own `project.inlang` (list in `packages/i18n/scripts/projects.ts`). Runs first in `check`, `type-check`, `dev` and the builds; skips when up to date. |
| `bun run i18n-check` | Keys a language lacks, per project, in `reports/i18n-missing.json`; exits 1 on a missing key or placeholder. |
| `bun run dev` | The three apps (`maid` 5173, `maid-bicycle` 5176, `maid-parking` 5177) and the mock API (8090). `dev-maid`, `dev-bicycle`, `dev-parking`, `dev-api` start one. |
| `bun run refs-setup` | Clone and build iD and Rapid at their pinned commits into `.reference/`, copy their sprites. |
| `bun run refs-serve` | Serve them: iD on 8081, Rapid on 8082 (`refs-serve-id`, `refs-serve-rapid`). |
| `bun run compare` | The side-by-side page of Maid, iD and Rapid on http://localhost:5184. |
| `bun run bench` | All scenarios against all editors into `reports/<run-id>/`; starts its servers. Options: `--editor`, `--scene`, `--repeat`, `--label`, `--variant`, `--maid-query`, `--id-query`, `--app`, `--maid-lens <id>`, `--edit-reps`. |
| `bun run bench-smoke` | One run per editor on the small scene. |
| `bun run bench-report [run-id ...]` | Render runs as `report.md` and `report.html`. |
| `bun run bench-budget [run-id ...]` | Maid against iD and Rapid in the same run (FAIL) and against `tools/bench/budget.json` (WARN); `--update` rewrites the budget. |
| `bun run bench-edit [scene] [query]` | Maid only: change-to-screen time of a node drag. Needs a `VITE_BENCH=1` preview on 5175. |
| `bun run bench-rmgl [--reps 5] [--only ...] [--quick]` | react-map-gl against raw MapLibre with Maid's layers on 5186, into `reports/rmgl-bench*.json` ([docs](docs/research/react-map-gl-performance.md)). |
| `bun run bench-model [--runs 5] [--browser chromium]` | Loading each fixture into the model, into `reports/model-load-<browser>.json`. |
| `bun run bench-validation` | Every validation rule on the dense fixture, into `reports/validation-bench.json`. |
| `bun run check-all [--app maid\|bicycle\|parking]` | The browser checks below, one after another, against one app; fails on a non-zero exit or too few `ok` lines (table in `tools/checks/check-all.ts`). Writes `reports/check-all-<app>.json`. |
| `bun run check-config` | Each app's `maid.config.ts` without a browser: modules set up with no network request, extension points, cleanup, presets, unique ports and ids. Writes `reports/config-check.json`. |
| `bun run check-render <name>` | Screenshots and feature counts of all scenes against a reference saved with `check-render-save <name>`. |
| `bun run fixtures-build <file.osm.pbf>` | Cut fixtures from a local extract. A person only (core rule 1). |
| `bun run style-generate [iD checkout]` | Regenerate the style data from iD's CSS and presets. |

The browser checks need `bun run dev` and take `[scene]` and `--app maid|bicycle|parking` (read in `tools/bench/args.ts`):

| Check | What it does, with real input, comparing data and map after each step |
| --- | --- |
| `check-interactions` | iD's behaviour: Shift-click, dragging nodes and points, double click, drawing keys, move, rotate, copy and paste |
| `check-edit` | Add, change and delete a point, delete a way, undo and redo |
| `check-draw` | Draw a line, continue it, snap to a node and a way, draw an area, cancel |
| `check-undo` | Move a vertex, change a tag, undo and redo |
| `check-ops` | Square a building, split a road, merge the parts, undo |
| `check-relations` | Add a way to a relation, change its role, remove it, undo; a multipolygon follows its moved node |
| `check-validation` | A footway that crosses a road and connects to nothing: both reported, fix, undo |
| `check-journal` | Edit, reload, restore from the browser's storage, undo all, reload, discard |
| `check-filters` | Hide buildings, make them read-only, reset, a filter in the URL |
| `check-tags` | The tags sheet on a bare page: typing, moving, renaming, pasting and copying `key=value` lines, shortcuts stay out of a cell |
| `check-multi` | Two buildings selected: "Multiple values", one undo step for both, a new tag for both, refusal when read-only |
| `check-parking` | `--app parking` only: quick buttons on one and two roads, restriction field, a parking rule, "Copy parking to the other side", the parking lens |

Every editor is driven through `window.__bench` (`tools/refs/bench-api.d.ts`); Maid also has `window.__maid` (map, engine, editor, model). One editor's screenshot: `bun tools/bench/shot.ts maid|id|rapid <scene> [zoom]`.

## Layout

```
apps/maid, maid-bicycle, maid-parking   the editors: maid.config.ts (an AppConfig: modules, presets, filters, servers), main.tsx, env files
apps/compare         Maid, iD and Rapid side by side
packages/shell       the editor's shell: App, URL, save, auth, built-in modules, bench handle, styles, public assets
packages/ui          the shell's components and the inspector's fields
packages/core        createEditor: data, modules, extension points, hooks
packages/model       the data model, ported from Rapid 3
packages/renderer    feature builder, MapLibre layers, engine
packages/presets, validation, operations, filters, journal   headless: presets on id-tagging-schema, rules and fixes, edit operations, editable/read-only/hidden, unsaved edits in IndexedDB
packages/style       iD's look as data
packages/i18n        Paraglide texts in en, de, fr, es
packages/module-*    modules an app switches on: imagery, street-imagery, data-layers, notes, lenses, parking, turn-restrictions, surface, traffic-signs
tools/mock-osm-api   local stand-in for the OSM API, serves the fixtures
tools/refs, tools/bench, tools/checks   pinned iD and Rapid, the benchmark, the browser checks
fixtures/            frozen OSM data (ODbL, © OpenStreetMap contributors)
docs/                plan, steps, research, decisions, upstream drafts
reports/             output of benchmarks and checks (mostly git-ignored)
```
