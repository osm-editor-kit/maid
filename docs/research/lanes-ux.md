# Lanes UX for Maid

Status: research, 2026-10-15. Question from Tobias: how should Maid show and edit lane tags?

How to read the facts below:

- **[read]** I read this in code or docs during this session.
- **[known]** From general OSM knowledge. I did not read it here.
- **[inferred]** My reasoning from what I read. Not run.
- No tests were run. No network was used. Nothing outside this file was changed.
- The sibling repo is named `parking-lanes` (the "street space editor"). It is read-only here.

---

## 1. Summary

- Lane tags are a set of pipe lists, one entry per lane. Counts, pipe lengths and direction must agree.
- The street space editor already has the model: parse, edit, serialize and validate, plus a diagram.
- Its diagram is read-only. Its edit surface is a form matrix. Its "Lanes" mode is wired, not hidden.
- iD v2.42.2 (the pinned reference) has no lanes field and no lane editor. iD removed unused lane code in 2.42.0.
- Maid already has the patterns needed: an inspector section (turn restrictions), a dock view (street imagery), field overlays on the map (width band), and a measuring tool.
- Recommendation: option D, an inspector "Lanes" section with a diagram that is directly editable, plus an optional map overlay while the section is open. Build it in small steps.

---

## 2. The lane tagging scheme

### 2.1 Basics [known]

- `lanes` is the total number of lanes. On a oneway road it counts the lanes in the way's direction.
- `lanes:forward`, `lanes:backward` and `lanes:both_ways` give counts on two-way roads.
- `oneway=yes` or `oneway=-1` (reverse) change which keys apply.
- Each `*:lanes` key is a pipe list. There is one entry per lane, in OSM order.
- OSM order runs left to right in the direction of travel for that direction.
- An empty entry means "no value for this lane": `left||through`.
- `turn:lanes` values include `none`, `through`, `left`, `right`, `slight_left`, `merge_to_left`, `reverse`. Combined values use `;`.
- `width:lanes` gives the width of each lane in metres.
- `change:lanes` gives the marking between lanes (solid, dashed, and so on).
- `bus:lanes`, `psv:lanes` and `bicycle:lanes` mark special lanes. `designated` marks the lane.
- `access:lanes` gives access per lane.
- `surface:lanes` and `smoothness:lanes` give per-lane surface.
- `placement`, `placement:forward` and `placement:backward` say where the centreline sits (`middle_of:N`, `right_of:N`, `left_of:N`).
- `lane_markings=yes|no` says whether the road has markings at all.
- `turn:lanes:forward` and `turn:lanes:backward` are the directional forms.
- `cycleway:lanes` and `destination:lanes` are secondary keys. They are shown, not edited, by the sibling model.

### 2.2 What is hard to edit by hand [read, with known background]

- Every pipe needs one entry per lane. A gap is an empty entry, and that is easy to miscount.
- `lanes` must equal forward plus backward plus both_ways on a two-way road. The sibling flags a mismatch as an error [read: `validate.ts`, `lanes_sum_mismatch`].
- A pipe's length must match the lane count for its direction. The sibling warns on a mismatch [read: `pipe_count_mismatch`].
- Pipes for one direction must agree in length with each other. The sibling warns when they differ [read: `pipe_length_mismatch`].
- Backward pipes run in the direction of travel, so on a map they read from the other side [read: `types.ts` comment].
- Reversing a way swaps the sides of `turn:lanes`. iD's reverse action rewrites it [read: `modules/actions/reverse.ts`].
- Undirected pipes on a two-way road are read as forward lanes unless `lanes:backward` is set [read: `slots.ts`, `buildSlotsFromTags`]. This is easy to get wrong.
- Bike lanes often appear in the pipes but not in `lanes` (a common German pattern). The sibling warns about this [read: `bike_lanes_count_inconsistency`].
- A `placement` value must point at a lane that exists [read: `placement_out_of_range`].

---

## 3. The street space editor (`parking-lanes`)

### 3.1 What the packages do

**`packages/osm-lanes`** [read]

- Parses way tags into a `WayLaneModel` with one `LaneSlot` per lane.
- Each slot has a direction (`forward`, `backward`, `both_ways`), a kind, the access and turn values, width, change, surface and smoothness.
- Each field has provenance: `tagged`, `inferred` or `default`.
- Serializes back to tags. It rewrites only the primary lane keys and keeps every other key.
- Keys kept as they are: `access:lanes`, `cycleway:lanes:*`, `destination:lanes`, `maxspeed:lanes`.
- Does not treat `access:lanes` as primary. It passes through unchanged [read: `tags.ts`, `PRIMARY_LANE_KEYS`].
- Does not write `kind`. Bus and bicycle kinds come back from the access values [read: `serialize.ts`].
- Has edit helpers: `addLaneSlot`, `removeLaneSlot`, `syncModelCountsFromSlots`.
- Has validation and width reconciliation (`reconcileWidths`, 309 lines).
- Size: 1,404 lines of source, 790 lines of tests. Total about 2,200 lines [read: `wc -l`].
- Tests: 43 cases, counted by lines starting with `test(` or `it(` [read, not run].

**`packages/osm-lane-diagram`** [read]

- Pure layout. Way tags plus neighbour ways in, then a JSON scene, then an SVG string (`sceneToSvg`).
- No React, no I/O [read: README].
- Depends on `osm-lanes`, `osm-sidepath-tags` and `osm-way-chain`.
- Size: about 5,460 lines of source (layout 1,729, ribbons 1,127, from-tags 860, correspondence 659). Fixtures add 2,701 lines [read: `wc -l`].
- Tests: 77 cases counted [read, not run].

**`app/src/modes/lanes`** [read]

- About 5,670 lines in total.
- `LanesFormPanel.tsx` (901 lines) is the edit surface. It is a matrix: columns are lanes and edge features, rows are turn, width, surface, smoothness, change, vehicle, bicycle and bus.
- Some fields are way-level: lane counts, oneway, placement and lane markings.
- `LanesDiagramPanel.tsx` (234 lines) is render only. Its header says so.
- `LanesModePanel.tsx` (7 lines) shows an empty-state message: lanes editing lives in the three-column layout.
- Edit path: a matrix cell calls `applyLaneFieldUpdate`, then `commitSlotUpdate`, then `commitLaneModel`, then `handleOsmChange`. Each edit becomes one OSM change [read].
- The form reads one centre way. There is no multi-selection [read].
- Read-only: `readOnly` is true unless the user is logged in [read: `authState !== AuthState.success`].
- Add and remove lane: the package has the functions. The app does not call them from `app/src/modes` or `app/src/shell` [read by grep]. So the app has no add or remove button yet.
- A new lane gets turn `through`, vehicle `yes` and bicycle `yes` [read: `createDefaultSlot`]. `serializeWayLanes` writes each pipe that has a value. So adding a lane would write `vehicle:lanes=yes` and `bicycle:lanes=yes` [inferred from code, not run]. Maid should not write default values.
- The sketch is read-only by design. The matrix is the edit surface [read: `docs/lanes-road-space-approach.md`, section 2].
- The "planned" marker for the Lanes mode is not in `app/src/modes` or `docs` [read by grep]. The mode is wired.

### 3.2 Licence and publishing

- Root `LICENSE` is MIT. Its copyright line says "Copyright (c) 2021 zlant" [read].
- `app/package.json` says `"license": "MIT"` [read].
- The packages have no license field. All of them are `private: true` at version 0.0.0 [read].
- The package README says: "Private (monorepo-only). Eventual npm alpha planned." [read].
- The package names use the scope `@osm-editor-kit`. Maid's own packages use `@osm-editor-kit/maid-*` [read].
- The local git remote points to a GitHub repository named `osmberlin/street-space-editor` [read, not contacted].
- Copying the packages into Maid is allowed by MIT, with the copyright and licence text kept.
- The copyright line names one holder from 2021. Whether that covers code added later is a question for the authors. See Q3.
- Maid's own licence was not checked. See Q12.
- The packages need `osm-way-chain` (for `mirrorTags` and chains) and `osm-sidepath-tags`. I did not check whether Maid has equivalents.

---

## 4. iD's lanes today

Pinned reference: iD v2.42.2 (`.reference/id`).

- **No lanes field type.** The field registry in `modules/ui/fields/index.ts` has no `lanes` entry [read].
- **No lane UI code.** `grep -rli lane modules/ui` returns nothing [read].
- **Removed in 2.42.0.** The changelog says: "Remove the unused lane parsing code, which was left over from an unfinished lane editor and was not reachable from any preset" (#12664) [read, `CHANGELOG.md`].
- **What iD does with lane tags:**
  - Shows them as raw tags in the tags editor.
  - Has a directional combo for cycleway fields, for `cycleway:left` and `cycleway:right` (`modules/ui/fields/directional_combo.js`) [read].
  - Rewrites `turn:lanes` on reverse (`modules/actions/reverse.ts`) [read].
  - Uses `lanes` to estimate a highway's width (`modules/osm/way.ts`) [read].
- **Preset fields** come from `@openstreetmap/id-tagging-schema`, which is not in the pinned checkout. Maid's installed copy has no lanes key in its dist files [read, quick search]. So whether iD's preset list has a lane field is not verified here. Check it in the browser if it matters.
- **Closest iD pattern for a diagram:** the turn restriction field. It is a diagram in the sidebar, and a click edits the restriction (`modules/ui/fields/restrictions.js`, `actionRestrictTurn`) [read].

So the brief's premise ("iD has a `lanes` field with a small diagram") does not hold for the pinned iD. Maid is not copying iD here.

---

## 5. Maid's existing patterns

### 5.1 Turn restrictions section [read]

- `turnRestrictions()` (`packages/module-turn-restrictions/src/index.ts`) registers an `inspector.section`.
- It shows only for a junction node (`when`), opens by default (`disclosure: 'open'`), and loads as its own chunk (`lazyComponent`).
- The diagram is SVG (`JunctionDiagram.tsx`). Each turn is a button, with a tooltip that says what a click does.
- A click calls `cycleTurn`, then `editor.history.perform(...actions)`, then `editor.history.commit(...)`. That is one undo step (`TurnRestrictionsSection.tsx`, around lines 145–151).
- `entity.readOnly` disables the edit. The buttons stay focusable.
- **Note for Tobias:** the code does edit. Your note said "we have no edit in this UI". Please check which one you meant (Q9).

### 5.2 Street imagery dock [read]

- The module registers a `dock.view` (`packages/module-street-imagery/src/index.ts`, around line 133).
- The dock panel shows the viewer. A "use photo" button writes the open photo to the selected feature (`dock.tsx`, `UsePhotoButton`).
- So a dock view can be display only: just leave the write button out.
- The panel and viewer are loaded on first use.

### 5.3 Apps and the inspector [read]

- An app is a `maid.config.ts` with a module list, presets, filters and servers. A lane app would be one more config.
- Each module lists its features in the config: for example `turnRestrictions()` is one line in `apps/maid/src/maid.config.ts`.
- `inspector.section` items take `when`, `placement` (`top` puts the section above the fields), `multiple` and a component (`packages/ui/src/InspectorSections.tsx`).
- With several features selected, a section shows only if `multiple: true` and every feature fits `when`.
- `inspector.field` lets a module bring a field type. Preset fields of that type use the module's component (`packages/ui/src/inspector/fields.tsx`; the comment names `trafficSign` as an example).
- **Hiding preset fields:** yes. `PresetChanges` in `packages/presets/src/changes.ts` has `presetEdits` with `removeFields`, `removeMoreFields`, `addFields`, plus `universalFields.remove`. An app can do this today.
- **Hiding the raw tags sheet:** no switch found. Searches for `showTags`, `rawTags`, `hideTags` and `tagEditor` in `packages/shell`, `packages/core` and `packages/ui` found nothing [read].
- So a lane app could hide the lane fields, but lane keys could still be typed in the tags sheet. Option C needs a new switch to be the only edit path.
- The `surface()` module adds a road field ("Surface and smoothness") as an inspector field. It is the nearest precedent for a per-road field.

### 5.4 Map overlays and measuring [read]

- `packages/renderer/src/field-overlay.ts` draws, on the selected way, a side line (`side`) or a width band (`width`).
- The width band is a polygon built in metres. It keeps its real width at every zoom and latitude.
- `packages/renderer/src/measure.ts` is the measuring tool. A width field's "Measure on the map" button starts it. Two clicks set the ends, and a magnifier follows the pointer. Escape cancels.
- The inspector ends a measure when the selection changes (`Inspector.tsx`, `cancelMeasure`).
- `packages/module-parking/src/lens/layers.ts` draws side lines with MapLibre's `line-offset`. A positive value is to the right of the line's direction.
- That lens uses pixel offsets up to zoom 17. From zoom 18 it uses metres (about 2.4 m). Per-lane lines at high zoom would need the same switch.

### 5.5 Multi-selection and read-only [read]

- A section marked `multiple: true` can show for several features. Field values that differ show "Multiple values" (`fields/mixed-logic.ts`).
- Read-only comes from the entity (`entity.readOnly`). Filters set editable, read-only and hidden (`AGENTS.md`).

---

## 6. Options

All four options use the same model: `osm-lanes` for parse and write, `validateWayLanes` for warnings, and one history step per edit.

### Option A: Dock view, display only

- **Where:** a `dock.view` titled "Lanes". It shows the cross-section of the selected way and its neighbours.
- **What you see:** the lane diagram from `osm-lane-diagram`, with a legend and warnings.
- **How you edit:** you do not. Tags and fields are edited as now.
- **Direction:** backward lanes drawn in travel order on the other side. An arrow shows the way's direction.
- **Counts:** warnings from `validateWayLanes` are listed in the panel.
- **Undo:** not applicable.
- **Multi-selection:** not shown. The panel follows one way.
- **Read-only roads:** no change. The panel is display only.
- **Pros:** no write path. Lowest risk. Fastest to ship. No inspector or preset change.
- **Cons:** editing is still elsewhere. The diagram repeats what the inspector shows. It is a second place to look.
- **Size:** S for the panel (2–3 days, my estimate). M with the package ports.

### Option B: Inspector section, display only

- **Where:** an `inspector.section` (`when` a highway), placed at the top, open by default. Same pattern as turn restrictions.
- **What you see:** the same diagram, in the sidebar where the person already edits.
- **How you edit:** through the existing tags and any preset fields. The diagram updates as they type.
- **Direction, counts, undo, multi, read-only:** as option A. The section has no write path.
- **Pros:** small. The section pattern is proven in Maid. No extension point is needed.
- **Cons:** another read-only view. Lane tags are still typed by hand, so the hard parts stay hard.
- **Size:** M (about 1 week, my estimate).

### Option C: A lane app (inspector replaced)

- **Where:** a new app with its own `maid.config.ts`. Its modules include the lanes module. Lane fields are removed with `presetEdits.removeFields`. A `lanes` field type (`inspector.field`) holds the whole matrix.
- **What you see:** the matrix (columns are lanes, rows are the lane properties), with the diagram above it. This follows the street space editor's three-column layout.
- **How you edit:** matrix cells, turn buttons, add and remove lane buttons (the functions exist, the app does not call them yet).
- **Direction:** columns grouped by forward and backward. Backward reversed, as in the sibling.
- **Counts:** sum and pipe checks as errors. Whether an error blocks a commit is a choice (Q8).
- **Undo:** one history step per cell edit, as the sibling does one change per edit.
- **Multi-selection:** not in v1 (one way).
- **Read-only roads:** edit controls disabled when `entity.readOnly`.
- **Pros:** the full sibling model. Lane tags are edited only in the lane UI.
- **Cons:** needs a switch to hide the raw tags sheet, which does not exist. A second app to test and to benchmark. Dense on a phone. No iD precedent (iD has no lane editor). It breaks Maid's one-inspector pattern.
- **Size:** L (2–3 weeks, my estimate).

### Option D (hybrid, recommended): Inspector "Lanes" section with an editable diagram

- **Where:** a module `lanes` with an `inspector.section`. `when` a highway way from a list (Q5). Placed at the top, open by default. Loads as its own chunk, like turn restrictions.
- **What you see:**
  - The lane diagram of the way, drawn with its neighbours, with a legend.
  - One box per lane. Colour by kind. Width as the label.
  - Turn arrows on each lane.
  - A count row: lanes, forward, backward, both ways, with the sum check.
- **How you edit:**
  - Click a lane. A small popover opens with turn (buttons, as in turn restrictions), width (input and a "Measure on the map" button) and access (checkboxes for vehicle, bicycle, bus).
  - Add and remove lane buttons at the outer edges of each direction.
  - Each commit writes one value through `commitSlotUpdate`. Each commit is one history step.
  - Keyboard: every lane is a button. Popover fields are real inputs.
- **Direction:** the diagram shows the way's direction with an arrow. Backward lanes sit on the other side. The popover labels the direction in words, for example "backward, against the way".
- **Counts:** `validateWayLanes` warnings appear in the section (errors red, warnings amber). The same rules can also feed the Issues dock as a validation rule. Commits are allowed with a warning (Q8).
- **Undo:** the editor's history. One step per commit.
- **Multi-selection:** not in v1, so the section does not set `multiple`. Later it can show "Multiple values", as the fields do.
- **Read-only roads:** buttons are disabled when `entity.readOnly`, and stay focusable, as in turn restrictions.
- **Map overlay (optional):** while the section is open, a width band per lane on the selected way (the field-overlay pattern, in metres), and turn arrows as symbols. A toggle in the section header turns it off. It is removed when the section closes or the selection changes.
- **Pros:**
  - Edit happens where the person already is.
  - Follows the turn restrictions pattern in Maid, and iD's restriction field.
  - Keeps the tags sheet. No new extension point is needed for v1.
  - The write surface is small: one value per commit.
  - The overlay gives context on the map without a second panel.
- **Cons:**
  - A diagram with click targets is harder to make accessible than a form. Each lane needs a keyboard path.
  - A popover on a small screen needs care.
  - More code than A or B.
  - Still needs lane-tagged fixture data (Q10).
- **Size:** M for read and edit (about 1–2 weeks, my estimate). The overlay adds about 3 days.

---

## 7. Recommendation

**Option D, in small steps.** Build the read-only section first, then editing, then the overlay.

Reasons from Maid's principles:

- **Follow iD where in doubt.** iD has no lane editor, so there is no iD model to copy. iD's turn restriction field is an editable diagram in the sidebar, and D follows it. The sibling's "sketch is read-only" rule is a real difference. Q1 asks Tobias to decide it.
- **Modules.** D is one module with one `inspector.section`. An app opts in with one line in `maid.config.ts`. No app is needed.
- **One undo step per edit.** D uses `history.perform` plus `history.commit` once per commit, as turn restrictions does.
- **Tailwind look.** The section sits in the existing sidebar. The diagram is SVG, as in `JunctionDiagram.tsx`.
- **Performance.** The section loads as its own chunk. The diagram and the overlay run only while the section is open. The overlay is removed on selection change, as measuring is. After step 3, run `bun run bench-budget` with the section open on a dense fixture.
- **Automation.** Tests use fixtures and make no network requests (core rule 1). The fixtures need lane-tagged ways (Q10). Adding them is a person's job.
- **Tags sheet stays.** D needs no new switch. Option C needs one.

What D still needs:

- Porting `osm-lanes` and `osm-lane-diagram` (Q2, Q3).
- The React part of the diagram, `components/RoadSpaceDiagram.tsx` in the sibling app. I did not read it in full.
- A check that `osm-way-chain` and `osm-sidepath-tags` have Maid equivalents, or can be ported.

---

## 8. Open questions for Tobias

**Q1. Editable diagram, or read-only diagram with a form?**
- (a) Read-only diagram. Edit in fields or the matrix. (Sibling model. Options A or B.)
- (b) Editable diagram with a popover. (Option D.)
- (c) Lane app with a matrix. (Option C.)
- **Recommendation: (b).** It matches turn restrictions, and it keeps editing where the person is.

**Q2. How do we take the packages?**
- (a) Copy `osm-lanes` and `osm-lane-diagram` into Maid's `packages/` with the MIT notice.
- (b) Wait for the npm alpha, then depend on it.
- **Recommendation: (a) now.** Keep the same package names, so a later switch to npm is one line.

**Q3. Who owns the sibling code, and may Maid copy it?**
- The root LICENSE names one holder, "zlant", 2021. The packages are newer.
- Ask the authors before copying, or before publishing under Maid's name.
- **Recommendation:** confirm this with the authors first. I did not check who wrote the packages.

**Q4. Tags sheet: keep lane keys editable there?**
- (a) Keep them editable in v1. The section says that the tags sheet also works. Hide nothing.
- (b) Add a switch so that lane keys are owned by the module (new extension point, bigger change).
- **Recommendation: (a) for v1.** Decide (b) after step 5.

**Q5. Which ways get the section?**
- (a) Highway ways from the sibling's list (`map/parse-highways.ts`, not read here).
- (b) Only ways that already have lane tags, plus an "Add lanes" button.
- **Recommendation: (a)**, with the sibling's list, and show "Add lanes" when no lane tag exists.

**Q6. Map overlay on by default?**
- **Recommendation:** on, with a toggle in the section header. It is removed when the section closes.

**Q7. `access:lanes` and `cycleway:lanes`: read-only or editable in v1?**
- The package does not model `access:lanes` as primary. It keeps it as it is.
- **Recommendation:** read-only chips in v1, editable in v2.

**Q8. Do validation errors block a commit, or only warn?**
- (a) Warn only. iD also warns.
- (b) Block errors such as `lanes_sum_mismatch`.
- **Recommendation: (a).** OSM data is often inconsistent, and blocking gets in the way.

**Q9. Turn restrictions: edit or not?**
- The code edits: a turn button cycles the restriction, and one click is one history step (`TurnRestrictionsSection.tsx`).
- Your note said "no edit in this UI". Which did you mean? Check in the app before deciding.

**Q10. Fixtures with lane tags.**
- I did not check whether the frozen fixtures contain lane-tagged ways.
- Adding lane-tagged ways needs a person to cut the fixture, as a reviewed change (core rule 1).
- **Recommendation:** cut one extract with lane-tagged ways, in a reviewed change, before step 3.

**Q11. Lane app (option C): later, or never?**
- **Recommendation:** not now. Decide after step 5, when the section has been used.

**Q12. Maid's own licence.**
- Not checked here. It matters before publishing packages under Maid's name.
- **Recommendation:** check it before step 1.

---

## 9. Steps (about one hour each)

Each step ends with one thing for Tobias to test. These steps are proposed here. They are not written into `docs/build-out/steps.md`, which this brief did not allow.

1. **Copy `osm-lanes` into Maid, no UI.**
   - Done when: the package runs its tests with `bun test` and `bun run check` passes.
   - Tobias tests: the test count printed is 43, and all pass. (Pending Q2 and Q3.)
2. **Copy `osm-lane-diagram` into Maid, no UI.**
   - Done when: the tests pass, and an SVG for one fixture way is written under `reports/`.
   - Tobias tests: open the SVG in a browser and check the lanes.
3. **Read-only lanes section.**
   - Done when: the section shows on highway ways in the dev app, from a lazy chunk, and not on footways.
   - Tobias tests: select a fixture road and see its lanes. Select a footway and see no section. (Needs Q1, Q5 and Q10.)
4. **Edit one value from a popover.**
   - Done when: a turn change writes one tag, as one history step.
   - Tobias tests: change one turn, then undo once. The tag returns.
5. **Add and remove a lane.**
   - Done when: the count row and the sum check update. The write is one step.
   - Tobias tests: add a lane to a two-way fixture road. Check `lanes` and the pipes. Undo.
6. **Map overlay.**
   - Done when: width bands show while the section is open. They go when it closes or the selection changes.
   - Tobias tests: open and close the section, and check the band appears and disappears.
7. **Read-only and keyboard.**
   - Done when: buttons are disabled on read-only ways, and every lane is reachable by keyboard. The existing checks `check-edit` and `check-interactions` still pass.
   - Tobias tests: open a read-only fixture way. Tab through the lanes.
8. **Lane-tagged fixtures and a browser check.**
   - Done when: a `check-lanes` browser check exists and passes. It needs the fixtures from Q10.
   - Tobias tests: he reads the check's output and compares it with the diagram.
9. **Benchmark.**
   - Done when: `bun run bench-budget` shows no FAIL with the section open on the dense fixture.
   - Tobias tests: read the report. He says whether the budget is right.

---

## 10. Gaps and what I did not check

- The iD preset list (id-tagging-schema) was not read in full. The lanes question for iD's presets is open.
- The React diagram component in the sibling app was not read in full.
- `app/src/modes/lanes/map` (the map layers and `parse-highways.ts`) was not read. Q5 depends on it.
- The sibling's `layout.ts` and `ribbons.ts` were sized, not read.
- Maid's fixtures were not searched for lane tags.
- Maid's own licence was not checked.
- No tests were run in either repo.
