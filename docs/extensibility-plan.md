# Work doc: Maid as a kit that forks configure

Status: historic proposal, 2026-10-10, revised 2026-10-11. **What is built is described in [ARCHITECTURE.md](../ARCHITECTURE.md)**; this document keeps the goal and the reasoning. Single topics are worked out in [docs/architecture/](architecture/README.md), which also lists what he decided and what is open. Where this document and a chapter disagree, the chapter is newer.

On the word "plug-in" below: the name is under discussion ([naming](architecture/01-naming.md)); the proposal is "Maid module". Whatever the name, these units are added in code at build time, never through the UI or a URL.

When it was written, nothing was built. It is based on three code reviews done the same day (iD upstream, the Radnetz Berlin and MapRoulette forks, the osm-editor-kit packages). Claims marked "review" come from those reviews and were not re-checked line by line.

## Goal

A single-purpose editor, such as "Radnetz Berlin" or "MapRoulette tasks for cycleways", should be **one config object plus a few plug-in packages**. It should not be a fork that patches core files and has to be rebased.

Measure of success: the two existing forks can be rebuilt on Maid without touching a file in `packages/`.

## Why iD forks are expensive today

Numbers from the review of your forks against upstream:

| Fork | Files changed | Upstream files patched | Lines added |
| --- | ---: | ---: | ---: |
| Radnetz Berlin (PR 10, `WORKDOC.md`, 34 features) | 347 | about 110 | 31,140 |
| MapRoulette (PR 4) | 72 | 26 | 12,421 |

The patches cluster where iD has **lists written into the code** instead of registries (review of iD upstream):

- Map layers: a literal list in `svg/layers.js`, with ids such as `'osm'` and `'notes'` checked by string elsewhere.
- Panes, info panels, field types, inspector sections, map-data sections: literals in `ui/init.js`, `ui/panels/index.js`, `ui/fields/index.js`, `ui/entity_editor.js`, `ui/panes/map_data.js`.
- Validation rules: a barrel file that the validator iterates. All rules always load.
- Operations: every export of the barrel shows up in every edit menu.
- Services: a mutable object that can be trimmed from outside but has no way to add one.
- Photo services: their ids are repeated in the renderer and in the UI.
- URL state: several modules read and write `window.location.hash` directly.
- Project config lives in `index.html`, and in the Radnetz fork in two HTML files that must be kept in sync.
- Global singletons that bypass `context`: presets, localizer, preferences, file fetcher, services.

Everything a fork wants to add lands in one of those lists, so every fork patches the same files.

## Design principles

1. **Registries, not lists.** Each kind of thing the editor shows or does is registered through one typed function. Core features use the same function as plug-ins.
2. **One config object.** `createEditor(config)` is the only entry point. An app is a `main.tsx` with a config.
3. **Plug-ins are plain objects.** A plug-in is `{ name, setup(editor) }` and usually just returns registrations. No inheritance, no global.
4. **Core is headless.** Data, history, validation and tasks know nothing about React or MapLibre. The renderer and the UI are replaceable packages on top.
5. **State has one home per kind.** URL state through one module, preferences through one module, server data through TanStack Query. Plug-ins declare their state; they do not reach for `window`.
6. **No instance singletons.** Everything hangs off the editor instance, so two editors can live on one page and tests need no reset.
7. **Performance rules are part of the API.** A plug-in cannot push data into the map in the slow way by accident (see "Map layers").

## Package structure

The packages as built: [ARCHITECTURE.md](../ARCHITECTURE.md#packages); their names and origins: [packages](architecture/03-packages.md). The two reviews below are kept for their findings.

### What comes from iD, and what it costs

From the review of iD's 79k lines:

| Part | Lines | State | Work to make it a package |
| --- | ---: | --- | --- |
| `osm/` | 3,266 | Mostly pure | Cut `d3-geo` area math, the id manager singleton, a few imports of `core` and `actions` |
| `actions/` | 4,205 | Graph in, graph out | Cut leaks into UI panels, presets and the localizer |
| `geo/` | 966 | Near pure | Replace d3 helpers |
| `core` graph, difference, tree | part of 4,366 | Pure once the debug flag is passed in | `history` must be split from persistence, loading UI and d3-dispatch |
| `presets/` matching | 1,446 | Matching is pure | Cut preferences, file fetcher, location manager |
| `validations/` | 3,872 | Reads graph through `context` (134 uses) | Inject translator, preset lookup and graph. Medium effort |
| `operations/` | 1,956 | Tied to `context` and modes | Redesign as `(graph, selection) → { available, disabled, action }` |
| `modes/`, `behavior/` | 5,511 | DOM and d3 | Rewrite on the new stack |
| `svg/`, `renderer/` | 11,488 | d3 drawing | Replaced by `style` and `renderer` |
| `ui/` | 30,353 | d3 selections, 108 files | Rewrite in React, feature by feature |

So about 14k lines of logic can be ported with moderate work, and about 47k lines of drawing and UI are replaced. The UI is the bulk of the effort and can grow feature by feature.

### What osm-editor-kit gives us, and its gaps

From the inventory of the local checkouts:

| Need | Package | State | Gap for a full editor |
| --- | --- | --- | --- |
| Background imagery | `maplibre-editor-layer-index` 0.1.13 | Reusable as is | none known |
| Street-level imagery | `street-imagery`, `street-imagery-react` | Most mature; already a provider registry | UI-heavy, needs fitting into panes |
| Presence | `live-touched` 0.1.0 | Reusable, headless | backend key handling |
| URL state for the map | `osm-map-url` | Reusable | tied to TanStack Router today |
| Basemap and metre-based paint | `osm-maplibre` | Reusable | latitude is fixed at 51°; make it a parameter |
| OSM API | `osm-api` (npm 4.0.0) | Reusable | conflict handling only on a branch |
| OAuth | `osm-oauth` | Reusable, config injected | private package, no token refresh seen |
| Upload | `osm-changeset` | Reusable | **no deletes** |
| Data store | `osm-data` | Flat maps, merge by version | **no undo, no spatial index, thin relation support** |
| Way edits | `osm-way-edit` | Split and insert only | no join, reverse, move, delete |
| Drawing new geometry | `react-map-gl-draw` 0.2.1 | Reusable, has undo | for free geometry, not for OSM ways |
| Traffic sign field | `@osm-traffic-signs/id-field` | d3-based iD plug-in | needs a React version |
| Tag editing UI | `osm-ui` | Empty placeholder | everything |

Two conclusions:

- **The store question is answered by this review:** `osm-data` is a download-and-merge helper, not an editing graph. Maid needs a real graph and history (in `maid-model`, ported from Rapid). `osm-data` stays the small apps' store and Maid does not build on it ([data store](architecture/05-data-store.md)).
- **`osm-maplibre` has no trick for fast data updates.** The reviewer found that the app sends whole collections through `<Source data>` and never uses `updateData` or feature state. What keeps its width-drag smooth is the same pattern Maid's renderer now uses: change a small separate source during the gesture, commit to shared state on release (their commit `037a9b4`). Maid's engine goes further (diff updates, feature state); those parts are candidates to move into `osm-maplibre` so the other apps profit.

## The config object

The sketches of the config object and of the extension points that were here are built differently: see [the config object](../ARCHITECTURE.md#the-config-object) and [Maid modules](../ARCHITECTURE.md#maid-modules) in ARCHITECTURE.md.

## URL state

Built: [URL state](architecture/08-url-state.md).

## State and UI conventions

Following the FMC `tech-stack`, `react-dev` and `zustand-state-management` skills:

- React 19 with the React Compiler, small components, one job each.
- Tailwind for all styling. No global CSS selectors. iD's map look lives in `packages/style` as data, not in CSS.
- Zustand for client state, one small store per concern, exported only as hooks. Never in a plug-in's module scope: stores are created per editor instance.
- TanStack Query for anything from a server (tiles of OSM data, notes, tasks, imagery metadata).
- Zod at every boundary: config, URL parameters, API responses.
- Map events through `<Map>` props, layers through `<Source>` and `<Layer>`; the engine is the documented exception.

## How the two forks would look

**Radnetz Berlin** (34 features in `WORKDOC.md`). Rough mapping, to be refined per feature:

| Group in the work doc | Becomes |
| --- | --- |
| Multiple custom backgrounds, year dropdown | `plugin-imagery` config (2) |
| Custom data layers: GeoJSON, PMTiles, tag filter | `plugin-data-layers` (1) |
| Lenses, "Radnetz QA" | a lens (10) |
| Read-only categories | `features` in the config (11) |
| TILDA category helper, checklist, checked and verified | a `plugin-tilda` with an inspector section (3) and account access (15) |
| Extract a side as its own way, merge cycleway and footway | operations (12) |
| `cycleway:*:oneway` validation, planned QA rules | validation rules (9) |
| TILDA notes | a task provider (6) |
| Traffic sign field, sign groups, sign bar | field type (4), inspector section (3), dock (17) |
| Mapillary age colours, highlighted users, set-photo buttons | `plugin-street-imagery` config plus field buttons (4) |
| Side indicator, width band, measuring tape | field-driven overlays (13) |
| Way-table dock | a dock (17) |
| Favourites with number shortcuts, toolbar labels, panes, no bottom bar | `ui` config, pane slots (16) |
| Live edits | `plugin-live-touched` |
| URL parameters | declared by each plug-in (14) |

**MapRoulette.** One package, `plugin-maproulette`: a task provider (6) with pins as a map layer (1), a workflow (7), save hooks for the check-in comment and task status (8), an inspector section (3), a URL parameter (14) and the API key from user preferences (15).

Neither needs a change in a core package if the 17 points exist. That is the test.

## Order of work

Each step ends with something that runs.

1. **`maid-core` skeleton**: `createEditor`, the plug-in lifecycle, and the registries as empty typed maps. Move today's Maid app onto it.
2. **Headless data**: port `maid-model` (entities, graph, actions, history). Replace the proof-of-concept store. Real undo.
3. **First three extension points, proven by real plug-ins**: map layer (data layers plug-in), inspector section, URL parameter.
4. **Inspector**: presets and fields in React (`osm-presets`, `ui-inspector`), raw tag editor.
5. **Save**: `osm-api` with deletes, the commit panel, save lifecycle hooks.
6. **MapRoulette as the first full plug-in**: it exercises task provider, workflow, save hooks and account access in one go.
7. **Radnetz Berlin as an app**: port the features in the order of the work doc, adding extension points as they are needed and no earlier.
8. Validation, operations and the remaining UI, driven by what the two apps still miss.

## Open questions

Collected, with the decisions made so far, in [docs/architecture/README.md](architecture/README.md).
