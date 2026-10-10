# Work doc: Maid as a kit that forks configure

Status: proposal, 2026-10-10. Nothing here is built. It is based on three code reviews done the same day (iD upstream, the Radnetz Berlin and MapRoulette forks, the osm-editor-kit packages). Claims marked "review" come from those reviews and were not re-checked line by line.

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

A Bun workspace, following the conventions the osm-editor-kit repos already share (review): `packages/*` with source exports in the workspace and `dist` exports at publish, tsup, changesets, oxlint and oxfmt, peers for UI libraries.

```
packages/
  # headless core: no DOM, no React, no MapLibre
  osm-model/          entities, tags helpers, id handling            from iD osm/ (3.3k lines)
  osm-graph/          graph, difference, history with undo/redo      from iD core/graph, history
  osm-actions/        graph-to-graph edits                           from iD actions/ (4.2k lines)
  osm-geo/            geometry math                                  from iD geo/
  osm-presets/        preset and field matching, overlays            from iD presets/ + id-tagging-schema
  osm-validate/       rule engine, rules as separate exports         from iD validations/ (18 rules)
  osm-api/            read, upload, auth                             osm-api + osm-oauth + osm-changeset
  editor-core/        createEditor, registries, plug-in lifecycle, selection, modes, tasks

  # rendering
  style/              iD's look as data (exists)
  renderer/           feature builder, MapLibre layers, engine (exists)

  # UI, React 19 + Tailwind
  ui-kit/             small shared components: buttons, sections, panes, fields shell
  ui-inspector/       preset fields, raw tag editor, sections registry
  ui-map/             map component, controls, hover and select wiring
  ui-app/             the default shell that composes everything

  # optional features, each one a plug-in
  plugin-imagery/         backgrounds: wraps maplibre-editor-layer-index
  plugin-street-imagery/  wraps street-imagery and street-imagery-react
  plugin-notes/           OSM notes
  plugin-data-layers/     user GeoJSON, PMTiles, vector tiles
  plugin-maproulette/     task provider
  plugin-live-touched/    presence, wraps @osm-editor-kit/live-touched
  ...

apps/
  maid/               the default editor: default config
  radnetz-berlin/     example: a config plus two plug-ins
  compare/            (exists)
```

Rules for the boundaries:

- A package in the headless group may import only packages above it in that list.
- `renderer` and `ui-*` import the headless group, never each other's internals; they meet in `editor-core`'s registries.
- A `plugin-*` package imports `editor-core` types and whatever UI kit it needs. Nothing imports a plug-in except an app.

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

- **The store question is answered by this review:** `osm-data` is a download-and-merge helper, not an editing graph. Maid needs iD's graph and history (ported as `osm-graph`). `osm-data`'s parsing can feed it.
- **`osm-maplibre` has no trick for fast data updates.** The reviewer found that the app sends whole collections through `<Source data>` and never uses `updateData` or feature state. What keeps its width-drag smooth is the same pattern Maid's renderer now uses: change a small separate source during the gesture, commit to shared state on release (their commit `037a9b4`). Maid's engine goes further (diff updates, feature state); those parts are candidates to move into `osm-maplibre` so the other apps profit.

## The config object

```ts
import { createEditor } from '@maid/editor-core'

createEditor({
  container: '#editor',

  api: { url: 'https://api.openstreetmap.org', oauthClientId: '…' },

  // where the editor starts and what it may touch
  start: { center: [13.4, 52.52], zoom: 17, bounds: berlinBounds },

  // tagging schema: the base, then overlays in order
  presets: {
    base: '@openstreetmap/id-tagging-schema',
    overlays: [radnetzPresets],          // add, move, hide fields; add presets
  },

  // which feature categories exist, and their state
  features: {
    buildings: 'readonly',
    boundaries: 'hidden',
  },

  changeset: {
    hashtags: ['#radnetz'],
    comment: (ctx) => `Radnetz: ${ctx.summary}`,
    tags: { source: 'survey;Mapillary' },
  },

  validation: { rules: [...defaultRules, cyclewaySideOneway], disabled: ['suspicious_name'] },

  ui: { locale: 'de', theme: 'auto', toolbarLabels: true, bottomBar: false, brand: { name: 'Radnetz Berlin' } },

  plugins: [
    imagery({ extra: [berlinOrtho2025] }),
    streetImagery({ providers: ['mapillary', 'panoramax'], highlightUsers: ['…'] }),
    dataLayers({ layers: [radnetzQaLayer] }),
    tildaNotes({ baseUrl: 'https://…', region: 'infravelo' }),
    maproulette({ challenges: [123, 456] }),
  ],
})
```

Everything in it is serialisable except functions and plug-ins, so most of a fork can also come from a JSON file or from URL parameters.

## Extension points

Each is one registry in `editor-core`. The right column names what your forks patch in iD today to get the same thing (from the fork review).

| # | Extension point | A plug-in provides | Needed by | Patched in iD today |
| ---: | --- | --- | --- | --- |
| 1 | **Map layer** | sources, style layers, optional hit handling and legend | custom data layers, TILDA notes, Mapillary, MapRoulette pins | `svg/layers`, `renderer/map`, `services/vector_tile`, `ui/map_in_map` |
| 2 | **Imagery source** | background or overlay definitions, dated variants | multiple custom backgrounds, Esri Wayback, hillshade | `renderer/background`, `ui/sections/background_list` |
| 3 | **Inspector section** | a React component and a `when(entity, preset)` filter | TILDA section, sign groups, related tags, MapRoulette task | `ui/entity_editor`, `ui/sections/preset_fields` |
| 4 | **Field type** | a React component for a field `type`, title buttons, tag suggestions | traffic sign rows, image fields, surface and smoothness | `presets/field`, `ui/field`, `ui/fields/*` |
| 5 | **Preset overlay** | data that adds, moves or hides presets and fields | Radnetz customisation | `presets/index`, `presets/field` |
| 6 | **Issue or task provider** | items with a location, a select mode, a sidebar editor | MapRoulette, Osmose, notes | `modes/select_error`, `ui/sidebar`, `svg/layers` |
| 7 | **Task workflow** | candidate pool, next, skip, done, finish policy | MapRoulette "next task" | `core/uploader`, `modes/save` |
| 8 | **Save lifecycle** | hooks before and after upload, changeset tags, commit-panel sections | MapRoulette check-in comment and status | `ui/commit`, `modes/save`, `ui/success` |
| 9 | **Validation rule** | a rule with fixes and its own "ignore" storage | `cycleway_side_oneway`, about 20 planned TILDA rules | `validations/index`, `core/validator` |
| 10 | **Lens** | a named restyling: tag classes to colours, with a shortcut | Radnetz QA lens | `svg/tag_classes`, `svg/defs`, `scripts/build_css` |
| 11 | **Feature category state** | read-only or hidden per category, honoured by hover, select, lasso, snapping | read-only categories | `behavior/hover`, `behavior/lasso`, `ui/sections/map_features` |
| 12 | **Operation** | availability, label, action, optional hover preview | extract side as own way, merge cycleway and footway | `modes/select` |
| 13 | **Field-driven map overlay** | a temporary map layer while a field has focus | side arrows, width band, measuring tape | `ui/fields/directional_combo`, width fields |
| 14 | **URL parameter** | a typed parameter with parse, serialise and default | `lens`, `data_layers`, `way_table`, `maproulette`, `photo_*` | `behavior/hash`, `ui/init`, both HTML files |
| 15 | **Account access** | the OSM token and user preferences, through an API | MapRoulette key, TILDA, key-value store, live touched | `services/osm` |
| 16 | **Pane, preference section, toolbar tool** | a React component and a slot name | Map Display and Photos panes, notes buttons | `ui/panes/*`, `ui/tools/*` |
| 17 | **Dock** | a bottom or side panel bound to the selection | way-table dock | new files plus `ui/init` |

Two of these carry performance rules.

**Map layers (1, 13).** A plug-in does not get the MapLibre map to call `addSource`. It declares sources and layers, and it gets a handle with `add`, `update`, `remove` and `setState`. The engine routes those through the fast paths measured in iteration 1: diff updates, one in flight per source, a small twin source for anything that changes during a gesture, feature state for highlight. See ADR 0002 and 0003. A plug-in that wants raw access can ask for it explicitly and is then on its own.

**Lenses (10).** Maid resolves the look per feature from rules (ADR 0001). A lens is a second rule set, so switching it is a property update and not a style rebuild.

## URL state

iD scatters hash handling over seven modules. Maid uses **nuqs**: there are no pages, so a router buys nothing, and nuqs gives typed parsers, batching and history control per parameter.

- `editor-core` owns the parameters every editor has: `map`, `id`, `background`, `overlays`, `disable_features`, `comment`, `hashtags`, `locale`.
- A plug-in registers its own through extension point 14 and gets a typed hook back.
- Map position is written on move end with `history: 'replace'`, as the `react-map-gl` skill prescribes.
- iD uses the hash (`#map=…`), and existing links and the osm.org "Edit" button rely on that. Maid reads iD's hash format on start and writes search parameters after. Open question below.

`osm-map-url` already parses `map=` and `f=`; it is tied to TanStack Router today and needs a router-free entry.

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

1. **`editor-core` skeleton**: `createEditor`, the plug-in lifecycle, and the registries as empty typed maps. Move today's Maid app onto it.
2. **Headless data**: port `osm-model`, `osm-graph` with history, `osm-actions`. Replace the proof-of-concept store. Real undo.
3. **First three extension points, proven by real plug-ins**: map layer (data layers plug-in), inspector section, URL parameter.
4. **Inspector**: presets and fields in React (`osm-presets`, `ui-inspector`), raw tag editor.
5. **Save**: `osm-api` with deletes, the commit panel, save lifecycle hooks.
6. **MapRoulette as the first full plug-in**: it exercises task provider, workflow, save hooks and account access in one go.
7. **Radnetz Berlin as an app**: port the features in the order of the work doc, adding extension points as they are needed and no earlier.
8. Validation, operations and the remaining UI, driven by what the two apps still miss.

## Open questions

1. **Hash or search parameters?** Search parameters are what nuqs and the rest of the stack use. The hash is what iD links and osm.org use. Proposal: read both, write search parameters.
2. **Where do the packages live?** In this repo under `@maid/*` until they are stable, then published as `@osm-editor-kit/*`. Or directly in the osm-editor-kit repos from the start.
3. **How close to iD's code do the ported packages stay?** Close ports make it easy to follow upstream fixes. A rewrite in TypeScript reads better. Proposal: port file by file, keep names, convert to TypeScript.
4. **Do plug-ins get loaded at build time only, or also at run time from a URL?** Build time is simpler and safer. Run time would let people try a plug-in without a build.
5. **Licence of ported iD code** is ISC, as Maid's. Attribution per file needs a convention.
6. **`osm-data`**: keep it as the parsing layer below `osm-graph`, or fold it in?
