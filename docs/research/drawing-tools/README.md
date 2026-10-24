# Drawing tools for the parking editor

Five tools for drawing buildings and parking spaces faster, built as modules for `apps/maid-parking`. Research from 2026-10-16. Each note was written by one agent and checked by the orchestrator in spot checks. Nothing in them was run.

| Note | Tool | Where it lives in the UI |
| --- | --- | --- |
| [0-maid-today.md](0-maid-today.md) | What Maid has today: drawing, dragging, toolbar, operations, menu, tests, fixtures | |
| [1-angle-snap.md](1-angle-snap.md) | Hold a key while drawing or dragging: segments turn in 45° steps, corners lock to 90°, guide lines | Modifier key (Point, Line and Area stay as they are) |
| [2-three-click-rectangle.md](2-three-click-rectangle.md) | Two clicks set one wall, the third the depth | Entry in a dropdown on the Area button, plus a key |
| [3-merge-areas.md](3-merge-areas.md) | Two touching or overlapping areas become one outline (an L-shaped building from two rectangles) | Right-click menu, Merge (`C`) |
| [4-cut-areas.md](4-cut-areas.md) | Draw a line across an area to cut it in two | Right-click menu, then draw the line |
| [5-grid-and-rows.md](5-grid-and-rows.md) | Divide a four-corner area into rows × columns: parking spaces, terraced houses | Right-click menu, then rows and columns |
| [6-merge-to-multipolygon.md](6-merge-to-multipolygon.md) | An outer and an inner area merged into a multipolygon | Merge (`C`) |
| [7-resize.md](7-resize.md) | A box with handles around the selection: stretch, keep proportions, from the centre (2026-10-24) | Edit menu and command bar, proposed key `K` |

## What the research found

- **Nothing of this is in iD.** Each tool has been asked for for 10 years. iD closed most requests as JOSM territory: #2971, and #6728 for parking spaces. The exceptions are open PRs and branches:
  - the 2015 orthogonal tool (#2699)
  - Kyle's `divide` (#9020, open)
  - Tobias's angle-snap exploration (tordans/iD#7)
  - Tobias's union branch (`WIP-join-merge-areas`)
- **JOSM has all five:**

  | Tool | JOSM |
  | --- | --- |
  | Angle snap | AngleSnap |
  | Rectangle | BuildingsTools |
  | Merge | Join Areas |
  | Cut | Split Object |
  | Grid | Gridify, and Terracer for terraces |

  Their rules are the starting point; the notes list where they fail (for example JOSM ticket 21153: a cut makes overlapping areas).
- **The angle-snap exploration has four measured faults** that Maid must avoid:
  - guide lines show while the node snaps to a feature
  - pressing or releasing the key does not move the preview
  - no clean-up when the window loses focus
  - Shift at the start of a drag cancels the drag
- **The union WIP has a unit bug.** The overlap threshold is about 1e5 m², so two buildings that overlap by 100 m² do not count as overlapping. The tests miss it because they use squares several degrees wide. This is computed, not measured; the first union test must be at metre scale.
- **iD's "Split" on an area is not a cut.** It splits the outline into two open ways inside a new multipolygon and leaves the shape as it was. Maid ported exactly that (`packages/model/src/actions/split.ts`), so the cut needs a new action.
- **Maid lacks five things these tools need** ([0-maid-today.md](0-maid-today.md) section 8):
  - The draw and drag code reads no modifier keys.
  - Modules have no hook to constrain a dragged vertex.
  - The Area button has no dropdown.
  - An operation cannot take input (a drawn line, a number of rows).
  - There is no polygon boolean code.

## Plan

### Step 0: what all tools share (core, no new UI)

1. **Modifier keys in drawing and dragging.** `DrawTool.move`/`click` and `dragTo` take the pressed keys. Space placement reads them from the last pointer state. A key press or release re-runs the last move, and losing window focus clears them.
2. **Constraint hook.** One extension point that modules use to change the position of the next draw node or a dragged vertex, plus guide geometry to draw. Angle snap is its first user.
3. **Area dropdown.** Modules can add entries to a dropdown on the Area button: an id, a label, a key and the module mode it starts.
4. **Module draw modes with snapping.** A module mode can use the engine's snapping (node, then way, then free) and draw its preview from data. The rectangle and the cut line use this; reroute is the example.
5. **Operations that continue in a mode.** An operation's `run` can start a module mode instead of returning actions. Cut and Divide use this: the mode collects input and then commits **one** undo step.

Each part gets unit tests. Step 0 is done when `check-draw`, `check-edit`, `check-undo`, `check-interactions` and `check-ops` still pass in all three apps.

### Steps 1–5: one module package, one tool per folder

`packages/module-shapes` exports one module per tool: `angleSnap()`, `rectangle()`, `mergeAreas()`, `cutArea()`, `divideArea()`. `apps/maid-parking/src/maid.config.ts` turns them on one by one, so they can be compared and turned off. Each tool has its own folder, so one agent works on one folder, and each has its own browser check in `check-all` for the parking app.

| Order | Tool | Why at this point | Done when |
| --- | --- | --- | --- |
| 1 | Rectangle | Most asked for, small math, proves steps 0.3 and 0.4 | `check-rectangle`: 3 clicks give 4 right angles, one undo step, Escape leaves nothing, rotated map, preset by favourite |
| 2 | Angle snap | Proves steps 0.1 and 0.2; compare with 1 | `check-angle-snap`: the 15 cases in note 1 |
| 3 | Merge areas | Completes 1 (L shapes) | Unit tests for the 17 cases in note 3, `check-merge` |
| 4 | Divide | Simple math, reuses step 0.5 and multi-selection | Unit tests, `check-divide` |
| 5 | Cut | Hardest (relations, holes), most refusals | Unit tests for the 20 cases in note 4, `check-cut` |

Rules for all five:

- **Refuse rather than guess.** Every case the notes mark as unclear is disabled, with a sentence that says why. This is better than not having the tool.
- **One undo step per tool use.**
- **Escape changes nothing.**
- **Texts through Paraglide**, in en, de, fr and es.
- **Drawing then a preset must be fast.** After a shape is finished, the preset comes from a favourite (Alt + number), and that favourite can also start the rectangle tool directly. The browser checks time this flow.

### Decided by Tobias (2026-10-16)

- **Angle snap:** Shift = 45° steps, relative to the previous segment, corners lock to 90°. No fine step.
- **Modifier rule (Tobias, 2026-10-17):** Shift = round values (an angle to 45°, a length on the ground to 0.1 m). Alt = free (no snapping to features, as Alt already does in a drag). See [ADR 0011](../../adr/0011-drawing-tool-hooks.md), section 1.
- **Merge:** topology on shared nodes, Maid's own code, no polygon library. Nodes on the outline keep their id and position; only crossing points are new.
- **Cut:** a plain area is cut into two closed ways, both with all tags.
- **Scope:** build all five in the order above.

### Decisions with a proposed default

These proceed unless Tobias says otherwise:

**Angle snap:**
- The reference is the previous segment; the first segment is measured from map east, rotated with the map.
- Holding Shift does not cancel a drag (unlike iD).
- No snapping on touch in the first version.
- Corners lock within 30 px.

**Rectangle:**
- Key `33`: 3 starts an area, 3 again before the first click the rectangle (Tobias, 2026-10-17). Favourite numbers start at 4.
- The preview waits while the depth is under 16 px.
- No metric minimum.
- Backspace after the second click comes later.

**Merge:**
- One Merge key (`C`) picks between joining lines and merging areas.
- The older id survives.
- Refused when:
  - the tags conflict
  - the parent relations differ
  - one area lies inside the other
  - a shared node used by another way would move
  - a tagged node would be lost
  - the result has more than one part
- First version: two closed ways. Multipolygons with one outer way come second.

**Divide:**
- Shared nodes between neighbouring parts.
- Only areas with four corners; concave ones are refused.
- At most 200 parts.
- When the outline was drawn for the division, it is replaced by the parts.
- The parking lot's `capacity` is left as it is.
- No parking spaces along streets: those stay on the road's `parking:*` tags.

**Cut:**
- The line must cross the outline exactly twice.
- Refused when:
  - an edge it crosses is shared with another feature
  - the area is a route member or a roundabout
  - the outline of a multipolygon is made of several ways
  - the line touches a hole
- No key.
- The part with the longer outline keeps the id, and both parts get all the tags.

## Status (2026-10-17)

All five tools are built as modules of `packages/module-shapes` and turned on in `apps/maid-parking`.

- The hooks they use are in [ADR 0011](../../adr/0011-drawing-tool-hooks.md).
- Each tool has unit tests and a browser check: `check-rectangle`, `check-angle-snap`, `check-merge`, `check-cut` and `check-divide`. All five are in `check-all --app parking`.
- `check-all` passes for all three apps.

### Modifier rule (2026-10-17)

- **Shift = round values.** Angle snap rounds a segment's length to 0.1 m on the ground, as well as its angle. A corner lock keeps the exact corner. The rectangle rounds its wall (A to B) and its depth to 0.1 m with Shift on the clicks; a click on a node or a way keeps that node's place, so only free corners are rounded.
- **Lengths in the parking editor:** `angleSnap({ lengths: true })` shows each segment's length in metres while a line, an area or a dragged vertex is placed, with or without Shift. It is on in `apps/maid-parking` only, as the notes asked for the normal modes to stay quiet.
- **Alt = free:** the rule is decided; drawing does not yet read Alt for snapping (a drag does).
- Checks: `check-angle-snap --app parking` (35 ok, exit 0) includes a 7.33 m segment drawn with Shift, which is 7.3 m within 1 cm, and a label next to the pointer. `check-rectangle --app parking` (24 ok, exit 0) includes the wall and depth with Shift.

### Found on the way

- Snapping took the first node the map listed, not the nearest one. It now takes the nearest.
- Letting go of Shift right after dropping a dragged corner moved the corner off its right angle. A dropped corner now stays where it was dropped.
- A merge leaves no straight points behind. A corner of one area that ends up on a straight edge of the merged outline is removed, as long as it is untagged and used by nothing else. Points along a curve stay.

### For Tobias to test

Run `bun run dev-parking` and open http://localhost:5177.

1. **Rectangle:** press `3` twice (`33`), or use the small arrow next to "Fläche".
   - Click two corners of a building, then click the depth. The rectangle has right angles and the type search opens.
   - Try a favourite: Alt plus its number gives the type right away.
2. **Angle snap:** draw a line or an area with `2` or `3` and hold Shift.
   - Segments turn in 45° steps, and the last corner of an area locks to a right angle.
   - Dragging a corner with Shift keeps it square.
   - Blue dashed lines show the direction.
3. **Merge:** draw two overlapping rectangles and select both (Shift+click). Press `C`; you get one L-shaped outline.
   - With different tags, the edit menu says why it refuses.
4. **Cut:** select an area and choose "Zerschneiden" in the right-click menu.
   - Click a point outside the area, then one on the other side, then press Enter. You get two areas with the same tags.
5. **Divide:** select an area with four corners and choose "Teilen" in the right-click menu.
   - `+` and `-` set the columns, Shift with `+` or `-` the rows. Enter makes the parts and selects all of them.
   - Then give them all `amenity=parking_space` at once.

Each tool use is one undo step. Escape leaves without a change.

### Open

- **Favourites:** a favourite cannot start the rectangle tool yet. After a drawing the type search has the focus, and Alt plus the favourite's number works there. That gives the drawn shape its type in one step.
- **Help:** the help text for Shift is missing, because the shell's list of keys cannot be extended by a module.
- **Touch:** Shift needs a keyboard. A touch screen has no way to snap angles.
- **Merge:** two areas at a time, multipolygons not yet. JOSM's conflict dialog for different tags is not built.
- **Cut:** exactly two crossings per cut. A line through a concave shape that crosses four times is refused.
- **Divide:** four corners only. Parking spaces along a street are not made: they stay on the road's `parking:*` tags.
