# Angle snap while drawing and dragging

Research only. Nothing in Maid or iD was changed, built, run or committed.

Sources: iD at its develop merge base (3a4298c3) and the exploration branch `iD--45-degree-angles` in tordans/iD (PR #7); Maid at `main` (8300172). Each finding is labelled **measured** (read in code or commit text) or **inferred** (reasoned from code, not run).

## 1. What exists today

### iD (openstreetmap/iD, develop)

- **No angle snap while drawing.** Shape by hand, then square with the Square operation (`modules/actions/orthogonalize.js`). It alters corners within 13 degrees of 90 or 180 and works on closed ways and connected lines, not on separate lines. Maid has the same tool: `packages/model/src/actions/orthogonalize.ts` (threshold 13) and the "square" operation in `packages/operations/src/operations.ts`.
- **Alt in drawing** turns off snapping to features: `modules/behavior/draw.js`, `datum()` returns `{}` when `altKey` is set (line 47). The "nope" marker is hidden too.
- **Shift in browse and select** starts a lasso when pressed on empty map: `modules/behavior/lasso.js`, `pointerdown` checks `shiftKey`. The lasso is wired only into `modes/browse.js` and `modes/select.js`, not into the draw modes, so there is no lasso conflict while drawing (measured from the imports).
- **Shift when a node drag starts** cancels the drag: `modules/modes/drag_node.js`, `start()`, `_isCancelled = ... || d3_event.shiftKey` (measured).

### The exploration (tordans/iD PR #7, branch `iD--45-degree-angles`)

- Five commits, 12 files, about +996 lines. The PR body text is in `pr.md` on the branch; the `gh pr view` output I read did not show a body, only deploy comments.
- Shift = 45 degrees, Shift + Alt = 10 degrees (`modules/behavior/draw_angle_snap.ts`, `drawAngleSnapStep`).
- Reference: the previous segment; for the first segment, the screen horizontal.
- An area's draw node sits between the last node and the closing first node, so it has two neighbours. It locks to the exact corner when the cursor is within 30 px of where the two snapped rays meet (`NODE_ANGLE_SNAP_RADIUS_PX`).
- Blue dashed guide lines drawn through the neighbours (`modules/behavior/draw_angle_guide.ts`, CSS in `css/20_map.css`).
- Dragging an existing node uses the same logic (`modules/modes/drag_node.js`, `doMove()`).
- Help text and tooltips (`data/core.yaml`, `modules/ui/tools/modes.js`) and shortcut entries (`data/shortcuts.json`).
- Tests: 12 unit tests in `test/spec/behavior/draw_angle_snap.ts`, all on the pure helpers. No test drives `draw_way.js` or `drag_node.js` with input, and no `check-*` script was added.

### Prior art

- **openstreetmap/iD#3641 "Pretty angles"**: closed 2017-07-24, not merged. Shift for 45 degrees on the next segment of lines and on the first and last segment of areas (described in #3637). A reviewer found a graph error in the console, later traced to master and unrelated. In 2018 a maintainer wrote that it was "really wasn't any better than just clicking and squaring"; a user replied that closing an area orthogonally saves one click. Maintainers wanted to rework `draw_way`/`draw_area` first.
- **openstreetmap/iD#3637** "Orthogonal / isogonal angle drawing": the issue for #3641, closed 2017. Same discussion.
- **openstreetmap/iD#6453** (2019, closed): a toolbar item to switch between straight and orthogonal segments, 90 degrees relative to the previous segment. Requests for 30/45/60 degrees and a JOSM-like key `A` followed.
- **openstreetmap/iD#1957** (open since 2013): snap new nodes to existing node positions and to selected angles. Lists the limits of the square tool: only closed or connected lines, trouble when nodes are a few pixels apart, no alignment with neighbouring ways.
- **openstreetmap/iD#2277** (closed 2014): draw a rectangle in two clicks. pnorman's point: a rectangle has five degrees of freedom and two clicks give two.
- **Summary comment** by tordans, 2026-05-31, on openstreetmap/iD#528 (comment 4585643163): lists the status quo as #2699 (UI explorations, Shift as a trigger), Shift at 45 degrees explored in #3641, and the 90-degree toolbar in #6453.
- **JOSM AngleSnap** (https://josm.openstreetmap.de/wiki/Help/Action/Draw/AngleSnap, read through a summary tool, not checked against the wiki source): press `A` twice in draw mode, or use the Edit menu. Ctrl + hover (or right-click) a segment to make it the base segment. The reference is that chosen segment, not the previous segment or the screen. Angles of +-30, 45, 60, 90, 120, 135 and 150 degrees, and 0, from the base. While drawing a way, it also snaps to 90 degrees from any node of the same way. The page says it is incomplete.
- **Design tools** (Illustrator, Figma, PowerPoint, LibreOffice; Inkscape uses Ctrl with 15 degrees): the table in the PR body. Not verified here. Shift = 45 degrees is the common convention per that table.

## 2. What is broken or awkward in the exploration

### Measured (read in code or commit text)

- **M1. Guides show while the node snaps to a feature.** `draw_way.js` `move()` calls `refreshSnapGuides()` after the node and way branches, so guides appear even when the draw node was snapped onto an existing node or way. `drag_node.js` `doMove()` calls `drawSnapGuides()` regardless of the target. The guides then show a direction the node does not take.
- **M2. A key press or release does not move the node.** `keydown` and `keyup` in `draw_way.js` and `drag_node.js` only refresh the guides; neither calls `actionMoveNode`. The draw node or dragged node keeps the position of the last pointer move. After Shift is pressed, the preview is not snapped until the pointer moves. After Shift is released, the node stays snapped. A click places the node snapped (`add()` snaps), so preview and result can differ until the next move.
- **M3. No blur handling.** `grep` finds no `blur` in `draw_way.js` or `drag_node.js`. If the window loses focus while Shift is held, `keyup` is missed and the guides stay until the next pointer move. The move handlers recompute from event flags, so the stale state ends with the next move. Impact **inferred** as cosmetic plus a stale preview.
- **M4. Shift + Alt disables feature snapping.** `draw.js` `datum()` returns `{}` when `altKey` is set, so a Shift + Alt click over a node or way cannot connect. The PR calls this "precision mode". It is a choice, and it hides a feature behind a chord.
- **M5. Shift at drag start cancels the drag.** This is iD's existing rule (`drag_node.js` `start()`), kept by the exploration. Holding Shift before grabbing a vertex gives no drag and, on the map, a lasso. The exploration makes Shift more important during drags without changing this.
- **M6. Freeze after finishing (fixed).** Commit `06d7f4db5`: guide refresh on the `drawn.draw` event threw during `finish()`, which stopped the dispatch and left the map looking frozen. Fixed by removing that refresh and wrapping the guide functions in try/catch. The catch-all silences future errors in guide code (**inferred** risk).
- **M7. Teardown order (fixed in `9e07bde85`).** Guide cleanup now runs last. Fine as it stands.
- **M8. Tests.** 12 tests of helpers only. Nothing checks drawing or dragging with real input. No `check-*` script or `check-all` entry.
- **M9. Corner lock uses infinite lines.** `intersectLines` returns where two lines cross, not where two rays meet. The result may lie behind an anchor, and only the distance to the cursor is checked. Not reproduced; **inferred** risk.

### Measured as working

- Clicks on an existing node or way are not angle-snapped. `add()` only runs for free clicks; `clickNode` and `clickWay` bypass it. Space placement goes through `click()` and so gets the same snap.
- The feature snap wins over the angle snap when both apply (same order in `move()` and `doMove()`).

### Inferred

- **Touch.** No modifier keys on touch. The diff has no alternative, so a touch user gets no angle snap.
- **Bearing.** iD has no map rotation. Maid does, so "screen horizontal" is not map east or north after rotation (section 3).

## 3. Geometry cases

Angles are computed in projected screen pixels, as iD does. Web Mercator is conformal, so a right angle on the ground is a right angle on screen locally. Do not compute angles in raw lon/lat degrees.

Two reference frames: relative to a segment (turns with the building) and absolute (map east). Under bearing, an absolute reference must be rotated by the bearing. Take it from the projection of a point offset east from the anchor, not from screen x.

| Case | Proposed behaviour | Notes |
| --- | --- | --- |
| First segment of a line (one neighbour, no reference) | Steps measured from map east, rotated by bearing | iD: screen horizontal. Exploration: screen horizontal. |
| Middle segment (one neighbour, reference = previous node) | Steps relative to the previous segment | Same as iD and the exploration. |
| Area closing corner (draw node between last and first node) | Both edges snap; corner lock within the radius | For a 3-node area both references are the same node (**inferred** from `sidesForWay`). Test it. |
| Click on the first node | Closes the area; the feature snap wins | No angle applied to a click on a node. |
| Dragging a vertex with two neighbours in one way | Same corner logic as drawing | The exploration's `nodeSides()` takes the first parent way with neighbours. |
| Dragging an endpoint (one neighbour) | Relative to its one segment; if the line has two nodes, absolute | |
| Vertex shared by several ways | Use only the way being drawn or dragged; if unknown, skip the angle | The exploration takes the first parent way. Ambiguous, so do not guess. |
| Multipolygon member ways | Relative to the member way being dragged; neighbours in other members are ignored | Shared nodes of outer and inner rings follow the same rule. |
| Snapping to existing nodes or ways while the modifier is held | Feature snap wins; no guides | Same as iD and the exploration. Shift + Alt (if chosen) turns features off. |
| Very short segment (cursor within about 4 px of the anchor) | No angle; the direction is noise | Threshold to be tested. |
| Corner lock with rays that meet behind an anchor | Reject; use the nearest single ray | Fixes M9. |
| Corner farther than the radius (30 px) | No lock; nearest single pretty ray | As the exploration. |
| Map rotation (bearing) | Relative steps unchanged; absolute steps rotated; guides drawn in the same frame | See above. |
| Near 180 degrees (straight continuation) | Allowed; a straight segment is a valid angle | |

## 4. Proposal for Maid

### Modifier

- **v1: Shift = 45 degrees**, while drawing a line or area and while dragging a vertex. Points, midpoints and module-mode handles are excluded. The Point, Line and Area buttons stay as they are; no new toolbar item.
- **Not Ctrl.** On a Mac Control with a click is the right-click menu (`packages/shell/src/components/MapView.tsx`, comment near line 303).
- **Not Alt alone.** Alt already means "free" in a drag (`MapView.tsx` lines 351 and 359 pass `free: event.originalEvent.altKey`) and turns the map on open ground in browse mode (`startTurnOnOpenMap`).
- **Optional fine step** (Shift + Alt = 10 degrees with feature snap off). It fits Alt = "free" in a drag only if Shift + Alt also turns features off, as the exploration does. Not in v1 unless Tobias chooses it (question 1). Keep the step as a config constant, default 45, with 15 and 30 allowed.
- **Shift in browse stays multi-select** (`MapView.tsx` around line 569). No conflict while drawing.
- **Shift-drag lasso** (missing in Maid; interactions-vs-id.md gap 9): when built, it must start only in browse and select, as in iD, so it never starts during a draw or a drag.

### Reference

- **v1: previous segment**; first segment: map east, rotated by bearing.
- **Later, open:** a chosen base segment (JOSM) or a nearby building edge (the #1957 idea). Not in v1.

### Where it hooks in

- `packages/renderer/src/draw.ts`: `move(point, layers)` and `click()` take the modifier state; after `target()` returns free, apply the angle snap. Callers: `MapView.tsx` around line 362 (`engine.draw.move`) and line 542 (`drawClick`). Space placement reads the last pointer (`setEnginePointer`, `MapView.tsx` around line 331); it must read the same modifier state.
- `packages/renderer/src/drag.ts`: `dragTo(id, lon, lat, aim)`. When there is no aimed target and the drag is not free, apply the angle snap against the node's neighbours from `engine.data` (`nodeWays`, way node lists).
- New pure module `packages/renderer/src/angle-snap.ts` with `angle-snap.test.ts`, beside `snap.ts` and `snap.test.ts`. It holds the step rule, the corner solver and the guide segments.
- Guides as a GeoJSON source of lon/lat lines through a declarative `<Source>`/`<Layer>` (react-map-gl rule in AGENTS), driven from state. If per-move `updateData` is needed for speed, keep it inside the renderer with a comment.
- Keys: window `keydown`/`keyup` listeners in the style of `packages/shell/src/components/FavouriteHint.tsx` (lines 74 to 79). On key change, re-run the last move with the current modifier state (fixes M2). Clear on window `blur` (fixes M3). Ignore keys while focus is in a text field (the `inField` check in `favourites-keys.ts`).
- Touch: no change in v1 (question 4).

### When it is off (rules)

1. Off in browse, select, add-point, measure, turn, move and rotate, and module modes.
2. Off for points and midpoints (no neighbours).
3. Off while the cursor is within `SNAP_PX` (8 px) of a node or way: the feature wins and no guides show.
4. Off unless the modifier is held.
5. Off within about 4 px of the anchor (to test).
6. Off when the vertex has neighbours in more than one way and the way being edited is not known.
7. Off while focus is in a text field.
8. Off on touch in v1.
9. Corner lock only inside 30 px and only when the intersection lies ahead of both anchors.

### Text and labels

- Help text and the tooltip hint in `packages/i18n` (en, de, fr, es). `bun run i18n-check` must pass.

### Module for the parking app

- The drawing and dragging code is in `packages/renderer`, not in a module. A module would need extension points that do not exist yet for it (not checked in this pass; see section 7).
- **Option A (recommended unless extension points already cover it):** a core feature behind an `AppConfig` flag in `maid.config.ts`, off by default, on in `apps/maid-parking`.
- **Option B:** `packages/module-angle-snap` with its own extension point. Needs a check of `packages/core`.

## 5. Test plan

### Unit (Vitest, pure functions, `packages/renderer/src/angle-snap.test.ts`)

- Step rule: 37 degrees from horizontal gives 45; 22 gives 0; 23 gives 45 (boundary at 22.5). Wrap-around across +-180: a reference at 179 degrees and a cursor at -179 snap across the seam to 180.
- Distance from the anchor is preserved (tolerance 1e-9). Zero distance returns the cursor unchanged.
- Bearing 0 and bearing 30: the absolute reference shifts by 30.
- Corner lock: anchors A=(0,0), B=(100,0), C=(100,100), cursor (3,104) locks to (0,100) within 1e-6. Cursor 40 px away gives no lock. Parallel rays return null. A corner behind an anchor is rejected (constructed case).
- Guides: an endpoint gives one segment through the anchor, long enough to cross the viewport diagonal. A corner gives two segments crossing at the snapped corner. No neighbours or null step gives none.
- Precedence: with a feature target present, the angle is not applied (test the decision function).
- Modifier mapping: none gives null; Shift gives 45; Shift + Alt gives 10 only if that is chosen.

### Browser check (new `check-angle-snap`, fixtures only, `--app maid`)

Use real input (keyboard down/up for Shift, mouse moves and clicks), compare `window.__maid` data after each step, and print one `ok` line per check. Add the script name to the AGENTS table when it exists.

1. Line: click A, move to about 37 degrees with Shift held, click B. Segment angle is 45 +- 0.1 degrees on screen.
2. Continue the line at a right angle with Shift: the dot product of the two segments is below 1e-3.
3. Area: three corners with Shift; fourth corner 15 px from the true corner locks. Click the first node to close. The four corners are square within 0.5 px. One undo removes the whole area.
4. Press Shift without moving: the draw node moves to the snapped position at once (fails in the exploration, M2).
5. Release Shift without moving: the draw node goes back to the free position (M2).
6. Shift over an existing node while drawing: the node is reused (same id), no guide features (M1).
7. Shift over a way: a node is inserted in the way, no guides.
8. Shift + Alt over a node: no connection if Shift + Alt is chosen; otherwise the same as Shift alone.
9. Drag a corner vertex with Shift: the fourth corner locks; undo restores.
10. Hold Shift when a drag starts: the drag still starts (Maid's behaviour; the difference from iD is recorded).
11. Dispatch window `blur` with Shift held: guides cleared, draw node unchanged (M3).
12. Touch emulation: no angle snap, positions unchanged.
13. Bearing 30 degrees, first segment: angle measured from map east, not screen.
14. A 3 px move with Shift: no change of direction.
15. Regression: `check-draw`, `check-edit`, `check-undo`, `check-interactions` exit 0; `check-render` unchanged for scenes without a modifier.

## 6. Open questions for Tobias

1. v1 Shift only (45 degrees), or also Shift + Alt for 10 degrees with feature snap off? Alt means "free" in a drag today.
2. Should Alt alone turn off feature snapping while drawing, as iD does? Today Maid's draw path takes no modifier (`draw.move` has no flags), so Alt does nothing there.
3. Previous-segment reference only in v1, or also a JOSM-style chosen base segment? If so, which key (Ctrl is the Mac right-click)?
4. Touch: a sticky toggle in the draw toolbar (like iD#6453), or defer?
5. Is a 30 px corner-lock radius in screen pixels right?
6. Guides: hide them when a feature is under the cursor (recommended), or keep them?
7. Core behind an `AppConfig` flag, or a module for the parking app? Needs a check of `packages/core` extension points.
8. Keep the rule that Shift at drag start cancels the drag (iD)? Recommend no, as Maid does now.
9. Show the current angle as a readout while the modifier is held?

## 7. Unsure, and not checked

- Not run: no tests, no browser, no dev server. Everything marked measured is from reading code and commit text.
- The JOSM page was summarised by a tool, not read from the wiki source.
- The design-tool claims are the PR's table, not checked.
- M9 (corner behind the anchor) is not reproduced.
- The first-segment bearing rule and the 4 px threshold are proposals, not measured.
- `packages/core` extension points were not read in this pass.
- The `pr.md` text was read from the branch; the GitHub PR body was not in the `gh pr view` output.

## Links

- tordans/iD PR #7 (branch `iD--45-degree-angles`): https://github.com/tordans/iD/pull/7
- openstreetmap/iD#3641: https://github.com/openstreetmap/iD/pull/3641
- openstreetmap/iD#3637: https://github.com/openstreetmap/iD/issues/3637
- openstreetmap/iD#6453: https://github.com/openstreetmap/iD/issues/6453
- openstreetmap/iD#1957: https://github.com/openstreetmap/iD/issues/1957
- openstreetmap/iD#2277: https://github.com/openstreetmap/iD/issues/2277
- Summary comment: https://github.com/openstreetmap/iD/issues/528#issuecomment-4585643163
- iD orthogonalize: https://github.com/openstreetmap/iD/blob/develop/modules/actions/orthogonalize.js
- JOSM AngleSnap: https://josm.openstreetmap.de/wiki/Help/Action/Draw/AngleSnap
- Maid: `docs/research/snapping-and-node-preservation.md`, `docs/research/interactions-vs-id.md`

## Summary

1. The exploration works in the common cases, but it has four measured faults: guides appear while the node snaps to a feature (M1), key presses do not move the preview (M2), there is no blur handling (M3), and Shift cancels drags that start with it (M5).
2. The freeze found earlier (M6) is fixed, but the try/catch around the guide code hides future errors.
3. Shift + Alt turns feature snapping off, so a precision click cannot connect (M4).
4. Prior art: #3641 was not merged; #6453 asked for a 90-degree toolbar toggle and was closed. The maintainers' concern was that angle snapping saves little over squaring after drawing.
5. JOSM uses a chosen base segment, not the previous one; iD and the exploration use the previous segment.
6. Maid proposal: Shift = 45 degrees in draw and drag, previous-segment reference, first segment from map east (bearing-aware), guides as a declarative layer, key listeners that re-run the last move.
7. Maid's Alt is already "free" in drags and turns the map in browse, so it is not a good fine-step key without a decision (question 1).
8. The proposal has a clear list of when it is off, and a 15-case browser check that uses real input and fixtures only.
9. Not run: no tests, no browser; the JOSM page was read through a summary tool.
10. Unsure: the corner-behind-anchor case (M9), the 4 px threshold, the bearing rule for the first segment, and the core-or-module choice for the parking app.
