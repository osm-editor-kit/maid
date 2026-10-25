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
      **Test for Tobias:** run `bun run bench-model`. It prints one line per scene; `total` for `dense` was around 210 at the end of this step (587 before it). Since the review at the end of part A the script times only the path the app uses (`entities` and `merge`), and `total` for `dense` is around 180.
- [x] **A2. The renderer draws from the model.** Data from the API goes into `EditHistory` and its graph. The feature builder reads entities from the graph. The proof-of-concept store is deleted.
      Result (2026-10-12): done. All three scenes match the state before in a pixel and count comparison (`bun run check-render a2-before`). Benchmark before and after, two runs each: loading, panning, zooming, hover and vertex drag are within run-to-run noise (load of the dense scene 1.2 to 1.3 s before, 1.3 to 1.5 s after; drag stays at 60 fps). **Memory is up by 20 to 30%** (dense scene 66 MB to 84 MB of JS heap), because entities are heavier than the plain objects before. Moving a vertex and changing a tag already go through the history, so A3 is only undo and redo. Entities are created straight from the API's JSON (`entitiesFromOsmJson`), and the history runs without a spatial index, so loading computes no geometry.
      **Test for Tobias:** `bun run dev`, then open <http://localhost:5173/?scene=dense>, <http://localhost:5173/?scene=medium> and <http://localhost:5173/?scene=small>. Everything should look and feel as before: pan, zoom, hover, select, drag a vertex, change a tag.
- [x] **A3. Edits go through the history.** Dragging a vertex and changing a tag are actions on the staging graph, committed on release. The renderer redraws from the `Difference`. Undo and redo with buttons and keys.
      Result (2026-10-12): done. One redraw path for edits, undo and redo, driven by the entities in the history's difference. Buttons at the top centre with the name of the step in their tooltip; Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and Ctrl+Y, not while typing in a field. `bun run check-undo` moves a vertex, changes a tag, undoes twice and redoes, and compares the data and what the map shows after every step (42 checks, small and dense scene). Only changes to existing objects are handled; creating and deleting comes with B3.
      **Test for Tobias:** open <http://localhost:5173/?scene=small>, drag a vertex of a road, select the road and change its `name`, then press Cmd+Z twice and Shift+Cmd+Z once. The road and the tag list should follow each step, and the tooltip of the undo button should name it.
- [x] **A4. The app is built with `createEditor`.** `apps/maid` is a config object plus a shell. Model, history and renderer hang on the editor. The first two extension points exist with one real use each.
      Result (2026-10-12): done. `createEditor` owns the data (`editor.context`, `editor.history`); the engine is given the editor. [`apps/maid/src/maid.config.ts`](../../apps/maid/src/maid.config.ts) lists the modules. Two extension points: `map.layer` (declared by the renderer, drawn by `ModuleLayers`) and `inspector.section` (declared by the app for now; it moves to the UI package when there is one). Two modules in `apps/maid/src/modules/` use them and import nothing from the app except the section's type: `elementInfo` (id, version and upload state of the selected object) and `sceneBounds` (outline of the area the fixture covers). The fixtures carry only the version, so changeset, user and timestamp show a dash. Found while doing it: a module that fills `inspector.section` needs that type from the app, which is the reason the point has to move into a package before the first external module.
      **Test for Tobias:** open <http://localhost:5173/?scene=small> and select a road: below the tags there is a section "Element". Zoom out until the dashed outline of the data area shows. Then comment out the two module lines in `apps/maid/src/maid.config.ts`, one after the other: the section and the outline disappear without a reload of your own, everything else keeps working.

Review after part A (2026-10-12): the switches of the iteration-1 experiments are gone from the engine and the URL (`update`, `edit`, `highlight`, `serial`, `coalesce`; the engine always sends diffs to twin sources and highlights with feature state). A tag change on a vertex no longer rebuilds the ways that use it. An entity creates its geometry object and its cache on first use, which takes about 16% off the JS heap of the dense scene after load (measured by the agent, three runs each, not repeated). `bun run bench-model` times only the load path the app uses. `bun run check-render` tolerates the one or two on-screen features that differ between runs of the same code.

## Part B: an editor people can use

- [x] **B1. The shell.** Top bar, sidebar, map controls and the bottom dock from Tailwind Plus components; light, dark and system theme.
      Result (2026-10-12): done. New package [`maid-ui`](../../packages/ui/README.md) with the layout and its pieces; the app fills them in `apps/maid/src/App.tsx`. The sidebar is always there (with a hint when nothing is selected) and no longer floats over the map, so the map is narrower by 320 px; the render reference for the new layout is `b1`. Undo and redo sit in the top bar, the theme switch at its right. The dock has one view, "Data" (what is loaded and from where), and is closed at first. The theme is kept in the browser and follows the system setting live when set to "system". `inspector.section` moved from the app into `maid-ui`, so a module no longer imports a type from the app. `ui=0` still shows the map alone. Not done: the map itself has no dark variant (iD's colours on black, as before), nothing collapses the sidebar, and the layout is not made for phones.
      **Test for Tobias:** open <http://localhost:5173/?scene=small>, switch between the three themes at the top right, select a road, open "Data" at the bottom. Say what looks wrong or is in the wrong place.
- [x] **B2. Presets.** Preset matching on the tagging schema; the inspector shows the preset with icon and name, its fields (text, number, combo, check, and the plain-text fallback for the rest) and the raw tag editor below. The schema lookup of the model gets its real presets (`matchTags`, area keys).
      Result (2026-10-12): done. New headless package `maid-presets`: iD's matching (scores, wildcards, `addTags`, index by geometry and first key, generic fallback), field resolution (inheritance, templates, geometry and prerequisite filters), English names and option labels, area keys; 25 tests against the real data of `@openstreetmap/id-tagging-schema`. The presets are part of the editor's config (`presets: defaultPresets`), so a fork can pass a changed set; `editor.presets` serves the renderer (pin icons, the inspector's preset) and the model's schema lookup. The simplified matcher and its generated preset list in `maid-style` are removed. Field components are in `maid-ui` (`PresetFields` with a table from field type to component, ready to become the field-type extension point). Checked in the browser: Enter and leaving a field apply, an empty field removes the tag, Escape restores without deselecting, "not set" in a choice removes the tag, fields and tag list follow each other and undo and redo; text typed in one field survives a change to another. Cost: creating the presets takes about 12 ms at start, 50,000 icon lookups 13 ms; the render check against `b1` passes. The JavaScript bundle grows by the schema data (about 760 kB of JSON before compression).
      Not done, in order of how much it will be missed: fields whose key is a prefix (`payment:*`, multi-selects), language variants of `name`, `locationSet` (country-specific presets and fields show everywhere), fields for several keys only show the keys that have a value (address, access), a field from "more fields" disappears when its value is removed, Rapid's rulesets for the model's area check are not loaded (matters from B3 on), and names are English only.
      **Test for Tobias:** open <http://localhost:5173/?scene=small>, select a café or shop, a residential road and a building. Are name and fields what you expect from iD? Change a field, see the tag list follow, undo.
- [x] **B3. Modes and new points.** A mode system (browse, select, add point, drag). Add a point with a preset, delete an object, with the keys people know from iD.
      Result (2026-10-12): done. The engine has a mode (`browse`, `add-point`; drawing adds its own in B4) and three new edits, each one undo step: `addPoint`, `deleteEntity` (iD's rules: a way takes along the nodes nothing else uses, a node leaves its ways) and `setTags`. All edits, undo and redo now share one path that redraws from the history's differences, including created and deleted entities and the vertices of a way that came or went. The renderer's lookups (ways per node, way ends, multipolygon members) follow every change of the history, which closes the finding from the review after part A. Top bar: "Point" (key 1) and delete (Cmd/Ctrl+Backspace or Delete); Escape leaves the mode first, then the selection. A new point is selected at once and the sidebar asks for its type: a search over iD's presets with icons (name, alias, term, tag value; iD's ranking without the fuzzy tier), keyboard-driven. "Change feature type" does the same for an existing feature and swaps the old preset's tags for the new one's. New check `bun run check-edit` (20 checks on the small and the dense scene): data, lookups and the map's sources after add, change, delete, undo and redo. Found while testing in the browser: a new point without tags was not drawn; points added here are now always drawn.
      Not done: deleting does not ask or warn (iD warns about large deletions and relations), nothing is selected by a box or with Shift, a point cannot be dragged (only vertices), and Rapid's rulesets are still not loaded.
      **Test for Tobias:** open <http://localhost:5173/?scene=small>, press 1, click the map, type "bench", Enter. Select a tree and delete it. Undo both with Cmd+Z, twice each as needed.
- [x] **B4. Drawing lines and areas.** Draw, continue and close, with snapping to nodes and ways.
      Result (2026-10-12): done. Drawing works as in iD: the way is real data in the history's work in progress and its last node follows the pointer, so the preview (line, fill, later the look of its tags) comes from the normal redraw at the speed of a vertex drag. A click fixes the node and adds the next. Snapping within 8 px: onto an existing node (the node is reused), onto the line of a way (a new node is inserted there), not onto the fill of an area. A line that starts on the end of exactly one existing line continues that line. Finish with Enter, a click on the last node (a double click does that) or, for an area, on the first node; Escape drops everything. One undo step per way ("Added a line", "Added an area", "Continued a line"); undo and redo are blocked while drawing. Top bar: Line (2) and Area (3). The finished way is selected and the sidebar asks for its type. For tools and the operations of B5 the engine has a public `change(step)`: run actions, commit or revert inside, and what changed is redrawn. New check `bun run check-draw` uses real key presses and clicks (15 checks). Found by it: a click inside an area snapped to its outline; fixed.
      Not done: Backspace to take back the last node, a visible mark on the node or way that will be snapped to, snapping to the middle of the way being drawn, and the check runs on the small scene only (the others have no open ground in view).
      **Test for Tobias:** open <http://localhost:5173/?scene=small&map=19/52.389/13.4>. Press 2, click three times, end one click on a road, press Enter and choose "Footway". Press 3, draw a building, close it on its first node, choose "Building". Undo both.
- [x] **B5. Operations.** The edit menu and its shortcuts on top of the ported actions: move, rotate, split, merge, reverse, straighten, square, circularise, disconnect, extract, copy and paste.
      Result (2026-10-12): partly done; the interactive ones are open. New headless package [`maid-operations`](../../packages/operations/README.md): eight operations (reverse V, split X, merge C, straighten S, square Q, make round O, disconnect D, extract E) as data and functions on the graph, each with iD's rule for when it is offered, a sentence for why it cannot run now, and one undo step (29 tests). They reach the editor through a new extension point, `edit.operation`, filled by `operations(defaultOperations)` in the config. The sidebar shows the ones that apply to the selection as an "Edit" menu with their keys; one that cannot run is grey and says why. Several features can be selected with Shift-click (the URL holds `id=w1,w2` as in iD), which merge needs. New check `bun run check-ops` (13 checks, small and dense scene): square a building, split a road at a vertex, merge the parts, undo, with data and map compared after each step. Found by it: the selection after a split did not contain the new way, because its id is only known after the action ran; the contract now asks for the selection with the resulting graph.
      **Not done:** move (M), rotate (R), reflect, copy and paste: they need the pointer or a clipboard and are the next step for this part. Also open: merging a point into a line or area, selecting with a box, and a context menu on the map.
      **Test for Tobias:** open <http://localhost:5173/?scene=small&map=19/52.389/13.4>. Select a building and press Q. Select a vertex in the middle of a road and press X. Shift-click both parts and press C. Undo all three.
- [x] **B5b. Move, rotate, reflect, copy and paste, and iD's keys and gestures.** The operations of B5 that need the pointer or a clipboard: move (M) and rotate (R) as modes that follow the pointer, reflect, Cmd+C and Cmd+V. With it a pass over keyboard, mouse and touch against iD ([comparison](../research/interactions-vs-id.md)).
      Result (2026-10-12): done. M moves and R rotates the selection with the pointer, a click puts it down, Escape puts it back; both are in the edit menu too. T and Y flip along the long and the short axis (two more operations in `maid-operations`). Cmd/Ctrl+C copies, Cmd/Ctrl+V pastes with the middle of the copy at the pointer. Keys are registered with TanStack Hotkeys (`packages/shell/src/useShortcuts.ts`) and follow iD: while drawing, Space places a node at the pointer, Enter **and Escape** finish (Escape dropped the way before), Backspace takes back the last node, Delete drops the way; A continues the selected line; arrow keys pan, + and - zoom. Fixed from Tobias's test: a double click that closes a drawn area no longer zooms; Shift-click works because MapLibre's Shift-drag zoom is off; the nodes of a selected way are shown, can be picked, selected and dragged (areas had no draggable nodes); standalone points can be dragged; a double click on the line of a way adds a node there. One finger drags a node on a touch screen. New check `bun run check-interactions` with real mouse, key and touch events (19 checks).
      Not done, from the comparison: a dragged node is not connected to the node or way it is dropped on, no midpoints to drag, no edit menu on right click or long press, no lasso (Shift-drag), Alt does not switch snapping off while drawing, and the layout is not made for phones yet.
      **Test for Tobias:** open <http://localhost:5173/?scene=small&map=19/52.389/13.4>. Draw an area and close it with a double click. Select a building, drag a corner, press M and move it, R and turn it, Cmd+C, Cmd+V. Shift-click two roads.
- [x] **B6. Relations.** Membership list in the inspector, add to and remove from a relation, multipolygons draw correctly while edited. Turn restrictions come later.
      Result (2026-10-12): done. Relations are a module (`apps/maid/src/modules/relations.tsx`) with two inspector sections: "Members" for a selected relation (select a member, change its role, remove it; the first 50) and "Relations" for any feature (its memberships with role and remove, and "Add to a relation" with the relations that are loaded). The module edits through `editor.history` alone, which works because the engine now redraws every change of the history, not only its own; `engine.change` groups several changes into one redraw. A section is given `select` to jump to another entity. The area of a multipolygon is rebuilt when a member way or one of its nodes changes. Relations can change their tags and feature type like nodes and ways (they were read-only). Browser checks share their page setup in `tools/bench/check-page.ts`; new check `bun run check-relations` (12 checks on the dense scene; the small one has no multipolygon in view and skips that part).
      Not done then: reordering members, creating a relation, the member list beyond 50, relations that are not loaded cannot be chosen, and turn restrictions. The first three were built later (Part F); the members moved to the relation column on 2026-10-17.
      **Test for Tobias:** open <http://localhost:5173/?scene=small&id=w1425553512> and scroll the sidebar to "Relations": remove the road from the bus route, undo, then change its role. Click the route's name to see its members.
- [x] **B7. Filters.** Filters as ordered config data with three states: editable, read-only, hidden. A filter panel in the UI, state in the URL.
      Result (2026-10-12): done, as [the filters chapter](../architecture/06-filters.md) proposes. New headless package [`maid-filters`](../../packages/filters/README.md): a filter is a rule (tag conditions as data, a function where needed) and a starting state; the first match decides; iD's 17 categories are the default list with iD's ids (53 tests; 200,000 decisions take 26 ms). Filters are part of the editor's config (`filters: defaultFilters`). The feature builder asks them: a hidden object gets no feature, so it is not drawn, hit, snapped to or held in the map's memory; a read-only one is drawn and can be selected, but tag changes, deleting, dragging and operations are refused and the sidebar says why. A vertex goes with its ways. Changing a state builds all features again from the data without loading anything. The dock has a "Filters" view with a three-way switch per filter, the number of hidden objects, a mark on what differs from the editor's defaults and "Reset". The URL keeps what differs (`filters=buildings:readonly,boundaries:hidden`); iD's `disable_features` is read as hidden. New check `bun run check-filters` (10 checks). Load time and frame rates on the dense scene are unchanged with the default filters (load 1.2 s, 60 fps).
      Not done: read-only features look like the others on the map (the chapter leaves that open), the selected feature is not kept when its filter hides it, an untagged outline of a multipolygon does not take the relation's filter, the render-stage filters of the chapter (search, "only my changes") do not exist yet, and snapping still reaches read-only features.
      **Test for Tobias:** open <http://localhost:5173/?scene=small>, open "Filters" under the map, hide buildings, then make them read-only and try to change one. Reload: the link kept your choice.
- [x] **B8. Validation.** The rule engine and a first set of rules ported from Rapid; issues in the inspector and in a pane; fixes as actions.
      Result (2026-10-12): done. New headless package [`maid-validation`](../../packages/validation/README.md): a validator that runs rules over the entities it is given, and three rules ported from Rapid: missing tags, a road that is not connected, and two ways that cross without a junction (26 tests; five ways against 5,000 take about 2 ms). An issue is a sentence, its entities, a place and fixes; a fix is a list of actions and becomes one undo step. The editor uses it through a module (`validation({ rules: defaultRules })` in the config): after every finished edit, undo and redo it checks what was changed here, and only that. The issues show in a new inspector section and in a dock view "Issues", where a click selects the feature. For that the dock got its extension point, `dock.view`. New check `bun run check-validation` (8 checks, small and dense scene): a footway across a road is reported twice, "Connect the features" resolves both, undo brings them back. Found by it: the lists did not follow the validator, because the React Compiler memoised the read; the hook now passes a version, as `useEngine` does.
      Not done: only three rules, no issues on the map itself (no marker at the place), no counter on the "Issues" tab, nothing is checked before saving because there is no saving yet, and the texts are English only.
      **Test for Tobias:** open <http://localhost:5173/?scene=small&map=19/52.389/13.4>, press 2 and draw a line across a road without clicking on the road, choose "Footway". Open "Issues" under the map: the crossing and "not connected" are listed. Click "Connect the features".

## Part B2: the UI pass

Asked for by Tobias on 2026-10-12 after testing part B. One item per step, a review in between.

- [x] **U1. Right click.** The edit menu at the pointer as in iD: on a feature (selects it first), on a selection, on open ground ("Paste"), by long press on a touch screen; not while drawing.
      Result (2026-10-12): done. `ContextMenu` in `maid-ui`; the sidebar's edit menu, the right-click menu and the keys share one list of commands (`apps/maid/src/commands.ts`). Covered by `bun run check-interactions` (26 checks now).
- [x] **U2. The inspector's head.** First row in iD's style for the feature (icon, name), a click on it changes the feature type in the panel that slides in as now. The line with geometry and id goes behind it. Third row: the edit commands as icon-only buttons in a button group, the same as on right click, each with a tooltip that shows what it does and its key.
      Result (2026-10-12): done. The head is one button with the preset's icon, the name and "type · nodes · id"; it opens the type search below it. The edit commands are a bar of iD's operation icons (`CommandBar`), the same list as on right click; the tooltip names the command, its key, and why it cannot run.
- [x] **U3. Tooltips and motion.** A tooltip component with Motion for React as in tilda-geo; panels animate as there.
      Result (2026-10-12): `Tooltip` in `maid-ui` (Floating UI for the place, Motion for the animation, tilda-geo's spring), used by the top bar, the map controls and the command bar. The dock opens and closes animated. Not done: the sidebar's content does not animate yet (`FadeSlideIn` is there for it).
- [x] **U6. Resizable panels.** Sidebar width and dock height can be dragged, in tilda-geo's style.
      Result (2026-10-12): done with tilda-geo's handle and pointer capture: the sidebar between 280 and 640 px, the dock up to 70% of the window; a double click resets, the size is kept in the browser. Not checked by a person in a browser yet: that the map follows while dragging.
- [x] **U4. "Element" as a disclosure.** The element's properties stay in the sidebar (not a floating panel as in iD) but fold away.
      Result (2026-10-12): done. An inspector section can say `disclosure: 'open' | 'closed'`; "Element" starts folded.
- [x] **U5. No footer bar.** The status line at the bottom goes; what matters from it moves elsewhere (zoom hint, data source, attribution).
      Result (2026-10-12): done. "Zoom in to load data" is a pill on the map, the attribution sits in the map's corner, zoom and data source are in the dock's "Data" view. `StatusBar` is gone from `maid-ui`. The render reference for this layout is `u5`.
- [ ] **U7. Fields one by one.** Every field type of iD's sidebar: read its behaviour in iD, write the spec down, rebuild it in Maid.
      Spec (2026-10-12): [docs/research/fields-vs-id.md](../research/fields-vs-id.md): all 29 field types of the schema with iD's behaviour, Maid's state and a build order of 20 steps.
      Done so far: step 1 (each field's row has "remove" and, when it differs from the loaded value, "revert"; values are trimmed, normalised and cut to 255 characters; a counter near the limit; "Unknown" as placeholder), step 4 (check fields are a three-state box; `defaultCheck` has no "No"; one-way shows what the road type implies), and multi-line fields are a real text area. The fields are one file per family under `packages/ui/src/inspector/fields/`.
      Also done: step 3 (combo: a real list with iD's keys, labels shown and values written, snake case and lower case by the field's settings), step 5 and 11 (number with steppers, `minValue`, decimal comma, compass words for directions; speed with km/h or mph; height in metres or feet and inches), steps 6 and 7 (url and identifier with an open button, email, tel with its several keys, date with picker and "set to today", colour with a swatch and picker). Seen working in a headless browser for combo, number and check; the date and colour pickers and the open buttons were not exercised.
      Also done (2026-10-13): step 2 (an "Add field" input under the rows offers the preset's further fields and the general ones; a picked field shows at once and gets its default), steps 8 and 9 (values as chips: `semiCombo` joined with `;`, `multiCombo` as `key:value=yes` with a yes/no toggle, `manyCombo` over its keys; the bug that wrote a tag named `payment:` is gone), step 10 (radio as a group of buttons without free text; structure with the layer for bridge and tunnel) and step 13 (access: one row per mode with the implied value as placeholder). Seen working in a headless browser: adding a cuisine twice with the focus kept, "Add field", choosing "Bridge" (writes `bridge=yes`, `layer=1`), the access rows.
      Open: steps 12 (directionalCombo), 14 (localized), 15 (address), 16 (one-way reverse), 17 (locked fields), and 18 to 20, which need the decisions in section 5 of the spec (taginfo suggestions, the info button, Wikidata, restrictions). Known gaps: remove and revert on a field with several keys make one undo step per key; the default unit of speed and height does not follow the country; no inline autocomplete in the combo; the bridge and tunnel type combo is not wired; access labels and options are fixed English lists; "related tags below their field" (Radnetz feature 25) is not started.
- [x] **U8. Foreshadowing.** A preview of the result on the map while a command is hovered (make round, square, flip, ...) and iD's helper lines, in iD's look, a little modernised.
      Result (2026-10-12): the preview is done. While the pointer or the focus is on a command in the sidebar's bar or in the right-click menu, the map shows the outline the selected ways would get (square, make round, straighten, flip, ...), dashed in iD's selection red on a light glow. Nothing is changed for it: the operation runs on a copy of the graph (`engine.previewOperation`). Commands that move no node show nothing. Checked in `bun run check-ops`. Not done: helper lines (the axis of a flip, the centre of a rotation); iD at the pinned commit was not found to draw such a preview, so the look is Maid's own.
      Test for Tobias: select a building, move the pointer over "Make round" and "Square" in the sidebar, then choose one.
- [x] **U9. Phones.** The layout for small screens as tilda-geo does it: the properties panel behind a button at the bottom right, and so on.
      Result (2026-10-12): done in `maid-ui`. Below 640 px (`useBreakpoint('sm')`) the sidebar is a `BottomSheet` (Motion, drag down to close, Escape) behind a round button at the bottom right; it opens when something is selected. The top bar's tool buttons lose their text there and the middle scrolls sideways; buttons are 40 px on touch screens. On the desktop the sidebar's content fades in when its kind changes. Seen in a headless phone-sized browser, not on a real phone. Not done: focus does not move into the sheet; the sheet and the inspector each have a close button; no backdrop (the map stays usable).
      Test for Tobias: open Maid on a phone or at 375 px, tap a road, drag the sheet down, open it again with the button.
- [x] **U11. Direction arrows on lines.** iD draws arrows along one-way roads, waterways and other ways with a direction, and on the selected way. Read how iD decides and draws them and do the same.
      Result (2026-10-12): done. `direction.ts` in the renderer has iD's rules: `oneway` yes, -1, reversible and alternating, and the tags that imply a direction (motorway, roundabout, rivers and streams, aerialways, ...). Arrows every 36 px along the line as in iD, turned for -1, double-headed for both ways, lighter on rail and pedestrian ways; side markers for cliffs, coastlines, retaining walls and the like. From zoom 15, off with `icons=0`. Not done: iD also shows the arrows on any selected way; closed sided ways (a coastline ring) get no markers; the side markers were not compared with iD on screen.
      Test for Tobias: look at a one-way street and a stream on the dense scene; the arrows point along the direction of travel or flow.
- [x] **U12. Flyouts.** Large panels with an arrow and a shadow, in the look of Tailwind Plus's flyout menus, tried as a pattern: the feature type, the filters (out of the dock, a button at the right of the top bar), and an account button that holds log in, log out and light or dark.
      Result (2026-10-12): done. `Flyout` in `maid-ui` (Floating UI for place and arrow, Motion for the animation). The feature type opens to the right of the inspector's head with larger rows; "Filters" is a button at the right of the top bar with a count of what differs; the account button next to it is a stand-in until C2 (it talks to no server) and holds the theme switch. The dock keeps "Issues" and "Data".
      Test for Tobias: open "Filters" and hide buildings; select a feature and click its head; open "Log in" and switch to dark.
- [ ] **U10. Component library.** Fewer components with a smaller surface, shared between their uses.

## Part C: keeping and sending work

- [x] **C1. Unsaved work survives.** A journal of edits in the browser (Dexie), restored on reload, safe with two tabs. Settings with the agreed precedence (default, config, stored, URL, user).
      Test: edit, reload, the edits are back; decline the restore once.
      Result (2026-10-12): done. `maid-journal` writes one record per edit to IndexedDB (Dexie), with the base state of what the edit touched, so a restore works before the data is loaded. On load the app asks "Restore your edits?" over the map (`RestorePrompt`); undo and redo work after a restore as before the reload. One journal per data source (`maid:scene:<name>`, `maid:osm`). A second tab gets a notice that its edits are not kept (Web Locks). Checked by `bun run check-journal` (small and dense). Settings: the rule "default, config, stored, URL, user" is `startSetting` and `writesStored` in `maid-core`; the filters are the first setting on it: a change is stored as the user's own, a link's filters hold for the session only, and the filter panel then offers "Use mine" and "Keep these as mine".
      Not done: `commitAppend` is not handled by the journal (Maid does not call it); write failures and the real Web Locks path have no test; the stored filters are not written into the URL at load, so a link copied before the first change lacks them; no age limit for a restore.
      Test for Tobias: move a node and change a tag, reload, choose "Restore", press undo twice. Reload again and choose "Discard". Then set "Buildings" to hidden, reload: still hidden. Open the page with `&filters=water:hidden`: the panel says the filters come from the link.
- [ ] **C2. Login and upload, locally.** `osm-oauth` and `osm-changeset` behind the config; the save flow with changeset comment, hashtags and review of changes; conflicts reported. Uploads go to a local stand-in only. This needs one decision first: core rule 1 says the mock API rejects writes, so either the mock gets an in-memory write mode for tests, or a second local tool does it.
      Decided by Tobias on 2026-10-12: no local stand-in; a person tests against the OSM development server (AGENTS.md, core rule 1).
      Status (2026-10-13): built, not yet tested by a person. Login is in be2a71d, saving in 62d9183 and the tag cleaning before an upload in 7472084; this step is not ticked until Tobias has run the test below.
      Done so far (2026-10-12), login: `apps/maid/src/auth.ts` on `osm-api` (OAuth 2, PKCE, popup, `public/land.html`), against the development server only, with the client id from `VITE_OSM_DEV_CLIENT_ID`. The account button in the top bar logs in and out and shows the name. Nothing is requested before a person clicks "Log in"; switched off under automation. The dev server now listens on 127.0.0.1 (the redirect URI), port 5173 fixed. Not tried by anyone yet: an agent may not log in.
      Test for Tobias: open http://127.0.0.1:5173 (not localhost), press "Log in", approve in the popup; the button shows your name; reload, still there; "Log out".
      Done (2026-10-12), saving: "Save" in the top bar opens a flyout with what changed (created, changed, deleted, the first twelve listed), the changeset comment (hashtags are taken from it as in iD) and "Upload to the development server". The upload is one changeset through `osm-api`; a conflict or another refusal shows the server's message. Afterwards the stored edits are forgotten and the map is loaded again. Saving needs `?api=dev` (data read from the development server) and a login; on a fixture the button explains that, because the fixture's ids do not exist on that server. `?api=osm` (the real API, reading) can never save. The conversion (`apps/maid/src/save/osm-change.ts`) has unit tests; the upload itself has been run by nobody yet.
      Test for Tobias: open http://127.0.0.1:5173/?api=dev&map=17/52.5/13.4 (the development server's database is nearly empty there), log in, add a point with a tag, press "Save", write a comment, upload, follow the link to the changeset. One or two small changesets are enough.
      Open: nothing is tried against a server; no merge of conflicts (the message only); upload progress for large changesets; the review list has no map highlight.
      Test: save three edits against the local stand-in and read the changeset it received.
- [ ] **C3. Live data, by hand.** The opt-in mode against the real API for a person: reading first, then saving to the dev API. Never from automation.
      Test: Tobias loads his neighbourhood and saves one edit on the dev server.

## Part D: core modules and the first fork

- [x] **D1. Backgrounds.** The existing package `maplibre-editor-layer-index` does the work: background list, overlays, offset. `maid-module-imagery` is only the adapter that puts it into Maid (a Maid module of a few files that registers the layers, the panel and the settings on the extension points). What is missing for Maid is added to the existing package, not built a second time here.
      Result (2026-10-13): `maid-module-imagery` on `@osm-editor-kit/maplibre-editor-layer-index` 0.1.14: "Background" in the top bar lists the backgrounds for the view (best first), overlays as checkboxes, brightness; the chosen one is drawn under the OSM data with its attribution. The list is bundled in the package; tiles are requested only for what a person chose. A stored choice is restored on the next visit and loads its tiles without a new click: confirmed by Tobias on 2026-10-13. Off in automated browsers. Seen: the panel opens in a headless browser, where it is off; no background was looked at by anyone. Not done: offset (the package has none). Draft requests for the package: a country filter from a point, a zoom option, a ranking, smaller data chunks.
      Test for Tobias: open "Background", choose an aerial image, change the brightness, switch an overlay on.
- [x] **D2. Street-level photos.** The same: the existing packages `street-imagery` and `street-imagery-react` do the work, with the viewer in the dock; `maid-module-street-imagery` is the adapter.
      Result (2026-10-13): `maid-module-street-imagery` on `street-imagery` alpha.8 and `street-imagery-react` alpha.10: "Photos" in the top bar switches Panoramax and (with `VITE_MAPILLARY_TOKEN`) Mapillary on, with the packages' date and flat/360° filters; photos and tracks are drawn over the OSM data; a click on a photo opens it in the dock's "Photos" view with its view cone on the map and does not select the feature under it. Everything is off until a person switches a provider on; off in automated browsers. Seen: the panel opens. Nobody has seen photos, the click or the viewer yet. Not done: the dock does not open by itself on a click. Draft requests for the packages: an optional Mapillary token, a stylesheet, a viewport hook.
      Test for Tobias: open "Photos", switch Panoramax on at zoom 15 or more, click a photo point, open the dock's "Photos" tab.
- [x] **D3. Notes and data layers.** OSM notes; user GeoJSON, PMTiles and vector tiles.
      Result (2026-10-13): two modules. `maid-module-data-layers`: "Data layers" in the top bar adds GeoJSON (file or URL), PMTiles and vector tiles, each with a colour and a switch, drawn under the OSM data; URL layers are stored, file layers last until a reload; an editor's config can bring layers. `maid-module-notes`: "Notes" in the top bar shows the OSM notes of the API the data comes from as markers, with the chosen note and its comments in the dock; read-only. The mock API serves invented notes (`fixtures/notes/`). Seen in a headless browser: the notes markers and list on the small scene. Not seen: any data layer. Not done: writing notes, a click on a data-layer feature, a tag filter for data layers.
      Test for Tobias: add a GeoJSON file under "Data layers"; switch "Show notes" on and click a marker.
- D4 (tasks and MapRoulette) moved to "Not planned yet" on 2026-10-13.
- [x] **D5. Lenses and user styles.** A second prepare step, style export and import.
      Result (2026-10-13): `maid-module-lenses`: "Map style" in the top bar switches a lens on: Surface, Lit, Max speed, each with a legend; what no rule matches is dimmed. A lens is data (rules of tags to colour, width, dash) and can be imported and exported as JSON. The renderer has `engine.setLens`, which builds the features again; without a lens nothing changes. Seen in a headless browser: "Surface" on the small scene; a change of lens takes 0.4 to 0.9 s on the dense scene. Not done: points cannot be recoloured, labels and pins are not dimmed, the style export of the architecture note.
      Test for Tobias: choose "Surface" and "Max speed", export a lens, change a colour in the file, import it.
- [ ] **D6. Radnetz Berlin as an app.** `apps/radnetz-berlin`: a config and its own modules, with no change to a package. This is the measure of success from the [extensibility plan](../extensibility-plan.md).
      What it takes over from the fork, feature by feature, with a proposal for each: [radnetz-features.md](radnetz-features.md). To be confirmed by Tobias before D6 starts.

Each of these gets its test line when it is planned in detail.

## Part E: from the comparison with iD and the fork (Tobias, 2026-10-13)

Asked for in one session; worked by parallel agents, one folder each. The reports of the test comparison are in [docs/research/id-tests](../research/id-tests/). State as of the last edit of this list.

Done and committed:

- [x] iD's 2196 unit tests accounted for per area (covered, adopted, todo with a feature, not applicable).
- [x] Points and vertices show hover and selection.
- [x] Delete as an operation with iD's rules; the neighbour is selected after a vertex is deleted.
- [x] Eight more validation rules (11 of iD's 14).
- [x] Related tags under their field; favourite feature types with number keys.
- [x] Photos: dark mode, the shared button look, details, link to the provider; comparison with Mapillary.

In work (an agent each):

- [x] Times shown local and relative, with the other form in the tooltip (date-fns, `@date-fns/tz`).
      Result (2026-10-13): built in bfe6595: times in the browser's time zone, relative where recent (date-fns in `packages/ui`). The tooltip form was not checked.
- [x] Bugs: a point that becomes a vertex is summarised as deleted; neighbours are not validated again after a deletion.
      Result (2026-10-13): built in c9e1408: a point that becomes part of a way counts as changed, and neighbours are checked again after a deletion.
- [x] Relations: review against iD, strong tests for member order, improvements in the inspector; then the map side (highlight members, load a relation in full).
      Result (2026-10-13): built in 0cddca7 (inspector), 52a3502 (member order), 439f17b (tests), b4208b4 (map side) and e9e688c (joins and splits).
- [x] Preset changes from an editor's config (`withChanges`), with an example and documentation.
      Result (2026-10-13): built in c756bc9: `withChanges` in `packages/presets`, an example in `apps/maid/src/preset-changes.example.ts`, the package README.
- [x] An info popover for fields and feature types (the tag's description from the OSM wiki, on a person's click only).
      Result (2026-10-13): built in c756bc9 (`packages/ui/src/InfoPopover.tsx`): the wiki is asked only on a click, once per tag in 30 days.
- [x] Address field as in iD.
      Result (2026-10-13): built in c756bc9.
- [x] Direction markers: short ways, the selected way's direction, one-sided line styles, view cones of points.
      Result (2026-10-13): built in 229963b and 99cdfb9. The view cones of points are not checked (unverified, 2026-10-13).

Waiting for the renderer to be free (one after the other):

- [x] Points: iD draws the pin only; Maid always draws a dot under it. House numbers on address points and buildings, as close to iD as MapLibre allows.
      Result (2026-10-13): built in 7a5e7f9 (the pin is the point) and 1a46967 (house numbers on plaques).
- [x] Things on top of each other: the first is selected as in iD, a small marker says there are more, a list switches between them; also on right click. For lines and points.
      Result (2026-10-13): built in bbda5ba.
- [x] Side indicator and width band on the map while a field has the focus.
      Result (2026-10-13): built in 1f5cb67; the band going away after a value is confirmed and when the pointer leaves the fields is fixed in 4ea65cd and c637528.
- [x] Measuring tape for width fields.
      Result (2026-10-13): built in f7d5431: a button in the label line of every width field, two clicks on the map, the ground distance to one decimal as one undo step; Escape cancels.
      Test for Tobias: select a road, add the field "Width", hover its label, click the ruler, click the two kerbs.
- [x] Validation: measure the speed of all rules on the dense scene; decide between the main thread, a worker and WASM from the numbers.
      Result (2026-10-13): measured in 919405b (an edit is checked in 4 ms on the dense scene). The decision is in [validation-performance.md](../research/validation-performance.md): main thread, no worker, no WASM for now.

Waiting for preset changes and field types from modules:

- [ ] Traffic sign field with `@osm-traffic-signs/id-field`.
      Result (2026-10-13): partly, in c9f7fa2: the module has the presets and a plain text field, not switched on. The package's sign picker is not mounted (it is built for iD), so the item is not done.
- [x] Image fields for all image keys (no infra3D: that is a module of its own).
      Result (2026-10-13): built in 0ef2a8b: a field for the image tags, and "Use this photo" in the viewer.
- [x] Surface and smoothness by photo with `@osm-editor-kit/surface-smoothness-data`.
      Result (2026-10-13): built in 4c9f6b8 as a module that is not switched on (the data package is GPL-3.0-or-later and Maid is ISC: a decision is needed before it is in the default editor).

At the end:

- [x] One or two code reviews for speed and for simpler code, with the findings applied.
      Result (2026-10-13): one review each, [review-performance.md](../research/review-performance.md) (14 findings, 7 applied) and [review-cleanup.md](../research/review-cleanup.md) (20 findings, 5 applied and 3 in part). Biggest gains, measured headless: moving 300 buildings 34 ms per pointer move instead of 647 ms; a commit after 50 tag edits is validated in 0.6 ms instead of 20 ms; a redraw of a moved 519-node way 0.13 ms instead of 9.6 ms. The open findings are listed at the top of each file. Not shown in a browser benchmark: there is no earlier dense run of the same state to compare with.
- [x] One list of all missing features from the area reports.
      Result (2026-10-13): [missing-features.md](../research/missing-features.md) (c637528). Built from it since: reverse and orthogonalize keep data (72bd175), midpoint handles (2a36487), move keeps the neighbours' shape (194a5f8).

Waiting for a decision by Tobias: bugs in the model that lose data (reverse with semicolon values) need a change to code that is kept identical to Rapid; field defaults when a type is chosen; hide a feature only when all its filter categories are hidden; trimming of `note`, `description`, `fixme`; restore the last map position; combo option order; emptying a translation's code; seven favourites with fixed keys.

## Not planned yet

Tasks and MapRoulette (was D4: the task extension points and `maid-module-maproulette`): left out by Tobias on 2026-10-13, because the MapRoulette integration is broken by problems of its API at the moment.

GPX, measurement and history panels, keyboard shortcut help, the published npm packages and their release routine. They are listed so that nobody assumes they are covered. (Translations and turn restrictions stood here until 2026-10-13: both are in work now, see Part F.)

## Not doing

- **The walkthrough** (iD's interactive tutorial). Decided by Tobias on 2026-10-12: Maid will not have one.

## Log

Results are written under the step. Longer findings go to `docs/research/`, decisions to `docs/adr/` or the architecture chapters.

## Part F: the queue after 2026-10-13

Everything that was decided or asked for on 2026-10-13 and is not built yet, so that nothing is lost between sessions. The decisions are in [ADR 0009](../adr/0009-decisions-of-2026-10-13.md); the studies are named per item. Order inside a group is the proposed order of work.

Built since the queue was written, with the commit and a line on what to try, is listed first. Items that are only partly built stay open, with what is built noted on them.

### Done since the queue was written

- [x] 2026-10-17: the relation column. "Open" on a relation (in a feature's Relations section, or in a relation's Members section) shows its members in a column beside the inspector; the inspector becomes a card inside it and keeps the selected feature. A member row selects that member, the column's head selects the relation itself (its tags, help and Reroute are then in the inspector). The selected row docks onto the card like a tab, group headings stick and stack, "Fly to" for members out of view, "Add it" for a selected feature that is not a member. Closing: the head's ✕, "Close" on the card, Escape or a click on open ground. Prototype: [relations-sidecar.html](../prototypes/relations-sidecar.html); route tagging read from the wiki once: [route-relations-recommendations.md](../research/route-relations-recommendations.md). New check `bun run check-relation-column` (scene `relations`, 31 checks with reordering and removing, all three apps).
      Test for Tobias: Maid Bicycle on the relations scene, select Müggelheimer Straße, open "Relations" in the inspector and click "Open" on Bus 162; click members, the head, "Fly to"; select a road that is not on the route and use "Add it".

- [x] The night of 2026-10-15 to 16: relations (everything decided, see [relation-handling.md](../research/relation-handling.md), "Done in the night"), the way table in maid-bicycle ([way-table.md](../research/way-table.md)), rerouting a route in maid-bicycle, issues in data the person did not edit ([issue-scope-ux.md](../research/issue-scope-ux.md)), all iD URL parameters ([08-url-state.md](../architecture/08-url-state.md)), the background offset, grouped directional fields, the parking quick buttons that cycle, three apps on GitHub Pages ([deploying.md](../deploying.md)).
      Test for Tobias: <https://osm-editor-kit.github.io/maid/>, then Maid Bicycle: select a road and open "Way table" in the dock; select a bicycle route and use "Reroute a stretch"; select a route and see its gaps and arrows on the map.

- [x] The shell is a package, and `apps/maid` is a config and an entry (steps 0 to 4 of the [shell plan](../research/shell-package-plan.md)); an app is `mountEditor(root, app)`.
      Result (2026-10-13): built in 5251d50 (the 82 files moved, although that commit's message names only operations), a1eb73e (`apps/maid` as config and entry) and a383355 (the app as an argument). Test for Tobias: `bun run dev`, then open <http://localhost:5173> and <http://localhost:5176>. Both start with their own settings and journal. Login on 5176 says it is unavailable until its redirect is registered.
- [x] `apps/maid-bicycle` as a second editor on port 5176, with the default modules and the traffic sign module.
      Result (2026-10-13): built in a383355. Test for Tobias: open <http://localhost:5176/?scene=small>. The top bar says "Maid Bicycle", a placeholder name. The Radnetz features are not in it yet.
- [x] Operations refuse a feature that is less than 80 % in view ("too large", as iD and Rapid).
      Result (2026-10-13): built in 5251d50. Test for Tobias: zoom in until a long road runs off the screen, select it and try Straighten, Square, Make round, Disconnect, Extract, Flip or Delete. Each is refused with "not enough of it is currently visible". There is no power-user switch.
- [x] A custom background, as in the Radnetz fork: add, name, edit and delete from a tile URL template; stored as a list.
      Result (2026-10-13): built in 05afc8b. Test for Tobias: in the Background panel, add a custom background from a z/x/y template, rename it, change it and delete it. The panel has not been looked at in a browser yet.
- [x] A background from a link holds for the visit: `background=custom:<template>` shows that background and stores nothing. A refused template gives a toast with the reason.
      Result (2026-10-13): built in 3bb1edd. Test for Tobias: open the editor with `background=custom:` and a template. The background shows; after a reload the stored choice is back.
- [x] Presets, fields and defaults that are bound to countries apply only there. The address field takes its layout from the country and offers streets, places, cities, postcodes and house numbers from features within 200 m.
      Result (2026-10-13): built in 9279de9 (presets and the address logic) and 3bb1edd (the inspector and the field). iD writes `crossing:markings=yes` in every country; the country only changes which field is shown and which options it lists. Test for Tobias: select a footway crossing in the small scene (Berlin). Its marking field lists the Germany options, and the tags written are the same as before. Type a street name near a building in the address field and see the suggestions.
- [x] Key and value suggestions from taginfo in the tags sheet, as iD.
      Result (2026-10-13): built in 7a7d1cb. Test for Tobias: in the tags sheet, type three characters of a key. Taginfo's suggestions appear; choose one with the arrow keys. Not tried against the real service yet (see Waiting for Tobias).
- [x] A test forbids requests that bypass the editor's fetch, and a wiki's `maxlag` refusal waits 5 seconds before the retry.
      Result (2026-10-13): built in 2c4b73b. Test for Tobias: nothing on screen. `bun run check` runs the scan in `packages/core/src/fetching/no-direct-fetch.test.ts`; a direct request outside the editor's fetch makes it fail.
- [x] The map can be turned: Alt or Control with a drag on open map; Shift with the left and right arrows in steps of 2.5 degrees; two fingers on a touch screen; a compass button and the key N set north up again; a link and the stored position keep the turn. A zoom to a feature keeps a turned map turned.
      Result (2026-10-13): built in be55541, and the zoom to a feature in 3bb1edd. Test for Tobias: hold Alt and drag on open map, press Shift+Right, then press N. Tilting is not built; the map is only turned.

- [x] "Too large" with a turned map: the share in view is measured against the view itself, not the larger box around it. With north up the result is the same as before.
      Result (2026-10-13): built in 827a9f8. Test for Tobias: turn the map with Alt and a drag, zoom in until a long road runs off the screen, select it and try Straighten. It is refused as it is with north up.
- [x] Several features in the inspector: a list (click selects one, x takes one out), the type or "Multiple types", the fields all of them have, the tags all of them share with "Multiple values". A change goes to all as one undo step; a read-only feature in the selection refuses the change, and a toast says so.
      Result (2026-10-13): built in fc45983 and d0d7c6d. d0d7c6d adds: a typed value in the tags sheet goes to all; renaming a key keeps each feature's own value; removing a row removes it everywhere; the type of several can be changed, each keeps its own other tags, in one undo step, and the list offers only types that fit every geometry; the issues of all selected features, in iD's order. New browser check `bun run check-multi` (11 steps). Fixed in passing: changing a filter after an edit caused an error in the map library.
      Test for Tobias: select three features with Shift-click. See the list, the shared fields and tags; change a shared value and undo it. Then select two features of different types and change the type of both.
- [x] Checks for each app: every check takes `--app maid|bicycle`. `bun run check-all` runs the eleven checks, compares their counts with the expected ones and writes a report. `bun run check-config` tests both editors' configs without a browser: unique module ids, known extension points, fixed ports.
      Result (2026-10-13): built in 2a3e9be; both editors pass all eleven checks.
      Test for Tobias: run `bun run check-all` and read the report it names; run `bun run check-config`. Both exit 0 when all is well.
- [x] Saving again without a reload: after a successful upload the edit history is emptied and the view loads again after 2.5 seconds, as in iD and Rapid. A selected new feature stays selected under its new id. The save button is no longer blocked after a save, and edits made after it are kept for a restore again.
      Result (2026-10-13): built in dce9e86. Not yet tried on the development server by a person (see Waiting for Tobias).
      Test for Tobias, five steps: (1) on the development server, with `?api=dev`, log in and add a bench; (2) save; a toast shows and the map loads again after about 2.5 seconds; (3) move the bench; (4) save again; (5) changeset B must contain exactly one changed node, with the id from changeset A.
- [x] Map zoom: below the load zoom (16) the loaded lines, areas and points stay drawn down to zoom 12, without vertices and labels; below 12 only the selection is drawn. New data still loads only from zoom 16. A switch in the top bar, "show only the selection", works at any zoom for the visit. The camera stops at the world view, as in iD and Rapid.
      Result (2026-10-13): built in 56a497f.
      Test for Tobias: with data loaded, zoom out step by step. At 12 to 15 lines and areas stay, points show as dots, no vertices or labels. Below 12 only the selected feature is drawn. Turn on "show only the selection" in the top bar. Zoom out to the world view and no further.

### Order after the parking editor (decided by Tobias, 2026-10-13)

1. A performance round on the current state: all three editors measured again, bottlenecks found and fixed. The aim is to be faster than Rapid in every scenario. Zooming out being slower is accepted for now.
2. Count the comparison with iD again ([missing-features.md](../research/missing-features.md)) and strike what was built.
3. Finish the translations.
4. The gaps in editing (turn restrictions, Wikidata and Wikipedia fields, "ignore this issue", lasso, field defaults on "Add field").
5. Cleanup (`/unslop-code` phases 3 to 10, the remaining native tooltips, splitting `engine.ts`).
6. The Radnetz modules for the bicycle editor, after the parking editor: both need the same parts (side fields, an app's own operations and validation rules).

Notes for the parking and the bicycle editor: a TILDA notes module used by both. Its config names the region and the folder id, so that switching it on for a project is one line.

### Where things stand at the end of 2026-10-13

Three editors run from this repository: `apps/maid` (5173), `apps/maid-bicycle` (5176) and `apps/maid-parking` (5177). `bun run check` is green, the three apps build, and `bun run check-all --app <name>` passes for each (eleven browser checks, twelve for parking). Nothing is pushed.

Built after the lists below were written, each with its commit:

- The parking editor: presets, quick-tag buttons, side lines, the restriction field, nine validation rules, three operations, reviewed and corrected (f488630, 8b2a72d; the brief and the review are working documents kept outside this repository).
- Imagery series: one row per series with its dates as buttons; the layer index package at 0.2.0 (69647e2).
- The measuring magnifier, and the width band hidden while measuring (6f2f871).
- New features are exempt from "too large"; `created_by` names the app and its version (15a52b6).
- Loading: country checks without area maths, marker images on demand, pins from zoom 18, the pin of a hovered or selected point from its own source, the inspector and the panels after the first picture, the presets after the map is ready (d1158bc, 5c12424, 6539299, 4b01b0e). The analysis and every measurement are in [performance-2026-10-13.md](../research/performance-2026-10-13.md).
- The benchmark: each app, a lens, edit latency for all three editors, budgets as warnings, a watchdog per phase, "map drawn" apart from "everything fetched" (15b9f1e, 838438e, ddcced1).

What the day's measurements say (quiet machine, medians; the last full comparison is the run labelled `final` in `reports/`):

- Maid loads, pans, zooms and edits faster than Rapid in every measured number, and faster than iD everywhere except "ready", where the two are within a few tens of milliseconds.
- An edit (dragging a node, changing a tag) is on screen after one frame on every scene; iD takes 75 to 100 ms on the medium and the dense scene, Rapid two frames.
- Rust is not needed for anything measured: validation costs 0.2 to 0.5 ms per edit. The one candidate would be a check of everything loaded, which Maid does not do.

Open from today, beyond the lists below:

- One benchmark run in 17 stalled for five minutes while loading the dense scene (before the watchdog existed). Not explained. The hover-phase hang was a race in the benchmark's probe and is fixed.
- The presets chunk is fetched with `prefetch`; whether a real host serves it from the cache on the later import is unchecked (the local preview sends `no-cache`).
- Two build flags mark `packages/ui/src` and `packages/presets/src` as free of import-time effects. A file there that is imported only for an effect would be dropped from the build without a warning; a check for that is missing.
- "Select until the inspector shows it" still misses some clicks in Maid and Rapid; the report shows the misses.
- The parking editor: nobody has mapped with it. Open in it: German for the lens legend, the undo texts of the buttons and iD's own preset names; rules that need a distance (an area next to a road); "parking area from this side"; sign to tags; the cost of the side lines in the browser; whether the 14 rows of buttons should fold.
- Resolved 2026-10-13: the surface data package is MIT from 0.1.0 and has no GPL icons; the emoji replace them ([surface-data-licence.md](../research/surface-data-licence.md)).

Recommended order from here: a person maps with the parking editor and saves once on the development server; finish the translations; the TILDA notes module; the Radnetz modules; count the comparison with iD again; cleanup (`/unslop-code` phases 3 to 10, split `engine.ts`).

### Decided by Tobias on 2026-10-13, evening

- Our own packages (`@osm-editor-kit/*`, `@osm-traffic-signs/*`) are exempt from the five-day wait in `bunfig.toml`, so that a new version lands at once.
- Language: the link's `lang=`, then the stored choice, then the browser's language, as iD. An app's own default comes last.
- Pins appear from zoom 18 (MapLibre), not 17.5: the map prepares a layer from the whole zoom level below its start, so 17.5 made every pin image at zoom 17 before one was drawn.
- "Too large": features created in this session and not yet saved are exempt, as in Rapid. No power-user switch.
- `created_by` in a changeset is the app's name and version ("Maid Parking 0.1.0").
- Resolved 2026-10-13: the surface and smoothness data is MIT from 0.1.0 (the question of where it comes from and how we use it is answered in [surface-data-licence.md](../research/surface-data-licence.md)). The translated texts are plain texts; the pictures have their own licence.
- Performance: no synthetic scene of 500,000 nodes. Test what is realistic in OSM, and cap what nobody can work with instead. Next: "ready" faster than iD, the CPU time while zooming, and the time from an edit (drag, typing a tag) to the picture, measured for all three editors. Rust: measure first, then decide.
- Performance budgets are warnings. The crisis is being slower than Rapid or iD. A cost that buys a feature is decided case by case; a feature of one editor (parking) must not slow the others.
- The benchmark covers each app, and a lens switched on.

### Decided by Tobias on 2026-10-13, night (from the recount of the comparison with iD)

Build now, from the ten gaps that matter most ([missing-features.md](../research/missing-features.md)):

- Recently used presets and preset categories in the type picker.
- Labels for `ref`, routes and networks, not only names.
- Combo fields: completion while typing, Escape and Enter.
- Deprecated tags are reported, with the fix that upgrades them.
- Wikipedia and Wikidata fields.
- Relations: create a new relation, load one missing member, nearby relations first.
- "Ignore this issue" for warnings, kept in the browser's storage.
- Turn restrictions, as a module of its own (`packages/module-turn-restrictions`), built so that its parts serve other cases; built by one agent and reviewed by another.
- Search for coordinates, OSM ids and places: a button with a flyout in the top bar, Ctrl/Cmd+F (Cmd+K is kept for a later action bar).

Not wanted: iD's keys for stepping along a way's vertices and for parent and child (`[`, `]`, Ctrl+arrows). Maid has its own way to pick among features.

Also decided: the editor is deployed to GitHub Pages by a workflow, a fork chooses the app in `deploy.env`; the deployed editor reads the real map read-only by default and can be switched to the development server in the account menu. The Mapillary token is a commented constant (`apps/mapillary-token.ts`). The street space editor of osm-editor-kit is reviewed for what Maid can adopt ([street-space-editor-review.md](../research/street-space-editor-review.md)).

### Waiting for Tobias

- [ ] Saving on the development server (dce9e86): the five steps under Done. Not yet tried by a person.
- [ ] C2: try login at `http://127.0.0.1:5173` and saving with `?api=dev`.
- [x] Licences: surface and smoothness by photo is switched on (decided 2026-10-13). Resolved 2026-10-13: the data package is MIT from 0.1.0, and the GPL icons are replaced by emoji.
- [ ] Look at on screen (nobody has): the ruler icon, the red state of a too long value, the favourite number fields, the toasts on a narrow window, the three places with the shared segmented control, the address dots.
- [ ] A real background with a minimum zoom: offered and drawn from `#map=<minzoom>`, not one level later (cannot be checked offline).
- [ ] Turned map on a Mac: Ctrl-click on open map no longer opens the menu, because Ctrl with a drag turns the map. Needs a person's test. [rotate-and-tilt.md](../research/rotate-and-tilt.md)
- [ ] Turned map: Shift+Right turns clockwise, as in Rapid. This reverses MapLibre's default; to confirm.
- [ ] Custom background: nobody has drawn a real custom background yet.
- [ ] Second OAuth redirect for port 5176 (a second OAuth app, or a second redirect on Maid's app). Login on 5176 is "unavailable" until then. [shell-package-plan.md](../research/shell-package-plan.md)
- [ ] Taginfo suggestions: not tried against the real service yet.
- [ ] "Too large": Rapid's power-user switch and its exemption for unsaved features are not adopted (iD has neither). Tobias may decide.

### Editing and data

- [ ] Next for relations (parked by Tobias, 2026-10-21): the column only for route-like relations; area relations (building multipolygons, `type=building`) list their members in the inspector, with the data of members that have tags of their own. Measurements and plan: [area-relation-members.md](../research/area-relation-members.md).
- [ ] Relation column, open: edit roles in the column (today in the member's Relations section); load all missing members at once (one at a time works); dim the rest of the map while a relation is open (needs the tool layers moved above a wash and about ten redraw layers, see the renderer's focus layers); an arrow at the map's edge for a hovered member out of view; the column in the phone's bottom sheet (it is desktop only); Reroute next to the route's ways; help texts per relation type from [route-relations-recommendations.md](../research/route-relations-recommendations.md); the dock reduced to the way table behind a tab at the map's bottom edge (prototype), with Issues, Photos, Notes and Data moved elsewhere. Built since: drag and Alt+arrow reordering in the column, the open relation in the URL (`relation=`), selecting a relation opens it, all members listed (a group of more than 1000 has its own "Show all"). Nested relations: a path of the parents above the head (the way the person came first, "Also in" for other parents), a sub-relation in the list is entered, selecting another relation switches the column, and the open relation's own memberships live in the path instead of the inspector.

- [ ] Notes from zoom 14, with a toast when the limit cut the list. Editing below the load zoom, the selection at every zoom, the switch and the world view are built (see Done: 5251d50, 56a497f).
- [ ] Zoom, open: point dots at zoom 12 to 15 keep their size and crowd the map (to tune); 34 more layers (114 instead of 80), cost not measured on the dense scene; hover and relation-member highlights are not drawn below the floors; `check-render` references need a review before saving new ones; pan timing at zoom 12, 14 and 16 on the dense scene is not measured.
- [ ] Several features at once: the "Multiple values" state in every field; Shift-click on open ground keeps the selection; lasso. Base built in 49fe526; the inspector for several, mixed tags, the type change, shared issues and the read-only refusal are built in fc45983 and d0d7c6d (see Done). [multi-selection.md](../research/multi-selection.md)
- [ ] Several features, open: relation membership for several; the type picker's empty search shows the first 50 types by name (iD shows its defaults); the issue list for several is ordered by type as in iD, while the single list is ordered by severity; `check-multi` does not cover the type change and the issues yet; a pasted `key=*` on a mixed tag is refused with a message (iD skips it silently).
- [ ] Tags as a sheet: the React grid and `TagSheet`, the browser check `check-tags`, the inspector switched over (the old tag rows go), suggestions. Core built in b7535df; the mixed state built in d0d7c6d (see Done). [sheet-design.md](../research/sheet-design.md)
- [ ] Countries: the restore list has no position for ways and relations; multipolygon holes are ignored in "inside the building"; a child app's own presets and fields cannot carry a location set; the country data costs about 0.25 MB gzip at startup, and the first use of large sets about 140 ms (warm when idle?).
- [ ] Custom background: a key inside a path segment is not redacted in the cited name; the mark on the Background button when a link sets the background is open.
- [ ] "Too large": point-to-area has no rule.
- [ ] Wikidata and Wikipedia fields as iD.
- [ ] Turn restrictions field as iD (large).
- [ ] "Ignore this issue" on warnings, as iD, in Maid's UI.
- [ ] "Add field" writes the field's default as iD does (found by the presets comparison).

### Loading and storing

- [ ] Fetching with TanStack Query: one client, reference data fetched once per session, a gate per service (Wikimedia one request at a time), at most two retries and none on 4xx, a pause with a standing toast on 429 and 509, map data tiles with a time limit, cancelling and a wait after an error, street-level photo queries keyed per tile, the photo layer off until switched on, one switch that stops every remote request in automated runs. [fetching-audit.md](../research/fetching-audit.md) Built so far: the no-direct-fetch test and the 5 seconds on `maxlag` (2c4b73b, see Done above).
- [ ] Fetching, open: requests made inside third-party packages (street-level photos, PMTiles, MapLibre tiles) are outside the editor's fetch; the sprite loader in the shell is on the allow list with a TODO.
- [ ] Taginfo, open: the suggestion list does not scroll the highlighted option into view; keystrokes can queue several requests behind a pause.
- [ ] Turned map: tiles, notes and imagery load for the box around the view, which is larger than the view (more requests). The "too large" rule with a turned map is built (827a9f8).
- [ ] What a link may do: the URL wins and never writes storage; the filter banner goes; the first change a person makes is stored; a mark at the control when the view differs from the stored choice; the last map position as a fallback; iD's link parameters act for the visit. Built so far: a `background=custom:` link holds for the visit (3bb1edd). [state-storage-and-url.md](../research/state-storage-and-url.md)

- [ ] Saving, open: a large upload split into several changesets can duplicate the first part when a later part fails and the person retries (present before dce9e86, not fixed). The 2.5 second wait after an upload is copied from iD and Rapid and may be too short for the server (`REPLICATION_DELAY_MS` in `packages/shell/src/save/after-upload.ts`).

### Translations

- [ ] Step 1: `packages/i18n` with Paraglide (pinned to 2.25.4), English, German (informal "Du"), French, Spanish; the language choice; the preset texts as one JSON file per language made from the tagging schema; the UI's texts; a script that lists missing keys. [paraglide-study.md](../research/paraglide-study.md)
      Built: Paraglide for the app and per module, the language choice, `i18n-check` ([ARCHITECTURE.md](../../ARCHITECTURE.md#texts-and-languages)). Open: the preset texts in other languages than English.
- [ ] Step 2: validation, operations and undo labels return a message id with values; the journal stores those.

### The module system

- [ ] Shell plan, steps 5 and 6: the checks for each app (`--app`) and `bun run check-config` are built (2a3e9be, see Done). Open: a contract test per module, and the dev-only `?modules=` page, which can be done in each app's entry alone and is not built. [shell-package-plan.md](../research/shell-package-plan.md)
- [ ] Shell, open points: the six settings stores keep fixed names, not one set per app. (`created_by` names the app and its version since 15a52b6.) Browser checks run against both apps since 2a3e9be.
- [x] Deploying several apps (Tobias, 2026-10-15): `MAID_APP` takes one app or a comma list; several apps go to their own folders with a page of links, and share the `land.html` at the path for the login (`VITE_LOGIN_BASE`). Built with `bun run pages-build` (`tools/deploy/build-pages.ts`). Open: the settings stores have fixed names, so apps on one address share background, theme and the like.
- [ ] Radnetz modules: the TILDA bike infrastructure section with its checklist and rule; "extract a side into its own way" and "merge a cycleway and a footway"; age colours and a way's images for the photo layer; infra3D links; the traffic sign field as a Maid field on `@osm-traffic-signs/converter`.

### Architecture follow-ups

From the check of the code against [ARCHITECTURE.md](../../ARCHITECTURE.md) on 2026-10-17. Small fixes were made then (stale key comments, an unused dependency, one `.gitignore` line for all Paraglide output, presets imported by name in the validation tests, a dead query key). These need a design or a larger change:

- [ ] **Texts not through Paraglide.** About 120 hard-coded English texts in `packages/ui` and `packages/shell` (filter panel, save dialog, restore prompt, inspector titles, zoom controls, sheet messages). Five modules have no texts of their own and show English only: imagery, lenses (also the built-in lens legends), notes, data layers, surface. One text in street-imagery (`image-presets.ts`, "Street-level images", needs the presets API change).
- [ ] **Headless packages return sentences** instead of message ids (ADR 0009, item 5): about 75 in `packages/operations` (labels, reasons, undo annotations, plurals built in code), about 40 in `packages/validation`, and the undo annotations and refusal reasons in `packages/renderer` (`draw.ts`, `drag.ts`, `engine.ts`, `snap-aim.ts`). This is "Translations, step 2" above.
- [ ] **The shell imports three modules.** `maid-module-lenses` (`connectLenses` in `shell.ts`, `lensChoice` in `bench.ts`), `maid-module-notes` (`NOTES_LAYER_IDS` in `MapView.tsx`, the `NoteSelection` type and the item id `'notes'` in `selection.ts`) and `maid-module-street-imagery` (`streetImageryClick` in `MapView.tsx`). Each needs an extension point: a map click handler, layers that take clicks, a style hook for the engine.
- [ ] **The ui and the shell name module field types and providers.** `STEADY_TYPES` in `packages/ui/src/inspector/fields/Row.tsx` and `HANDLES_SEVERAL` in `mixed-logic.ts` list `streetImages`, `surfaceSmoothness`, `trafficSign`, `parkingRestriction`: a flag on the `inspector.field` item would replace them. `FetchPauses.tsx` names Mapillary and Panoramax. `field-overlay.ts` has a branch for `parking:*` side keys (an OSM key, maybe acceptable).
- [ ] **Packages that reach into `tools/`.** `packages/shell/src/config.ts` imports `tools/ports.ts`, `bench.ts` the bench API types from `tools/refs`; the renderer bench imports the fixtures and the mock API. The ports could move into a small package.
- [ ] Smaller: `packages/core/src/schema.test.ts` reads a JSON file from the model's `src` (needs an export); `packages/renderer/src/build.ts` has a width for `amenity-parking_space` in code instead of the style data; `apps/maid/src/preset-changes.example.test.ts` is a test inside an app; seven modules have no README.

### Drawing tools (parking)

- [x] Five drawing tools as modules for the parking app (Tobias, 2026-10-16): three-click rectangle, Shift angle snap, merge areas, cut an area, divide into rows and columns. Research, plan, status and what to test: [drawing-tools/README.md](../research/drawing-tools/README.md). Hooks: [ADR 0011](../adr/0011-drawing-tool-hooks.md). Checks: `check-rectangle`, `check-angle-snap`, `check-merge`, `check-cut`, `check-divide`.
- [ ] Open:
  - A favourite that starts the rectangle tool.
  - A Shift hint in the help.
  - Merge of multipolygons, and of three or more areas.
  - A cut through a concave shape.
  - A touch alternative to Shift.

### Cleanup

- [ ] `/unslop-code` phases 3 to 10 (re-exports, legacy paths, the skill reviews, component location, decision lift, semantic HTML, leftovers, texts). Phases 1 and 2 are done (44674af, 16129c3, fb0c7eb). When it is finished: a memory entry on what it changed.
- [ ] The editor's own tooltip on every icon button. Done: the top bar's buttons and the tool rows (Point/Line/Area, undo and redo, the theme switch) share one tooltip group (`TooltipGroup`, `tools/bench/tooltips-check.ts`), with the shortcut in a kbd. Left: about 100 native `title` attributes in `packages` and `apps` (`grep -rn 'title=' packages apps`), most of them in the inspector and the modules.
- [ ] Open findings of the two reviews ([review-performance.md](../research/review-performance.md), [review-cleanup.md](../research/review-cleanup.md)), the largest being the split of `engine.ts`.
- [ ] Small: a length counter in the raw tag rows and the multi-value lists; the upload adding spaces after `;` can push a value over 255; the benchmark handle is exposed in every build; the pill of overlapping features has no animation; a second-tab case in `check-journal`; messages next to their control tied with `aria-describedby`; after undo of a node move the way keeps its cached shape in the model (effect not examined).
- [ ] Checks: a click on a building edge that lies on another area's fill picked the other area. The check now avoids such places; the pick order there is not examined. The journal timing unit test is flaky under load.
- [ ] A benchmark of Maid against iD and Rapid on the dense scene at the current state.

### Indoor and levels (started 2026-10-21)

Research: [indoor/README.md](../research/indoor/README.md). Order decided by Tobias on 2026-10-21: the level basics, then the level mode, then 3D.

- [x] 2026-10-21: the indoor scene (`indoor`, Berlin Hauptbahnhof, cut from the local Berlin extract with Tobias's permission) and the package `levels`: `level`, `repeat_on`, `min_level`/`max_level` read with their problems, the floors of a set of features (45 tests on every level value of the fixtures).
- [x] 2026-10-21: prototype OSM2World (`bun run osm2world-prototype`): the station in 3D, offline; one level takes 10 to 12 s to convert, so it fits a panel for one building, not a live view ([3d-osm2world.md](../research/indoor/3d-osm2world.md) section 8).
- [x] 2026-10-21: the level mode (module `levels`, in the maid and bicycle apps): a floor picker on the map's right edge lists the floors in view (from zoom 17, as MapComplete), choosing one dims the other levels (a global-state paint expression, no rebuild) and locks them (no pick, read-only), new points and lines get the level, `level=` in the URL; "3D" tilts the map and extrudes rooms, floors, stairs and elevator shafts by level, cut at the chosen level. Check `bun run check-levels` (14). Test for Tobias: the links in the chat of 2026-10-21.
- [x] 2026-10-21: features without a level: on a level they are locked and shown dimmed, the eye of the picker's "none" row hides them, and "none" edits only them (the others hidden), to find and fix them; a count of the features in view per level; the pointer on a level that shows makes its features stand out; rule `missing_level` (a station or shop with `layer` but no `level`, fix: set the layer's value). `layer` is never read as a level: it only says what is drawn above what (11 features in the indoor scene have a layer other than their level).
- [x] 2026-10-22: stairs, escalators and ramps between two levels: the "Set level" menu offers the pair of the levels at their ends (and sets `incline` in the way's direction); rules `stairs_level_missing` (fix: both levels and the direction) and `stairs_level_unreached`; in 3D a flight of eight steps along the way, stair areas over all their levels; a "Level" section at the top of the inspector (one level, or "from → to" on stairs with a swap of the direction), whose buttons open the same menu. True slopes would need a custom WebGL layer: MapLibre's fill-extrusion has one base and one top.
- [ ] Next for stairs: snapping across levels while drawing (a flight drawn on level 0 ends on a way of level 1 and gets `level=0;1`).
- [ ] Open: the picker's texts in the i18n files; the level a new feature gets is not yet confirmed by the person (MapComplete asks); levels above 3 come from building levels and make the list long (filter to indoor features?); validation rules from [tagging-model.md](../research/indoor/tagging-model.md) (the parser already reports the problems); OSM2World as a panel for the selected building.

### Upstream sync (started 2026-10-23)

The log of iD and Rapid changes since the pins, with the decisions: [docs/upstream/sync/](../upstream/sync/README.md). Skill `upstream-sync`.

- [ ] Move the iD pin to `develop` (1f6118d or later), `bun run refs-setup`, `bun run style-generate`, then `compare`, `bench-smoke`, `check-render`. Brings iD's CSS for `ford` on roads, `waterway=dam` (and port its stacking exception in `OsmWay.ts` and `classes.ts`), `railway=platform_edge`, the updated Font Awesome icons and pinhead 16 (intents id-21, id-24, id-44, id-49, id-58).
- [ ] The `close_nodes` validation rule, with iD's exception for nodes on different `addr:floor` or `level` (iD 70b17d9, intent id-20; Tobias, 2026-10-23).
- [ ] A circle from `diameter`, `radius` or `circumference` around a selected point, in metres (iD #9732, intent id-4; Tobias, 2026-10-23).
- [ ] Later, to optimise: drop a GeoJSON or GPX file on the map. Rapid built a DragAndDropSystem for it; Maid builds its own (intent rapid-6; Tobias, 2026-10-23).

### osmChange files (started 2026-10-23)

Research and design: [osmchange-upload/README.md](../research/osmchange-upload/README.md) (Kyle Hensel's iD work, iD's conflict check, StreetComplete). Decided by Tobias on 2026-10-23: the base version comes from the OSM history (`<type>/<id>/<version>`), in tests from hand-written older versions in the mock (`tools/mock-osm-api/history/`); a delete of an element changed since is a decision that starts on "keep"; both moved a node less than 3 m apart → the file's position, further → a decision; the entry is in the account menu, the review in the dock with the changes on the map in OSMCha's colours; unsaved changes here to an element of the file refuse the file.

- [x] 2026-10-23: module `osmchange` (`packages/module-osmchange`, in the bicycle app): "Load changes from a file…" in the account menu (new extension point `account.item`) reads an osmChange file, asks the server (the mock in development) for the current state and the base version of each element, merges per key and per geometry (three-way), and lists in the dock what needs a decision (open), what was merged and why (folded, with the reason), what applies as it is and what has nothing to do. "Apply" writes one undo step; the person uploads it with the normal save. After loading, the map flies to the elements to decide (else the merged ones, else the rest), or to the first of them when they are more than 2 km apart. 50 unit tests on hand-written files whose ids exist in `fixtures/small`; check `bun run check-osmchange --app bicycle` (29). Test for Tobias: on the dev server, export a few changes from Go Map!! (or JOSM: File → Save as .osc), change one of the same elements on the dev server meanwhile, load the file in Maid Bicycle, decide, apply, look at the result in the upload list, then upload.
- [x] 2026-10-23, after Tobias's first test: what needs no decision is written on loading (one undo step named after the file), each decision as its own step when it is made (a changed decision replaces it); no "Apply" button, the review only shows and highlights ("Show on the map" switches the colours). The groups are disclosures with their count (only "To decide" open; new elements and unchanged ones apart), each row says what the file changed ("only moved, 2.1 m", "tags: surface", "nodes of the way") and the versions only where they differ; the map icon of "Fly to" shows the element. Check (27).
- [x] 2026-10-23: the changeset says where the changes came from (Tobias): `osmchange:created_by=<the file's generator>` (no OSM pattern for this was known; the wiki was not asked, core rule 1), and the save form starts with "Changes from Go Map!! 6.2.1, merged with the current map in Maid", while the editor holds changes of the file. New extension point `changeset.tags`. Check (29).
- [x] 2026-10-23: new elements against the server (match.ts): Maid asks the server for small boxes around the file's new nodes (`map?bbox`). A new node with the same tags within 0.5 m, or a new way with the same tags over the same nodes, is on the server already (the file read again after its upload): not created again, and the file's references go to it, so the changes around it compare equal. A new point of interest near an existing one with the same main tag that was added after the file's element (its timestamp, else the last 24 hours) is a decision: create it too, or use the existing one. After an upload the review is cleared (new hook `changeset.uploaded`). Review texts as Tobias asked (a short list, "Highlight differences", the groups with check marks), no "Close". Dock: only the tabs that show something (Issues with issues, Notes with a chosen note, Way table with a selected way, Photos with an open photo, the import with a file); "Data" is gone; the tabs float on the map's edge. Check (31).
- [ ] Open: duplicates cannot be checked in the browser, as the fixtures have no timestamps (unit tests only); "Issues" hidden without issues also hides the switch for existing issues; an undo of a decision or of the load step is not seen by the review (it still shows the choice); relation members are compared as a whole list (no diff3); a delete only knows the ways and relations the map has loaded (the server's `if-unused` catches the rest at upload); the file's changeset tags (`comment`, `source`) are not carried into the save form; the new untagged nodes of a new way are rows of their own; the map layer shows no relation geometry; a file is read in one go, with no progress for large files (up to 10 000 elements). French and Spanish texts are agent drafts.

### OpenAerialMap (started 2026-10-25)

Asked by Tobias on 2026-10-25: list HOT's OpenAerialMap images in the background panel, live rather than as a weekly package. Plan: [Claude doc](https://claude.ai/artifact/FgXsrgY9bQDPi3oD4RYJZg).

- [x] 2026-10-25: the layer index gets an `/oam` entry (osm-editor-kit/maplibre-editor-layer-index#16): `searchOam` by view and `getOamItem` against HOT's STAC API, raster specs from HOT's TiTiler. Maid's `module-imagery` lists the images from zoom 12 in a group "OpenAerialMap" after the aerial photos, `bg=oam:<item id>` draws one (`oam.ts`, `oam-rows.ts`), and the layer index goes from 0.2.0 to 0.5.0 (its first release with `/oam`). Test for Tobias: open Mont Sainte-Odile (`#map=19/48.4378/7.4052`), open Background, choose "Mont Sainte-Odile Abbey…" from 2026-10-24; the image is drawn, the link keeps `bg=oam:…`, and a reload shows it again.
- [x] 2026-10-25, after Tobias's first look: the images are overlays above the chosen background (they are small, the background gives the context), in their own section "OpenAerialMap" with a checkbox each; no thumbnail; "Attribution" links to the image's page in HOT's STAC Browser. `bg=oam:` from older links still draws. Test for Tobias: at Mont Sainte-Odile with an aerial background, open Background, tick "Mont Sainte-Odile Abbey…": the drone image is drawn over the aerial photo, the link has `overlays=oam:…`, and "Attribution" opens the STAC Browser page.
- [ ] Open: measure CORS once with `bun run oam:probe` in the layer index (the agent's network blocks api.imagery.hotosm.org; HOT's ingress turns CORS on); the image's footprint as an outline on the map; HOT's global mosaic `global.imagery.hotosm.org` proposed to ELI (`docs/upstream/`).

