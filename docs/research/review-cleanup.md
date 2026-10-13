# Cleanup review of Maid (read-only, 2026-10-13)

**Status (2026-10-13, after the fixes).** Done: 1 without the split into files (1763d73), 2 for the segmented control and the address draft (f782e65; the near-copies of the input class stay, they differ), 3 (1763d73 and 38bf9a3: the checks delete as the app does, the engine's delete functions are gone), 4 (be7da61; the shell's own settings store still reads and writes during a run), 5 (8471f86), 17 for `probe.ts` (1763d73), 19 for the layout in `AGENTS.md` (880ec31). Open: 6 to 16, 18, 20, and the rest of 17 and 19.

Scope: `apps/`, `packages/` (without `packages/model`), `tools/`. Nothing was edited. No tests or type-check were run: every finding is from reading and from `grep` across `apps packages tools`.

Line numbers are from the time of reading. `engine.ts`, `MapView.tsx`, `Inspector.tsx`, `fields/Row.tsx` and `interactions-check.ts` were changing while I read (engine.ts went from 2002 to 2090 lines, interactions-check.ts from 1408 to 1596), so for those files the function names are the reference, not the numbers.

"Confirmed" means a grep over the whole repo showed it. "Not confirmed" is marked.

## Do not hand out in parallel

| Files | Findings |
| --- | --- |
| `tools/bench/check-page.ts`, `*-check.ts` | 1, 3, 16, 17 |
| `packages/renderer/src/engine.ts` | 3, 7, 8, 18 (and the other agent's current work) |
| `packages/ui/src/inspector/fields/*` | 2, 9, 10 (Row.tsx is being edited now) |
| `packages/ui/src/index.ts`, `Toolbar.tsx` | 2, 4, 9 |
| `packages/module-*` | 2, 4, 6, 13, 14 (one agent per module is fine once the ui/core part of 2, 4, 6 is merged) |
| `packages/validation/src` | 5, 8 |
| `apps/maid/src/components/MapView.tsx` | 11, 12 (and the other agent's current work) |

## Ranked findings

### 1. Browser checks: pointer helpers copied five times, `interactions-check.ts` is six checks in one file

- Where: `tools/bench/interactions-check.ts`. It has six `runCheck(...)` blocks (start lines about 16, 890, 1143, 1232, 1275, 1409). `origin`, `abs`, `click`, `drag`, `key`, `state`, `where`, `near` are declared again in four of them (lines 17-67, 893-959, 1278-1289, 1412-1430) and once more in `tools/bench/draw-check.ts:31-60`. `pick` (find a building and a road) is nearly the same in `filters-check.ts:13-27` and `journal-check.ts:14-30`.
- Simpler: add to the `Check` object in `tools/bench/check-page.ts` a `pointer` (`click(p, {shift, count, button})`, `drag`, `key`, `where(ids)`, `near`) and `state()`; add `pickBuildingAndRoad(page)` there. Then split the file along the blocks that already exist: `tools/bench/interactions/{select-drag, snapping, touch, protected-menu, stack, measure}.ts`, and `interactions-check.ts` only runs them and adds up the failures. The first block (about 870 lines) can stay one file.
- Size: about 150 lines removed, 1600 lines moved into 6 files of 100 to 870 lines.
- Risk: low, tools only. Proof: `bun run check-interactions`, `check-draw`, `check-filters`, `check-journal` print the same `ok` lines as before (compare the count of `ok` lines).

### 2. Segmented choice, text input class and draft input are written again in each module

Three copies of the same UI, each with the class string pasted:

- Segmented radio group (joined buttons, `role="radiogroup"`, arrow keys): `packages/ui/src/FilterPanel.tsx:90-137` (`StateSwitch`), `packages/module-street-imagery/src/panel.tsx:69-108` (`KindChoice`), `packages/module-data-layers/src/Panel.tsx:109-146` (`KindChoice`, without the arrow keys and without the roving `tabIndex`). The group's class string is the one `ToolGroup` in `packages/ui/src/Toolbar.tsx:12` already has.
- The input class: `INPUT` in `packages/ui/src/inspector/fields/shared.ts:35-36` is not exported from the package, so it is pasted in `packages/module-traffic-signs/src/field.tsx:18-19`, `packages/module-street-imagery/src/image-field.tsx:27`, `packages/module-data-layers/src/Panel.tsx:22` and `:224`, `apps/maid/src/modules/relations.tsx:53-56`.
- Draft input (state, write on blur, Enter blurs, Escape reverts): `useDraft`/`DraftInput` in `packages/ui/src/inspector/fields/DraftInput.tsx` is the shared one. Written again in `fields/Address.tsx:211-250` (`TextSlot`), `fields/Number.tsx:91-100` (`editKey`), `apps/maid/src/components/TagRow.tsx:14-39`, `packages/module-traffic-signs/src/field.tsx:25-48`.
- Simpler: in `packages/ui` add `SegmentedControl<T>({ label, options, value, onSelect })` to `Toolbar.tsx` and use it in the three places; export `INPUT`, `HINT`, `ROW_BUTTON`, `DraftInput`, `useDraft` from `packages/ui/src/index.ts`; `TextSlot` uses `useDraft`; the traffic sign field becomes a `DraftInput` (then `tag-changes.ts` and its export `applySignTagChanges` have no user left: confirmed, only `field.tsx` calls it).
- Size: about 150 lines removed.
- Not the same behaviour, ask first: the data layers choice would get arrow keys; `TagRow` commits `draft.trim()` and not `cleanValue` (no NFC, no 255 character limit), so the raw tag editor would get the limit the fields have.
- Risk: low. Proof: `bun run check`, `bun test packages/ui`, `bun run check-filters`, a look at the Photos and Data layers flyouts.

### 3. `engine.deleteEntity` and `deleteEntities` are only used by the checks; the app deletes another way

- Where: `packages/renderer/src/engine.ts` `deleteEntity`, `deleteEntities` (about lines 896-930, with the imports `actionDeleteNode`, `actionDeleteWay`, `actionDeleteRelation`, `actionDeleteMultiple`).
- Confirmed: the only callers are `tools/bench/edit-check.ts:80,141`, `filters-check.ts:87`, `journal-check.ts:82`. The app deletes with `engine.runOperation(deleteOperation)` (`apps/maid/src/components/useShortcuts.ts:62`, the edit menu through `commands.ts`). The two paths differ: other annotations ("Deleted a way" against iD's "Deleted a line" in `packages/operations/src/operations.ts:663-669`), and only the operation picks the next selection.
- So three browser checks test a delete that no person can trigger.
- Simpler: the checks select the feature and run the `delete` operation (as `ops-check.ts:26-33` finds an operation by id); delete the two engine methods and the four imports.
- Size: about 40 lines removed in the engine, about 10 changed in the checks (expected undo labels change).
- Risk: medium, the checks' expectations change. Proof: `bun run check-edit`, `check-filters`, `check-journal`.

### 4. "Automated browser" and "storage that may be blocked" are written per module

- Where: `isAutomatedBrowser` in `packages/module-imagery/src/helpers.ts:55-59` and `packages/module-street-imagery/src/state.ts:96-98`; `automated()` in `packages/module-data-layers/src/layers.ts:41-44`; plain `navigator.webdriver` in `apps/maid/src/config.ts:52`, `auth.ts:29`, `reference.ts:235`. A storage that keeps nothing: `packages/module-imagery/src/store.ts:23-52` (with try/catch around localStorage) and `packages/module-street-imagery/src/store.ts:19,94`.
- Inconsistent: imagery and street-imagery store nothing under automation; notes, lenses, data-layers and `packages/ui/src/settings.ts` use `persist` with plain localStorage.
- This is core rule 1 (no requests under automation), so one definition matters more than the lines.
- Simpler: `packages/core` exports `isAutomated()` and `moduleStorage()` (the imagery version: nothing under automation, try/catch otherwise). All `persist` stores of modules use `createJSONStorage(moduleStorage)`. The app's three reads use `isAutomated()`.
- Size: about 60 lines removed, 2 tests move to core.
- Risk: low. Proof: `bun run check`; every browser check still reports "no request outside localhost".

### 5. Validation rules: the same helper in five rule files

- Where: `locationOf(entity, graph)` identical in `packages/validation/src/rules/incompatible-source.ts:44-50`, `missing-role.ts:17-23`, `missing-tag.ts:37-48`, `mutually-exclusive-tags.ts:69-75`, `private-data.ts:55-61`. `locOf(graph, id)` in `almost-junction.ts:71-74` and `crossing-ways.ts:50-54`. `hasTag` in `almost-junction.ts:56` against the exported one in `tags.ts:102`.
- Simpler: `locationOf` and `nodeLoc` move to `packages/validation/src/geo.ts`, the rules import them; `almost-junction.ts` uses `hasTag(tags.bridge)` from `tags.ts`.
- Size: about 50 lines removed.
- Risk: very low. Proof: `bun test packages/validation`.

### 6. Geo maths copied from a library that is already installed

- Where: `packages/validation/src/geo.ts:58-84` (`metersToLat`, `metersToLon`, `sphericalDistance`), `packages/operations/src/point-to-area.ts:7-21` (says "Copied" in its comment), `packages/operations/src/operations.ts:671-698` (`metresBetween`). Also `segmentIntersection` and `selfIntersects` in `validation/src/geo.ts:95-142`.
- `@rapid-sdk/math` 1.0.0-pre.5 is a dependency of `packages/model` and exports `geoMetersToLat`, `geoMetersToLon`, `geoSphericalDistance`, `geomLineIntersection`, `geomPathHasIntersections` (confirmed in its `.d.ts`). The model itself uses them (`packages/model/src/actions/split.ts:2`).
- Simpler: add `@rapid-sdk/math` at the same version to `packages/validation/package.json` and `packages/operations/package.json`, import the three distance functions, delete the copies. Leave `segmentIntersection`/`selfIntersects` unless a test run shows the library's versions give the same results (not confirmed: the comments say they follow iD, the library follows Rapid).
- Size: about 45 lines removed.
- Risk: low for the distance functions (same formula and radii). Proof: `bun test packages/validation packages/operations`, `bun run check-validation`, `check-ops`.

### 7. `engine.ts` (about 2090 lines): four parts can leave along seams that are already there

`DrawTool` (`draw.ts`) and `TransformTool` (`transform.ts`) show the pattern: a class that takes the engine. The same works for:

- **Drag** → `drag.ts`, `DragTool`: the fields `dragTarget`, `dragged`, `dragBusy`, `dragAim`, the methods `dragRefusal`, `aimAt`, `connectRefusal`, `isDraggable`, `dragTo`, `settleDrag`, `stopDrag`, `endDrag`, and the handle press (`pressingHandle`, `pressMidpoint`, `moveHandle`, `insertHandleNode`, `handlePress`, `handleNode`). Needs from the engine: `moveNodeStep`, `change`, `setHover`, `snapAt`, `touch`, `wake`, `data`. About 300 lines.
- **Sources** → `sources.ts`: `push`, `scheduleFlush`, `allChannels`, `flushAll`, `flush`, `channelIdle`, `wake`, `touch`, `compact`, `tilesReloaded`, `pushing`, `settled`, `hideOriginals`, `removeFeatures`, `sendBatch`, the fields `live`, `channels`, `editing`, `firstLoadDone`, `compacting`, `compactTimer`, `waiters`, and `makeChannels`/`Channel` from the end of the file. Interface: `push(batch, tier)`, `remove(pairs)`, `settled()`, `touch()`. About 280 lines. This is the part the comment at the top of the file is about (the one place that talks to MapLibre imperatively).
- **Relations** → into `related.ts`: `relatedOf`, `loadRelation`, `fetchRelation`, `fitTo`, `setRelated`, `syncRelated`, `paintRelated`, `relatedOfSelection`. About 140 lines.
- **Overlays** → `overlays.ts`: `computeMidpoints`, `midpointMayChange`, `refreshMidpoints`, `setFieldOverlay`, `refreshFieldOverlay`, `previewOperation`, the measuring tape. About 250 lines.
- Size: about 950 lines moved, none removed; the engine keeps loading, redraw, undo, selection, modes, filters.
- Risk: medium (private state crosses the seams; the public names used by the app and by `window.__maid` in the checks must stay on the engine as one-line forwards or the checks change). One part per agent, one after the other, not while another agent edits the file. Proof per part: `bun run check`, then `check-interactions` (drag, handles), `check-undo` and `check-edit` (sources), `check-relations`, `check-ops` (preview), `check-render`.

### 8. One-way, sidedness and lifecycle tables exist three to four times

- Where: one-way tags in `packages/renderer/src/direction.ts:14-41` (`FORWARD`, `onewayOf`), in `packages/validation/src/rules/impossible-oneway.ts:13-62,131-139` (`oneWayValues`, `backwardValues`, `isOneWay`), and a third, shorter rule in `apps/maid/src/field-overlay.ts:55-64` (`isOneway`). Lifecycle prefixes in `packages/renderer/src/direction.ts:76-90`, `packages/filters/src/default.ts:~55-65`, `packages/style/src/classes.ts:17-20`, `packages/validation/src/tags.ts:~64-80`. Routable highways three times inside validation alone: `tags.ts:8-37`, `rules/impossible-oneway.ts:66-…`, `connection-tags.ts:~28`.
- The model already has them as rulesets: `OsmWay.isOneWay()` reads `oneway_forward`, `oneway_backward`, `oneway_bidirectional`; `isSided()` reads `sided_right` and `removeLifecyclePrefix` (`packages/model/src/data/OsmWay.ts:298-330`).
- Simpler, in two steps: (a) inside validation, one `routableHighways` per source list (Rapid's and iD's differ on purpose, keep two, delete the third if it equals one of them: not confirmed which); (b) `impossible-oneway.ts` takes direction from the rulesets the way `tags.ts` takes `uninteresting`, or from one table exported by the renderer's `direction.ts` moved to `packages/style` (style has no dependencies and filters, renderer could both read the lifecycle list from it).
- `apps/maid/src/field-overlay.ts:55` follows the iD fork's own rule (motorway and roundabout only), so it is not the same function: leave it, rename it `impliesOnewayForWidth`.
- Size: about 80 lines removed. Risk: medium, the iD test ports (`*.id.test.ts`) pin the behaviour. Proof: `bun test packages/validation packages/filters packages/renderer`, `bun run check-render`.

### 9. `packages/ui` knows the renderer and the modules by name

- `packages/ui/src/extension-points.ts:6` imports the type `EntityInfo` from `maid-renderer`, and `packages/ui/package.json` depends on the renderer for it. The package's README lists this under "Open". Simpler: move `EntityInfo` (`packages/renderer/src/engine.ts`, the type after `EngineMetrics`) to `packages/core/src/types.ts`; renderer and ui import it from core; remove the renderer from ui's dependencies. About 15 lines moved.
- `packages/ui/src/inspector/fields/Row.tsx` `STEADY_TYPES` lists the field types of three modules by name (`streetImages`, `surfaceSmoothness`, `trafficSign`). A new module field has to edit ui. Simpler: `InspectorFieldType` gets `steady?: boolean`, the three modules set it when they register, `PresetFields` hands the set down. About 10 lines.
- Risk: low. Proof: `bun run type-check`, `bun test packages/ui`, the surface field in the browser keeps the focus after a pick (not covered by a check that I found).

### 10. "Focus again after the control was remounted" is built twice

- Where: `packages/ui/src/inspector/fields/Number.tsx:35-66` (`refocus`, `takeRefocus`, `useParts`, `registerPart`) and `fields/Radio.tsx:18-34,75-81` (`pendingFocus`, `rememberFocus`, `takeFocus`, `focusButton`). Both exist because `Row` keys a control by its tag value, so every write remounts it.
- Simpler: one `fields/refocus.ts` with `rememberFocus(controlId, part)` and `useRefocus(controlId, focusPart)`; both fields use it. This also removes the reassigned module-level `let` in `Number.tsx:40` (the holder becomes one object as in Radio).
- Size: about 30 lines removed. Risk: low. Proof: `bun test packages/ui`, by hand: step a number with the stepper, arrow through a radio.

### 11. Three hand-written stores next to Zustand; every reassigned module-level `let`

The React Compiler treats a module variable as constant when it is read during render. List of every module-level `let` that is reassigned (confirmed with `grep '^let '`, tests and bench scripts left out):

| File:line | Variable | Read during render? |
| --- | --- | --- |
| `apps/maid/src/components/MapView.tsx:43` | `lastTileCheck` | no, in `handleMove` |
| `MapView.tsx:45` | `dragging` | no, in handlers |
| `MapView.tsx:47` | `lastDrawClick` | no, in handlers |
| `MapView.tsx:48` | `zoomGuardTimer` | no |
| `MapView.tsx:50` | `longPress` | no |
| `MapView.tsx:51` | `pressedAt` | no |
| `apps/maid/src/journal.ts:26` | `state` | through `useSyncExternalStore` (line 75) |
| `apps/maid/src/journal.ts:38` | `stop` | no |
| `apps/maid/src/auth.ts:44` | `state` | through `useSyncExternalStore` (line 90) |
| `packages/ui/src/inspector/fields/Number.tsx:40` | `refocus` | no, behind `takeRefocus` (see 10) |

Mutable module objects used the same way: `apps/maid/src/favourites.ts:23` (`pending`), `packages/ui/src/inspector/fields/Radio.tsx:24` (`pendingFocus`), `apps/maid/src/stack.ts` (`holder`).

- Simpler: `auth.ts`, `journal.ts` and `stack.ts` each hold `let state` + `listeners` + `set` + `useSyncExternalStore`. The stack says Zustand for client state: three small `create()` stores remove three subscribe/notify copies and three of the `let`s. About 40 lines removed.
- Risk: low. Proof: `bun test apps/maid` (stack.test.ts), `bun run check-journal`; login by a person on the development server.

### 12. `MapView.tsx`: gesture state in module variables, and the app names two modules in the click handler

- The six module `let`s above are the state of one press (drag, long press, zoom guard). They are safe today only because nothing reads them in render. Simpler: a hook `usePointerGestures({ interactive, mode, select, openMenu })` in `apps/maid/src/components/map-pointer.ts` that holds them in one `useRef` object and returns `{ onMouseDown, onMouseUp, onMouseMove, onTouchStart, onTouchMove, onTouchEnd }`; `handleClick`/`handleDblClick` go to `map-click.ts`. Mouse and touch already share `press`, `release`, `movePointer`: that part is fine and stays.
- `handleClick` imports `NOTES_LAYER_IDS` and `streetImageryClick` (`MapView.tsx:2-3`, about lines 340-350): the app has to know which modules put clickable things on the map, and `packages/module-notes/src/notes.tsx:20-25` documents that the app must do so. Simpler: an extension point `map.click` (`(event) => boolean`, true means taken) declared next to `map.content` in `packages/renderer/src/extension-points.ts`; both modules register one; MapView asks the items.
- Size: about 250 lines moved, about 15 removed. Risk: medium, the file is being edited now. Proof: `bun run check-interactions` (covers mouse, touch, menu, double click), `check-draw`.

### 13. Three modules each track the map's box and zoom with their own effect

- Where: `packages/module-notes/src/notes.tsx:56-74`, `packages/module-imagery/src/ImageryLayers.tsx:27-41`, `packages/module-street-imagery/src/map.tsx:29-52` (`useMapView`). Same shape: `map.on('moveend')`, read `getBounds()` and `getZoom()`, call once at start. The tuple type `Bbox`/`Bounds` is declared in `packages/module-notes/src/model.ts:7`, `apps/maid/src/modules/scene-bounds.ts:5`, `packages/renderer/src/related.ts:39`.
- Simpler: `useMapView(): { bounds: Bounds; zoom: number } | null` in `packages/renderer` (all modules depend on it), `Bounds` exported from there. Note the units: notes wants OSM zoom (MapLibre + 1), imagery wants MapLibre zoom; the hook returns MapLibre zoom and notes adds one.
- Size: about 40 lines removed. Risk: low. Proof: `bun run check`, by hand: notes and background list follow a pan.

### 14. The seven `module-*` packages register themselves in five different shapes

| Module | Factory lives in | Store | Component for the item |
| --- | --- | --- | --- |
| data-layers | `module.tsx` | global `create` | JSX |
| lenses | `module.tsx` | global `create`, plus `connectLenses` | JSX |
| imagery | `index.ts` | one store per `imagery()` call | `createElement` |
| notes | `notes.tsx` | two global stores | component defined inside `setup()` (`notes.tsx:45`) |
| street-imagery | `index.ts` | global | JSX in other files |
| surface, traffic-signs | `index.ts` | none | direct |

- Also: `packages/module-street-imagery/src/image-field.tsx:24` and `packages/module-traffic-signs/src/field.tsx:13-14` rebuild `FieldProps` from `InspectorFieldType['component']` although `maid-ui` exports `FieldProps` (surface imports it: `module-surface/src/field.tsx:9`). `packages/module-street-imagery/src/image-presets.ts:14-21` writes out a private copy of `PresetChanges`, which `apps/maid/src/maid.config.ts:42` then casts (`as PresetChanges`); surface and traffic-signs depend on `maid-presets` and use the real type.
- Simpler: one shape. `src/module.tsx` holds the factory and nothing else, `index.ts` only re-exports; components are top-level and take what they need as props; `FieldProps` and `PresetChanges` are imported (street-imagery gets `maid-presets` as a dependency, the cast in `maid.config.ts` goes).
- `packages/module-traffic-signs` is not in `maid.config.ts` (confirmed: `trafficSigns` has no caller; `apps/maid/package.json:24` still depends on it). `docs/build-out/radnetz-features.md:46` says "built, not switched on", so it is not dead, but its `country` option is read by nothing (`field.tsx:16` says so).
- Size: about 40 lines removed, files renamed. Risk: low. Proof: `bun run check`.

### 15. `apps/maid/src/modules/relations.tsx` (694 lines): two sections and their shared rows in one file, with its own copies of ui classes

- Where: lines 44-68 are eleven class constants; `ROLE_INPUT`/`FIELD` repeat ui's `INPUT`, `ICON_BUTTON` repeats `ROW_BUTTON`, `HINT` and `SECONDARY` repeat ui's `HINT` (`packages/ui/src/inspector/fields/shared.ts`).
- Split along what is there: `relations/rows.tsx` (`edit`, `Row`, `useRelatedWhileHovered`, `RoleOptions`, `RoleInput`, `RemoveButton`, `ZoomButton`, `MoveButton`, lines 71-242), `relations/members.tsx` (`MemberRowView`, `MemberList`, `MembersSection`, 243-476), `relations/memberships.tsx` (`MembershipRow`, `AddToRelation`, `RelationsSection`, 478-664), `relations/index.ts` (the `relations()` factory, 666-694). `relations-logic.ts` stays.
- Depends on finding 2 for the exported classes. Size: 694 lines into four files, about 15 removed. Risk: low. Proof: `bun test apps/maid/src/modules`, `bun run check-relations`.

### 16. `(window as any).__maid` about 110 times in the checks

- Where: `tools/bench/*.ts` (interactions-check 38+, relations-check 28, journal-check 10, undo 8, ops-check 7, …). `tools/refs/bench-api.d.ts` types `window.__bench` only. `apps/maid/src/bench.ts:51` is where `__maid` is set.
- Simpler: export `type MaidDebug = { map: MapLibreMap; engine: MaidEngine; editor: Editor; model: …; journalFlushed: … }` from `apps/maid/src/bench.ts` and declare it on `Window` in `tools/refs/bench-api.d.ts`. The `any` casts and the `(f: any)`, `(o: any)` in callbacks go; a renamed engine method then fails the type-check and not the browser run.
- Size: no lines removed, about 110 casts removed. Risk: low, but private engine members used by checks will show up as errors (that is the point). Proof: `bun run type-check`.

### 17. Scratch scripts in `tools/bench` that nothing references, one without the request block

- `tools/bench/probe.ts`: referenced by nothing (grep over repo and docs). It opens a browser **without** `context.route` blocking non-localhost hosts, unlike every other script, and has the port `5175` typed in instead of `PORTS.maidBuild`. With `?live=1` in its query argument it would be stopped only by `navigator.webdriver`. Delete it, or give it the block.
- `tools/bench/variants.sh`: referenced by nothing; a bash loop with inline Python. Delete or move to a doc.
- `quick-pan.ts`, `zoom-settle.ts`, `wheel-zoom.ts` are named in ADRs 0006 to 0008 and the iteration 1 report, so they are evidence, not dead; but with `edit.ts`, `shot.ts`, `run.ts` they repeat the same launch, route block and `__bench` wait seven times. A `openMaid(scene, query)` in `check-page.ts` (the first half of `runCheck`) would serve all.
- `median`, `round`, `statsOf` in `packages/validation/bench/validation.bench.ts:51-72` repeat `tools/bench/stats.ts`.
- Size: about 35 lines deleted, about 80 removed by the shared opener. Risk: low. Proof: `bun run bench-smoke`, `bun run bench-edit`.

### 18. Renderer: four names for a screen point, three for a lon/lat pair

- Where: `packages/renderer/src/snap.ts:10-11` (`Point`, `Loc`), `midpoints.ts:18-20` (`ScreenPoint`, `LonLatPoint`), `field-overlay.ts:35-37` (`LonLat`, `Point2`), `transform.ts:12-13` (`Loc`, `XY`), and `type Point` again in `apps/maid/src/components/MapView.tsx:53`.
- Simpler: keep `Point` and `Loc` from `snap.ts` (the engine already imports those), export them from the package index, delete the others. `Point2`/`XY` are tuples in metres or pixels, not `{x, y}`: one `XY` tuple for both.
- Size: about 10 lines, less to hold in mind. Risk: very low. Proof: `bun run type-check`.

### 19. Docs that no longer match

- `AGENTS.md` layout: missing all seven `packages/module-*`, `tools/fixtures`, `tools/maplibre-repro`, `tools/ports.ts`, `patches/`. The scripts table matches `package.json` (every user-facing script is there; `test-run`, `lint`, `format`, `dev:*`, `refs-serve:*` are internal).
- `packages/ui/README.md`: the table stops at the shell. Not listed: `Flyout`, `ContextMenu`, `BottomSheet`, `InfoPopover`, `FilterPanel`, `Time`, `PresetFields`, `PresetPicker`, `AddField`, the settings store and favourites, which are most of the package now. Under "Open": "The dock's views and the top bar's tools are fixed by the app. They become extension points when the first module needs them" is done (`dock.view`, `topbar.panel` in `extension-points.ts`); "step C1" names a step of a plan that is closed.
- `apps/maid/src/maid.config.ts:83`: the comment "to use the example changes, replace the line above with this one" stands above `filters: defaultFilters`; the line it meant is gone.
- `packages/module-notes/src/notes.tsx:20-25` tells the app to special-case its layers (see 12).
- `GEOMETRY_LABEL` is declared in `apps/maid/src/components/Inspector.tsx:30-36` and `StackPicker.tsx:12-18`: one copy in `apps/maid/src/selection.ts` or next to the presets.
- Size: docs only, plus 7 lines. Proof: reading.

### 20. Small exports nothing uses

Confirmed with a word grep over `apps packages tools docs`:

| Export | Only used by |
| --- | --- |
| `useResolvedTheme` (`packages/ui/src/theme.ts:42`) | nothing but the index |
| `MAX_FAVOURITES` (`packages/ui/src/favourites.ts:22`) | nothing but the index |
| `hookStability`, `declaredHooks` (`packages/core/src/hooks.ts:82,87`) | their test and the README |
| `currentStack` (`apps/maid/src/stack.ts:65`) | its test |
| `toIdUrl` (`apps/maid/src/url/id-url.ts:101`) | its tests; `docs/architecture/08-url-state.md:41` plans "Open in iD" with it |
| `cellBox` (`packages/module-notes/src/model.ts:65`) | its test |
| `applySignTagChanges`, `SignTagChanges` (`packages/module-traffic-signs/src/tag-changes.ts`) | the fallback field only (see 2) |

- The extension point `map.layer` has one user (`apps/maid/src/modules/scene-bounds.ts:40`); everything else uses `map.content`. Scene bounds as a `map.content` component would let `MapLayerItem`, `MapLayerProps` and half of `ModuleLayers.tsx` go (about 25 lines). Not confirmed that no doc promises `map.layer` to forks: `docs/extensibility-plan.md` should be read first.
- No hook is declared outside `packages/core/src/test-fixtures.ts` (`declareHooks` has no caller in apps or modules). The hook system is public API by design, so I only note it.
- About 70 exports are `export`ed but used only inside their own file or their own test (list from a script, not from knip; knip is not installed). Removing the keyword is mechanical and can wait for knip.
- `tools/refs/id/serve.ts` and `tools/refs/rapid/serve.ts` share about 60 of 85 lines (`createHandler`: request log, static mounts, bench config).
- Size: about 60 lines. Risk: very low. Proof: `bun run check`.

## Looked at and fine

- **Icons**: only four files hold an inline `<svg>` (`ResizeHandle`, `ModeButtons`, `CheckBox`, `PresetIcon`, plus the ruler in `Row.tsx`); the rest are heroicons. No icon is defined twice.
- **`toolButtonClass` / `toolButtonTone`**: used by every top bar trigger and every selected-state button I found; no pasted copy of those strings. Only three long class strings repeat across files (the combo list popup in `AddField.tsx:130`, `Multi.tsx:441`, `Combo.tsx:181` is the one worth a constant).
- **Field components**: all take `FieldProps`, all fall back to `FallbackField` when `field.key` is undefined, all write `undefined` for an empty value through `cleanValue`. The differences are the ones in findings 2 and 10. Each has a headless `*-logic.ts` with tests.
- **Mouse and touch in MapView**: one `press`, `release`, `movePointer` for both; not duplicated.
- **Effects**: about 30 `useEffect` in apps and packages. All subscribe to something outside React (map events, window keys, requests) or move the focus. I found no effect that copies props to state and no state that could be derived, except the "render counter on map move" in `StackPicker.tsx:64-74` and `module-street-imagery/src/map.tsx:30-45`, which finding 13 covers.
- **Arrows as line patterns**: no leftover of symbol-placed arrows; the one `symbol-placement: 'line'` in `layers.ts` is the road label.
- **Old filter bar, fake login**: nothing left that I could find (`FilterBar`, `fake`, `mock login` have no hit outside tests).
- **`TODO` / `FIXME`**: none in apps, packages or tools.
- **`any`**: none in apps and packages outside tests; all of it is in `tools/bench` (finding 16). The four `as unknown as` casts (`save.ts:38`, `layers.ts:110`, `style/resolve.ts:36`, `data-layers/geojson.ts:31`) each have a comment and a reason.
- **Benchmark switches in `config.ts`** (`fill`, `labels`, `icons`, `pins`, `workers`, `tolerance`, `sourceMaxZoom`, `fade`): each is read somewhere; none is dead.
- **`cleanValue` in `apps/maid/src/save/clean-tags.ts:18` and in `packages/ui/src/inspector/logic.ts:16`**: same name, different jobs (iD's cleanup on upload against trimming a draft). Rename one; do not merge.
- **`apps/maid/src/favourites.ts` against `packages/ui/src/favourites.ts`**: the app file is thin glue over the ui's pure functions, not a copy.
- **`Tags` and `Geometry` declared in filters, presets, style, validation**: these packages have no dependency on each other on purpose; a shared types package for two one-line types is not worth it.
- **READMEs of core, filters, journal, operations, presets, validation, module-surface, module-street-imagery, module-traffic-signs**: every identifier in backticks still exists in the code (checked by script). I did not read them for wrong statements beyond that.

## Not looked at

- `packages/renderer/src/layers.ts` and `build.ts` in detail (only the outline: `buildMainLayers` is one 540-line function with clear section comments, a split per section into `layers/{areas,lines,vertices,points,labels}.ts` is the obvious seam, not verified).
- `packages/presets/src/presets.ts` (882 lines), `changes.ts` (640), `packages/operations/src/operations.ts` (794), `packages/journal`, `packages/filters/src/default.ts`: only scanned for duplicate helpers.
- `apps/compare`, `tools/mock-osm-api`, `tools/refs/*/smoke.ts` and the adapters.
- Props that nobody passes: not checked component by component.
- Nothing was run: no `bun test`, no `type-check`, no knip (not installed).
