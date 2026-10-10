# Working in this repo

This file is for coding agents and for people. Read it before you change anything. `CLAUDE.md` imports it.

Maid is developed agent-first: every task must be doable, checkable and reportable from the command line without a person clicking through a browser. If a step needs manual work, that is a gap in the tooling. Fix the tooling or write the gap down in [docs/iteration-1/steps.md](docs/iteration-1/steps.md).

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

- iD: `../iD` (fork) and `../iD-OSMORG-REPO` (clean upstream). Upstream: https://github.com/openstreetmap/iD
- Rapid: `../Rapid-Bryan`, which is https://github.com/bhousel/Rapid (Rapid 3). **Never** use `facebook/Rapid` or the `../Rapid` checkout as a reference.
- The reference checkouts are read-only for this project. Benchmarks run against pinned commits cloned into `.reference/` (git-ignored), not against the sibling checkouts.

## Stack

Follow the FMC `tech-stack` skill. In short: Bun workspaces, Vite, React 19 with the React Compiler, TypeScript 7, `react-map-gl/maplibre` (see the `react-map-gl` skill: declarative `<Source>`/`<Layer>`, `<Map>` event props, no `map.addLayer` in app code), Zustand for client state, Zod for validation, Tailwind, oxlint and oxfmt, Vitest, Playwright.

Performance experiments may need imperative MapLibre calls that the `react-map-gl` skill forbids for app code (for example `GeoJSONSource.updateData`). Keep those inside the renderer package behind a small API and say why in a comment.

## Workflow

1. Pick the next open step in [docs/iteration-1/steps.md](docs/iteration-1/steps.md). One step is one commit.
2. Do the work. Stay inside the step. Write down new findings in `docs/research/` and decisions in `docs/adr/`.
3. Run `bun run check` and fix what it reports. For changes to apps or the benchmark also run the script named in the step.
4. Tick the step, add a one-line result under it, and commit (see the `finish-work` skill for the message format: `<Topic>: <outcome>` plus outcome bullets).
5. Do not push unless asked.

Use a small, fast model (Haiku) for code and web research subagents. Give them a narrow question and ask for file and line references. Treat their reports as leads: verify a claim before a decision depends on it, and mark unverified claims as such in `docs/research/`.

## Scripts

These names are the contract. Agents and docs only reference these.

| Script | What it does |
| --- | --- |
| `bun run check` | Type-check and unit tests. Run before every commit. (Lint and format are not set up yet.) |
| `bun run dev` | Maid dev server (5173) and the mock OSM API (8090). |
| `bun run refs-setup` | Clone and build iD and Rapid at their pinned commits into `.reference/`, copy icon sprites into Maid. |
| `bun run refs-serve` | Serve the built reference editors: iD on 8081, Rapid on 8082. |
| `bun run bench` | Run all scenarios against all editors and write `reports/<run-id>/`. Starts the servers it needs. Options: `--editor`, `--scene`, `--repeat`, `--label`, `--variant`, `--maid-query`, `--id-query`. |
| `bun run bench-smoke` | One run per editor on the small scene. |
| `bun run bench-report [run-id ...]` | Render one or more runs as `report.md` and `report.html`. |
| `bun run bench-edit [scene] [query]` | Maid only: drag a node and measure change-to-screen time. Needs a Maid preview on 5175 (`bun run compare` starts one). |
| `bun run compare` | Everything for the side-by-side page on http://localhost:5174. |
| `bun run fixtures-build <file.osm.pbf>` | Cut fixtures from a local extract. Manual only, see core rule 1. |
| `bun run style-generate [iD checkout]` | Regenerate the style data from iD's CSS and presets. |

Every editor is driven through one contract, `window.__bench` (`tools/refs/bench-api.d.ts`). Maid also exposes `window.__maid` with the map and the engine. To look at one editor: `bun tools/bench/shot.ts maid|id|rapid <scene> [zoom]`.

## Layout

```
apps/maid            the proof-of-concept editor
apps/compare         page that shows Maid, iD and Rapid side by side
packages/style       iD's look as data: tag classes, CSS rules, preset icons
packages/renderer    data store, feature builder, MapLibre layers, engine
tools/mock-osm-api   local stand-in for the OSM API, serves fixtures
tools/refs           pinned iD and Rapid: setup, host pages, bench adapters, notes
tools/bench          Playwright benchmark, report generator
fixtures/            frozen OSM data (ODbL, © OpenStreetMap contributors)
reports/             benchmark output
docs/                plan, working steps, research, decisions
.reference/          pinned builds of iD and Rapid (git-ignored)
```
