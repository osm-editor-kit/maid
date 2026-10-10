# Maid – Plan

Status: plan for iteration 1, 2026-10-10. Working steps: [docs/iteration-1/steps.md](docs/iteration-1/steps.md).

## Vision

Maid (Maplibre iD Editor) is a fork and rework of iD. It keeps iD's ecosystem and replaces the stack:

- **Rendering** on MapLibre GL through `react-map-gl`, instead of SVG and D3.
- **UI** in React and TypeScript.
- **A monorepo of packages** instead of one code base. A fork that wants a different style, other presets, an extra panel or another data source replaces or adds a package. It does not patch the core.
- **Shared building blocks** published in the `@osm-editor-kit` npm organisation, used here and improved here as Maid grows.

## Core rules

Short form. The binding text is in [AGENTS.md](AGENTS.md).

1. **Minimal traffic on OSM infrastructure.** Automated runs send none. All editors read frozen fixtures from a local mock API.
2. **Automation first, agent-driven.** Every workflow is a script with machine-readable output. Agents do the work and check it.
3. **References:** iD (`../iD`, upstream `openstreetmap/iD`) and Rapid 3 (`../Rapid-Bryan`, `bhousel/Rapid`). Not `facebook/Rapid`.

## Iteration 1: proof of concept for rendering and speed

### The question

Can we switch the rendering to MapLibre? Concretely:

1. **Look:** can MapLibre show OSM data in a way that is comparable to iD?
2. **Speed:** is it at least as fast as iD, and how does it compare to Rapid's PixiJS renderer?
3. **Editing:** is editing comparable? We expect no problems here and only test the part that is specific to the renderer: the cost of redrawing when data changes.

To answer this we build a test environment in which Maid, iD and Rapid run on the same data and are compared on the same scenarios.

### Decisions for this iteration

Agreed on 2026-10-10:

| Topic | Decision |
| --- | --- |
| Scope of the Maid PoC | Render OSM data, plus hover and select highlighting. No editing UI. |
| Test data | Frozen fixtures for all benchmarks. Live OSM data only as a manual mode in Maid. |
| Comparison | An automated Playwright benchmark with a report, and a page that shows the three editors side by side. |
| Look | A core subset of iD's style: roads with casing and stroke, paths, buildings, landuse and water, points with icons, vertices, labels. |

### Out of scope

Editing tools, undo and redo, presets and the tag editor, validation, upload and OAuth, background imagery, relations beyond multipolygons, notes and QA layers, touch input, translations, accessibility. They matter for Maid. They do not help answer the question.

### What we deliver

1. `apps/maid`: a MapLibre view of OSM data in iD's core style, with hover and select.
2. `tools/mock-osm-api` and `fixtures/`: the same frozen data for all three editors, offline.
3. `tools/bench`: scripted scenarios, one driver per editor, results as JSON and a report.
4. `apps/compare`: Maid, iD and Rapid next to each other with a synced camera.
5. A written answer to the question, with numbers and pictures, and a recommendation for iteration 2.

### How we decide

Proposed thresholds, not yet confirmed (see open questions).

- **Look:** every item of the core subset is either comparable to iD or has a documented gap with a way forward. One gap we cannot close (for example partial fill) is acceptable if an alternative is agreed. A gap in roads, vertices or picking is not.
- **Speed, against iD:** Maid is better on every scenario in the medium and dense scenes: load time, settle time after a camera move, and hover latency.
- **Speed, against Rapid:** Maid's p95 frame time while panning and zooming is within 1.25 times Rapid's on the dense scene, and settle time is not worse.
- **Data changes:** with the dense scene loaded, changing one node is on screen within 50 ms.

If Maid fails on speed with the simplest approach, milestone 7 tests the alternatives before we conclude.

## Architecture of the proof of concept

```
fixtures (OSM JSON) ──► mock OSM API ──► iD     ─┐
                                    ├──► Rapid  ─┼──► bench drivers ──► results.json ──► report
                                    └──► Maid   ─┘
```

### Maid

```
OSM API JSON ─► data store ─► feature builder ─► GeoJSON sources ─► style layers ─► MapLibre
                   │                 ▲                                    ▲
                   └─ spatial index  └─ tag classifier (style package)    └─ feature state: hover, selected
```

- **Data store:** nodes, ways, relations, with lookups and a spatial index. First candidate is `@osm-editor-kit/osm-data`.
- **Tag classifier:** turns tags into a small set of style properties (`kind: road`, `class: residential`, `paved: false`, `layer: 1`, ...). This is iD's `tag_classes` as a function. Classification happens once per feature in JavaScript, so the MapLibre style stays simple and fast.
- **Feature builder:** makes GeoJSON for areas, lines, points and vertices, each feature with a stable id.
- **Style layers:** React components that render `<Source>` and `<Layer>` for the core subset. Style is data. A fork passes a different style or adds layers.
- **Hover and select:** `interactiveLayerIds` and `setFeatureState`, with iD's picking priority (vertex, then point, then line, then area).

### Packages

Working names. Each is small and has one job.

| Path | Job | Depends on |
| --- | --- | --- |
| `packages/style` | Tag classifier and the core style as data | nothing |
| `packages/renderer` | Feature builder and React layers for MapLibre | `style`, `react-map-gl` |
| `apps/maid` | The PoC app: map, data loading, debug handle | `renderer`, `osm-data` |
| `apps/compare` | Side-by-side page | none of the above |
| `tools/mock-osm-api` | Local API for fixtures | nothing |
| `tools/bench` | Scenarios, drivers, metrics, report | Playwright |

### The test environment

**Fixtures.** Four scenes, all in Berlin, cut once from a Geofabrik extract with osmium and committed as OSM JSON (ODbL):

| Scene | Content | Rough size |
| --- | --- | --- |
| `small` | Residential streets | 5k nodes |
| `medium` | Inner-city blocks with many buildings and POIs | 30k nodes |
| `dense` | An area with detailed street-space mapping (kerbs, parking, street furniture) | 100k+ nodes |
| `synthetic-N` | Generated grid city, scalable from 10k to 500k nodes | no source data |

**Mock OSM API.** Answers `capabilities` and `map?bbox=` (JSON) from a fixture, plus the single-entity endpoints iD asks for. Rejects writes. Optional fixed latency so that loading over the network is comparable.

**Network guard.** The benchmark browser blocks every request that does not go to localhost and logs it. A request to an OSM host fails the run.

**Reference editors.** `refs-setup` clones iD and Rapid at pinned commits into `.reference/`, builds them, and adds our own host page for each: API host set to the mock, assets local, no background imagery, no OAuth credentials.

**Drivers.** One per editor, same interface: `open(scene)`, `waitUntilSettled()`, `setCamera()`, `moveCamera(path)`, `hover(id)`, `select(id)`, `stats()`. Scenarios are written once against this interface.

**Scenarios.**

| Scenario | Measures |
| --- | --- |
| Load | Time from opening a scene to the first complete picture |
| Pan (warm) | Frame times and settle time on a fixed path, all data loaded |
| Pan (cold) | The same while data loads through the mock API |
| Zoom | z16 to z19 and back: frame times and settle time |
| Hover sweep | Latency from pointer move to highlight over a fixed track |
| Select | Latency to select a long way and a large building |
| Idle | Memory with the scene loaded |
| Low zoom (Maid and Rapid only) | z14: iD does not load data below z16 |
| Data change (Maid only at first) | Time until a moved node is on screen |

All scenarios that compare the three editors run at z16 or higher, in a fixed viewport, without background imagery.

**Fairness notes** that the report must state:

- iD and Rapid show a scaled, stale picture during gestures and redraw afterwards. Frame times alone flatter them. Settle time and an end screenshot go with every camera scenario.
- iD hides features when there are too many. The report records how many features each editor actually drew.
- Real numbers come from a named machine with GPU acceleration. CI numbers (software rendering) only show trends.

**Report.** `reports/<run-id>/results.json` with every measurement and the environment (machine, GPU, browser, editor commits), screenshots per scene and editor, and a rendered report with tables, charts and a contact sheet.

## Milestones

Details and checkboxes are in [docs/iteration-1/steps.md](docs/iteration-1/steps.md).

| # | Milestone | Result |
| --- | --- | --- |
| 0 | Foundation and automation | Monorepo, `check`, CI, agent setup. An agent can pick a step, do it and verify it. |
| 1 | Fixtures and mock API | The same frozen data is available to every editor, offline. |
| 2 | Maid draws OSM data | Plain geometry of a fixture in MapLibre, with a debug handle. |
| 3 | iD and Rapid under automation | Both reference editors build, load fixtures from the mock API and can be driven by script. |
| 4 | Benchmark and report | First numbers for all three editors, before any styling work. |
| 5 | Core style, hover and select | Maid looks like iD for the core subset. The look question gets its answer. |
| 6 | Compare page | Three editors side by side for the eye. |
| 7 | Renderer experiments | Alternatives for data updates measured against each other. |
| 8 | Answer | Final report, recommendation, plan for iteration 2. |

Numbers come early on purpose: milestone 4 runs before the style work. If plain geometry is already too slow, we learn it before investing in the look.

## Risks

| Risk | What we do |
| --- | --- |
| Partial area fill has no direct MapLibre equivalent | Prototype the candidates early in milestone 5; accept full fill with low opacity as fallback and note it as a gap |
| iD interleaves casing and stroke per `layer` value | Start with `line-sort-key`; add layer groups only for the `layer` values present |
| Re-tiling all data on every edit is slow | Measured in milestone 7 with `updateData`, split sources and deck.gl |
| Vertices: 100k circles at high zoom | Draw only important vertices like iD does; measure |
| Preset icons need a sprite | Build a sprite from the icon sets iD uses; start with the top icons |
| `react-map-gl` 8 with MapLibre 6 | Check in milestone 0; fall back to MapLibre 5 if needed |
| Frame cap hides differences | Measure work per frame, not only the interval; test the uncap flags |
| Benchmarks tempt us to hit real servers | Network guard fails the run; see core rule 1 |
| Reference editors change | Pinned commits in `.reference/`, recorded in every report |

## Decided

Answers from Tobias, 2026-10-10:

| Topic | Decision |
| --- | --- |
| iD baseline | The latest upstream release of `openstreetmap/iD`. The fork changes nothing relevant for this iteration. |
| Benchmark machine | Everything runs on Tobias's Mac for now, in Chrome with GPU acceleration. A second, weaker machine can follow later. |
| Fixture areas | `medium`: Mitte around Hackescher Markt. `dense`: a part of Neukölln with detailed parking mapping. |
| License | ISC, like iD and Rapid. |
| Repo setup | A Bun monorepo with packages that are shared and published. |

## Open questions

1. **Thresholds** in "How we decide": are they the right bar? They stay proposals until confirmed, at the latest before milestone 8.
2. **Where is the repo hosted?** Default: `osm-editor-kit/maid` on GitHub. Nothing is pushed yet.

## References

All local paths are relative to this repo. More detail in [docs/research/](docs/research/).

### Rapid 3 (primary Rapid reference)

- https://github.com/bhousel/Rapid, local [`../Rapid-Bryan`](../Rapid-Bryan) (`3.0.0-pre.2`)
- Entry points: [`AGENTS.md`](../Rapid-Bryan/AGENTS.md), [`API.md`](../Rapid-Bryan/API.md), [`FORK-SUMMARY.md`](../Rapid-Bryan/FORK-SUMMARY.md), [`modules/`](../Rapid-Bryan/modules)
- Not a reference: `facebook/Rapid` and [`../Rapid`](../Rapid) (`tordans/Rapid`, a fork of the facebook version)

### iD

- https://github.com/openstreetmap/iD, local [`../iD`](../iD) (fork, `2.43.0-dev`) and [`../iD-OSMORG-REPO`](../iD-OSMORG-REPO) (clean upstream, older)
- Entry points: [`ARCHITECTURE.md`](../iD/ARCHITECTURE.md), [`API.md`](../iD/API.md), [`modules/`](../iD/modules), [`css/`](../iD/css)

### Stack

- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/ and the style spec https://maplibre.org/maplibre-style-spec/
- react-map-gl: https://visgl.github.io/react-map-gl/
- osm-editor-kit: https://www.npmjs.com/org/osm-editor-kit, https://github.com/osm-editor-kit
- FMC skills: `tech-stack`, `react-map-gl`, `react-dev`, `zustand-state-management`, `playwright-skill`, `finish-work`
