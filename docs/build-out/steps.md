# Build-out: from proof of concept to editor

Started 2026-10-12. Iteration 1 showed that MapLibre can render and edit OSM data fast enough ([report](../iteration-1/report.md)). This plan moves the app onto the new base, [`maid-model`](../../packages/model/README.md) and [`maid-core`](../../packages/core/README.md), and then builds the editor on it, one step at a time.

## How the steps work

- A step is about one hour of orchestrated work and ends in one commit (or a few, if it has clear parts).
- Every step ends with **one thing for Tobias to test**, written under the step when it is done. The next step starts after he has looked at it, unless he says to run ahead.
- `bun run check` passes after every step. Steps that touch loading, drawing or editing also run `bun run bench-smoke` and compare with the run before; a clear regression stops the step.
- Work is handed to subagents as [AGENTS.md](../../AGENTS.md) describes: Haiku at high effort by default, one folder per agent, a command that proves "done".
- The order can change. A step that turns out to be two is split here, not stretched.

Decisions the steps rest on are in [docs/architecture](../architecture/README.md).

## Part A: the app on the new base

- [x] **A1. The model loads fast enough.** Geometry is computed on first access and not on load (the agreed departure from Rapid). The load time is measured in Chrome, not only in Bun.
  Result (2026-10-12): loading the dense scene into the model in Chrome went from 587 ms to 211 ms; the proof-of-concept store needs about 30 ms there. Geometry of nodes, ways and relations is deferred; 1540 tests pass, one of Rapid's tests was adjusted because it encoded a side effect of computing geometry on load. The largest remaining part is the parser (about 90 ms), which builds an intermediate object per element. Not done: sharing parent sets between graphs (the agent could not prove it safe). Numbers move by up to 20% between runs. Details in the [data store chapter](../architecture/05-data-store.md).
  **Test for Tobias:** run `bun run bench-model`. It prints one line per scene; `total` for `dense` should be around 210 (it was 587 before this step), and `poc` is the old store for comparison.
- [ ] **A2. The renderer draws from the model.** Data from the API goes into `EditHistory` and its graph. The feature builder reads entities from the graph. The proof-of-concept store is deleted. Nothing is editable through the model yet; dragging keeps working through a thin bridge.
  Test: open the app; every scene looks as before. The benchmark numbers are next to the old ones.
- [ ] **A3. Edits go through the history.** Dragging a vertex and changing a tag are actions on the staging graph, committed on release. The renderer redraws from the `Difference`. Undo and redo with buttons and keys.
  Test: drag a vertex, change a tag, press undo twice, redo once.
- [ ] **A4. The app is built with `createEditor`.** `apps/maid` becomes a config object plus a shell. Model, history and renderer hang on the editor. The first two extension points exist with one real use each: inspector section and map layer. A demo module in the app proves both.
  Test: the app works as before; switching the demo module off in the config removes its section and its layer.

## Part B: an editor people can use

- [ ] **B1. The shell.** Top bar, sidebar, map controls and the bottom dock from Tailwind Plus components; light, dark and system theme.
  Test: look at it in both themes; say what is wrong.
- [ ] **B2. Presets.** Preset matching on the tagging schema; the inspector shows the preset with icon and name, its fields (text, number, combo, check, and the plain-text fallback for the rest) and the raw tag editor below. The schema lookup of the model gets its real presets (`matchTags`, area keys).
  Test: select a café, a residential road and a building; fields and names are right; edit one field and undo.
- [ ] **B3. Modes and new points.** A mode system (browse, select, add point, drag). Add a point with a preset, delete an object, with the keys people know from iD.
  Test: add a bench, tag it, delete a tree, undo both.
- [ ] **B4. Drawing lines and areas.** Draw, continue and close, with snapping to nodes and ways.
  Test: draw a footway that connects to a road, and a building.
- [ ] **B5. Operations.** The edit menu and its shortcuts on top of the ported actions: move, rotate, split, merge, reverse, straighten, square, circularise, disconnect, extract, copy and paste.
  Test: square a building, split a road, merge two ways.
- [ ] **B6. Relations.** Membership list in the inspector, add to and remove from a relation, multipolygons draw correctly while edited. Turn restrictions come later.
  Test: add a way to a route relation and remove it again.
- [ ] **B7. Filters.** Filters as ordered config data with three states: editable, read-only, hidden. A filter panel in the UI, state in the URL.
  Test: hide buildings, make them read-only, reload the link.
- [ ] **B8. Validation.** The rule engine and a first set of rules ported from Rapid; issues in the inspector and in a pane; fixes as actions.
  Test: create a disconnected way and a crossing without a node; both are reported and one fix works.

## Part C: keeping and sending work

- [ ] **C1. Unsaved work survives.** A journal of edits in the browser (Dexie), restored on reload, safe with two tabs. Settings with the agreed precedence (default, config, stored, URL, user).
  Test: edit, reload, the edits are back; decline the restore once.
- [ ] **C2. Login and upload, locally.** `osm-oauth` and `osm-changeset` behind the config; the save flow with changeset comment, hashtags and review of changes; conflicts reported. Uploads go to a local stand-in only. This needs one decision first: core rule 1 says the mock API rejects writes, so either the mock gets an in-memory write mode for tests, or a second local tool does it.
  Test: save three edits against the local stand-in and read the changeset it received.
- [ ] **C3. Live data, by hand.** The opt-in mode against the real API for a person: reading first, then saving to the dev API. Never from automation.
  Test: Tobias loads his neighbourhood and saves one edit on the dev server.

## Part D: core modules and the first fork

- [ ] **D1. Backgrounds.** `maid-module-imagery` on `maplibre-editor-layer-index`: background list, overlays, offset.
- [ ] **D2. Street-level photos.** `maid-module-street-imagery` on the existing packages, with the viewer in the dock.
- [ ] **D3. Notes and data layers.** OSM notes; user GeoJSON, PMTiles and vector tiles.
- [ ] **D4. Tasks.** The task extension points and `maid-module-maproulette`.
- [ ] **D5. Lenses and user styles.** A second prepare step, style export and import.
- [ ] **D6. Radnetz Berlin as an app.** `apps/radnetz-berlin`: a config and its own modules, with no change to a package. This is the measure of success from the [extensibility plan](../extensibility-plan.md).

Each of these gets its test line when it is planned in detail.

## Not planned yet

Translations, the walkthrough, turn restrictions, GPX, measurement and history panels, keyboard shortcut help, the published npm packages and their release routine. They are listed so that nobody assumes they are covered.

## Log

Results are written under the step. Longer findings go to `docs/research/`, decisions to `docs/adr/` or the architecture chapters.
