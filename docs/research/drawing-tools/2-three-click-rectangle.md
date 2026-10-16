# Three-click rectangle (buildings, parking spaces)

Research, 2026-10-16. Nothing is implemented. Sources were read through the GitHub API (GET only), `git show` on the read-only checkouts, the JOSM wiki, and Maid's code (read only).

## Summary

- Every editor that has tried this (iD, JOSM, HOT) asks for the same thing: a rectangle that is square by construction, with few clicks, and a fast way to tag it. Nothing has been merged into iD.
- The iD code from 2015/16 (`origin/building-tool`, identical in the iD and Rapid checkouts) does 2 clicks: drag one wall, click the opposite corner. The third click is not used there; JOSM's "Shift" mode is the closest match to the 3-click idea.
- For Maid the core is small: two clicks give one wall, the cursor gives the depth as its perpendicular distance from that wall, and the two far corners are computed. The work is in the mode, the keys and the preset step, not in the math.
- Recommended: a rectangle mode of its own (its own key and an entry in the Area flyout), with the preset step given by Maid's existing favourites (Alt plus a number).

## 1. What exists

### 1.1 The summary comment (Tobias)

[iD issue #528, comment 4585643163](https://github.com/openstreetmap/iD/issues/528#issuecomment-4585643163) lists the threads. Status as read on 2026-10-16:

| Item | State | What it covers |
| --- | --- | --- |
| [iD PR #2699](https://github.com/openstreetmap/iD/pull/2699) | closed, not merged | The orthogonal / building drawing tool: 2 clicks, connects shapes, shift to start. Status quo of the implementation. |
| [PR #2699 comment 354591360](https://github.com/openstreetmap/iD/pull/2699#issuecomment-354591360) | (issue comment) | Wireframes for a separate "Block" button, a split button, and an info overlay. Written Dec 2017 (screenshots dated 2017-12-31). |
| [iD #5960](https://github.com/openstreetmap/iD/issues/5960) | open | Contextual top bar while drawing: Cancel/Done, and instructions. Read the request only. |
| [iD #5874](https://github.com/openstreetmap/iD/issues/5874) | open | Lock a draw mode (double-click), with quick presets (after #5873). Read the request only. |
| [iD #12498](https://github.com/openstreetmap/iD/issues/12498) | closed, duplicate | "Add 3-point Rectangle Mode for Area Features": area button becomes a dropdown, 3rd click sets depth, Backspace returns to the 2nd point. The summary says its thread has the split-button explorations; I read only the request. |
| [iD #6453](https://github.com/openstreetmap/iD/issues/6453) | closed | Toolbar item to switch the next segment between straight and 90° while drawing (the "90° alternative"). Read the request only. |
| [HOT tasking-manager #5974](https://github.com/hotosm/tasking-manager/issues/5974) | open | Request for a building tool in iD, "automatically rectilinear and tagged building=yes", similar to JOSM. |
| [iD PR #11269](https://github.com/openstreetmap/iD/pull/11269) | open | User-defined keyboard shortcuts for presets, numbers 8 to 999, stored in the browser. Built-in 1 to 3 kept. |
| [PR #3641](https://github.com/openstreetmap/iD/pull/3641) | not read | Shift with 45° snapping (named in the summary). |

### 1.2 iD: the old orthogonal drawing (`origin/building-tool`)

The branch is the same in `/Users/tordans/Development/OSM/iD` and `/Users/tordans/Development/OSM/Rapid` (head `a0744d234`, 11 files, +380 / -108 lines against the base). It is the code of PR #2699, not a later rewrite. Code is in `js/id/` (the branch predates the `modules/` layout).

How it works, step by step:

1. Holding Shift in the add-area or add-line mode (`js/id/behavior/draw.js`, `mousedown`) sets `mode.option = 'orthogonal'`. A CSS class shows the state.
2. The first wall: the user drags (or clicks) from corner A to corner B. This is the normal segment, drawn as a one-segment way.
3. Once the way has two segments (`startSegment.length === 2`), `getTargets()` (`draw.js`) computes the two far corners from the cursor:
   - `height = |B - cursor| * sin(theta)`, where `theta` is the signed angle at B between the wall AB and the cursor. That is the signed perpendicular distance of the cursor from the line AB, in screen pixels.
   - `perpendicularVector(A, B, height)` gives the offset; the corners are `q0 = A + offset` and `q1 = B + offset`.
   - The cursor is used only for the depth; its position along the wall does not matter.
4. Each corner is a click target. `elementFromPoint` at the corner finds an existing node (reused) or a way (a midpoint is inserted on the chosen edge with `chooseEdge`), otherwise a new node is created (`drawWay.addTargets`, `js/id/behavior/draw_way.js` lines 123 to 190).
5. Guard: if a target is one of the first two nodes of the way, nothing is added (no degenerate shape).
6. The temporary nodes are replaced by the real ones and the preview nodes removed, in one history step.
7. Unless Alt is held, nodes near the new shape (3 px padding) are snapped onto its edges.

Not in the branch: 45° snapping, a preset step, a toolbar item, a separate mode. PR #2699 has a TODO list that says the UI was not decided (shift was "a bit cheating" and does not work on tablets).

### 1.3 JOSM BuildingsTools

Source: [JOSM/Plugins/BuildingsTools wiki](https://wiki.openstreetmap.org/wiki/JOSM/Plugins/BuildingsTools) (read through WebFetch). The page says the plugin's source was archived in 2022 and that it draws rectangles or circles with "1 to 3 mouse clicks". This is the tool the HOT request refers to.

- Default rectangle: press **B** (or the toolbar button), click and draw a line along one side, click the opposite side to set the depth. The rectangle is created. This is the 3-click workflow.
- Width preset: with a fixed width, the first click sets a corner and the second click sets direction and length; a negative width mirrors the shape. One click gives a building.
- Length step: snaps the length to multiples of a set value.
- Two-click mode: with a way that was orthogonalised or drawn with the plugin selected, the walls snap to that way's angles.
- Auto-select: the new building is selected so the next one aligns to it; Esc deselects.
- "Big buildings" (Advanced dialog): click the first corner, hold Shift, click the opposite corner, then rotate. Without it, holding Shift lets you draw one wall and click a third corner.
- Circle: Alt+Z; Alt+R back to rectangles.
- Tags: `building=yes` by default, changeable in the Advanced options or in preferences (`buildings_tools.tags`).
- Other: address dialog (street names remembered, house numbers +2), address nodes inside a building are moved into its tags, "Disable click+drag" (two clicks only).
- The wiki says Ctrl temporarily disables snapping, and marks that as possibly outdated.

### 1.4 Rapid 3 today

No rectangle or building-drawing code in `.reference/rapid/modules/modes` or `modules/behaviors` (grep for `rectangle`, `building`, `orthog`, `square`: no hits; it has no building tool). The only building-tool code is the old `origin/building-tool` branch above, which Rapid's checkout also carries.

### 1.5 Maid today

- Modes `1`, `2`, `3` (add point, draw line, draw area): `packages/shell/src/useShortcuts.ts` lines 104 to 106, and `packages/shell/src/components/ModeButtons.tsx` (`addModes()`: one `ToolButton` per geometry, `shortcut: '1'|'2'|'3'`).
- `Space` places a node under the pointer while drawing (`useShortcuts.ts` line 117); Enter or Escape finish.
- Other keys in use: `M` move, `R` rotate, `A` continue line, Ctrl/Cmd+Z undo. `R` is taken, so the new key cannot be R.
- Flyouts exist: `packages/ui/src/Toolbar.tsx` has a `ToolGroup`, a `ToolButton`, and a flyout trigger style (line 129).

## 2. Interaction proposal for Maid

### 2.1 Toolbar

The Area button stays as it is. A small flyout on its corner (or a split button, as in iD's #12498) lists "Area" and "Rectangle". The Rectangle entry is a mode of its own, `draw-rectangle`, with its own key. The key is open: `4` is free in the current list, but I have not checked the whole key map.

Why not an Area option or a Shift modifier: Shift is the snap modifier in iD, and in #2699 it "won't work on tablets". A mode is discoverable and works with Space.

### 2.2 Keystroke sequence

Assumed: the mode key is `4`; the favourite modifier is Alt (see `packages/shell/src/components/favourites-keys.ts`).

| Path | Inputs | Notes |
| --- | --- | --- |
| Plain | `4`, click A, click B, move, click C | Click C finishes the way, one undo step; the sidebar asks for the preset (`drawing.ts`, `drawClick`). Then type a preset name and Enter. About 8 to 10 inputs with the preset. |
| Favourite | `Alt+n` (n = the "Building" favourite), click A, click B, click C | The favourite already sets the tags at start (`shell/src/favourites.ts`, the `pending` favourite). About 4 inputs. Needs one change: the favourite must start `draw-rectangle`, not `draw-area` (`ADD_MODE` maps area to `draw-area` today). |
| Keyboard only | `4`, Space at A, Space at B, Space at C | Space places a node at the pointer; the pointer stays where it is. Works for tablets and keyboards. |

Escape while drawing: nothing is committed yet, so it reverts the preview. Backspace after B goes back to choosing B (from #12498). Undo after finish: one step, like any other way.

### 2.3 The preset step

- The existing favourites are the right mechanism: a favourite is a preset with a number, numbers are unique, and holding Alt and typing the number starts it (`packages/ui/src/favourites.ts`).
- Proposal: a "Building" favourite starts `draw-rectangle` when it is an area favourite with a `shape: 'rectangle'` flag, or when the favourite is for a rectangle preset. The decision is open (section 7).
- "Remember last preset" for plain rectangles: after finish, offer the last preset used for a rectangle as the first choice in the picker. iD's wireframe 4 proposes copying the tags of the previous shape; that needs a clear rule (only the same preset, never a building number) and should be a later step.
- iD PR #11269 (user-defined shortcuts for presets, 8 to 999) is open and would overlap with favourites. Maid already has its own numbering, so no need to copy it.

### 2.4 Drawing feedback

- The preview is two extra nodes: during step 3 the far corners follow the cursor (`engine.dragTo`), as the current `DrawTool.move` does for one node (`packages/renderer/src/draw.ts`). `finish()` must delete both preview nodes, not one.
- Show the depth in the status line or as a dimension label (JOSM does this in its status bar; iD's #5960 asks for instructions in the top bar).

## 3. Geometry

Notation: A and B are the clicked wall corners, C the third click, n the unit normal of AB on the side of C, d the signed distance of C from line AB. Compute in projected (Mercator) coordinates, not in lon/lat degrees: Mercator is conformal, so right angles on the map are right angles on the ground at that latitude; lon/lat degrees skew angles by cos(lat).

- Corners: D = A + n·d and E = B + n·d. Depth is `d = cross(B - A, C - A) / |B - A|`, i.e. only the perpendicular distance counts. C moved along the wall does not change the shape.
- Side: the sign of d picks the side. The preview shows it.
- Snapping of A and B: as in Maid's `DrawTool.target` (node, then way, then free) with `SNAP_PX = 8` (`packages/renderer/src/snap.ts`). A click on an existing node reuses it; on a way it inserts a midpoint (the same as iD's `AddMidpoint`).
- Snapping of D and E: the same rule. If D or E lands on an existing node, that node is used, so neighbouring buildings can share a corner.
- Snapping of C: C is not a corner; no snapping is needed, except that the preview can show the snapped corners.
- Two clicks on an existing building edge: A and B are both existing nodes of the same way. The new rectangle shares that wall and adds no new nodes for it (row houses). Then D and E are new unless they snap.
- A rectangle that crosses or overlaps an existing way is allowed; the validation rules (`packages/validation`) report it. Do not block it in the tool.
- Degenerate cases, refused at each click so the preview stays and waits:
  - A equals B (or within `SNAP_PX`): no wall yet; step 2 keeps waiting.
  - |d| below a minimum (proposal: 2 × `SNAP_PX`, about 16 px): C is on the wall; nothing is finished.
  - Any two of A, B, D, E are the same node (a snap to a corner that is already in the shape): refused, the same guard iD has.
  - A metric minimum (for example, no side shorter than 1 m at the current zoom): open question (section 7).
  - Too large: `packages/operations/src/too-large.test.ts` shows Maid already has a too-large rule; reuse it.
- Map rotation (`R`) and bearing: angles are invariant under rotation and Mercator is conformal, so the same math holds at any bearing. Test it (section 6).
- One history step: the finish is a single `engine.change`, like `DrawTool.finish()` for lines and areas. Cancel reverts to before the first click.
- Preview ways are real data in the working history (the design in `draw.ts`), so the preview is drawn by the normal redraw. Rectangle preview is the same, with the two extra nodes.

## 4. Rectangle tool vs. angle snap

Two approaches, not exclusive:

| | 3-click rectangle | Angle snap (Shift or a toggle while drawing) |
| --- | --- | --- |
| Shapes | Rectangles only | Any polyline or polygon whose corners are right angles: L-shapes, sheds, extensions |
| Clicks per building | 3 | 4 or more; corners are still placed by hand |
| Squareness | Guaranteed by construction | Only as good as the snap; a corner can drift |
| Interaction | One mode, easy to explain | A modifier held the whole time; not usable on touch |
| Implementation | Small: one mode, math, two preview nodes | Moderate: a constraint on each new segment, plus the same snapping |
| Existing code | None in Maid; iD branch is the reference | Maid has `actionOrthogonalize` in `packages/operations` (the Square operation, `operations.ts` around line 349) |

Recommendation: build the rectangle mode first (most buildings and parking spaces are rectangles, and the 3-click flow is what mappers asked for). Later, use the existing Square operation for the rest. Angle snap while drawing can come as a separate step.

## 5. When to disable the tool

Clear rules, so nobody has to guess:

- Not for lines or points; only the area geometry (and a favourite with the rectangle flag).
- Not in a read-only or hidden layer (the existing read-only rules apply).
- Refuse the click, do not finish, when: A equals B; |d| below the minimum; two corners are the same node; the shape is too large.
- No snapping while Alt is held, as iD does (but Alt is also the favourite modifier, see section 7).
- Escape or switching mode cancels and reverts; nothing is left behind.
- Not for multi-selection or for a selected way being reshaped; this tool only creates new ways.

## 6. Test plan

### 6.1 Unit tests (pure math, no browser)

A new `packages/renderer/src/rectangle.ts` with `rectangleCorners(a, b, c)` returning D and E, or undefined when degenerate. Tests in `rectangle.test.ts`:

- A=(0,0), B=(10,0), C=(5,4): D=(10,4), E=(0,4). C=(5,-4): corners on the other side.
- C=(20,4) gives the same corners as C=(5,4): only the depth counts.
- C on the wall (d=0): undefined. A equals B: undefined.
- All four angles are 90° within 1e-9 for random A, B, C in projected metres.
- Same test at lat 0 and lat 60 in Mercator (right angles hold); a test that uses lon/lat degrees fails at lat 60 (this guards the projection choice).
- Rotation invariance: rotating A, B, C by any angle rotates the corners by the same angle.
- Snapping: a corner within `SNAP_PX` of an existing node reuses its id; of a way inserts a midpoint on that edge.
- Shared wall: A and B are existing nodes of one way; the result adds two new nodes, not four.
- Finish is one history step: after finish, one undo removes the whole shape; cancel leaves no nodes.

### 6.2 Browser check (`check-rectangle`, proposed)

Add `tools/checks/check-rectangle.ts`, listed in `tools/checks/check-all.ts`, run with `bun run check-rectangle --app maid` after `bun run dev`. It uses real input on the `small` scene and compares data and map after each step, like the other checks (`check-draw` is the model):

1. Press `4`. Click A, click B (a 120 px wall). Move the pointer 40 px to one side: the preview shows two corners on that side.
2. Click C. Expect one new way with four nodes, closed, all right angles in `window.__maid` data (within 0.5°), one undo step, and the sidebar shows the preset picker.
3. Undo: the way is gone. Redo: back.
4. Escape after B: nothing added, no way left.
5. Click A on an existing node: that node id is used. Click C on the other side: the preview flips.
6. Favourite: Alt+n with the Building favourite, then three clicks: the way has the building tags and no preset step.
7. Space path: the same shape with Space at A, B, C.
8. Rotate the map (`R` mode or the rotation key) and repeat step 2: the shape stays square.

Pass: exit code 0 and the expected number of `ok` lines. Per AGENTS.md, parallel agents do not run browser checks; this one is run by the orchestrator.

## 7. Open questions for Tobias

1. Mode or flag: a separate `draw-rectangle` mode with its own key (my proposal), or a `shape` option on the Area favourite only?
2. Key: is `4` free for good, or is another key (Maid uses `R` for rotate, `A` for continue)?
3. Alt: it is the favourite modifier, and iD uses Alt to turn snapping off. Keep Alt for favourites and use another key for "no snap", or drop the no-snap rule?
4. Minimum sizes: depth in pixels (about 16 px proposed), and a metric minimum (1 m? 2 m?)?
5. Backspace after B (from #12498): wanted in the first version or later?
6. Preset after finish: keep the sidebar picker, or always apply the last rectangle preset (the iD wireframe 4 idea)?
7. Should the tool be on the toolbar at all, or only on keys and the favourite (less UI)?
8. Angle snap (Shift-style, iD #2699 / #3641): a later step, or not wanted?
9. Parking spaces: a rectangle with a preset `amenity=parking_space`; does the tool need a default width/length (JOSM's width preset) for them?

## Not read or not verified

- The full threads of iD #5960, #5874, #12498, #6453 (I read the request bodies only).
- iD PR #3641 (45° snap), #5873 (quick presets).
- Rapid's own code beyond the grep for building and rectangle terms.
- Whether a Maid module can register a new mode: there is an `engine-module-mode.test.ts`, which suggests yes; not read.
- The date of PR #2699 (its images are from about 2015; not checked on the API).
