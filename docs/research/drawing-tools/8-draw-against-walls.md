# Drawing rooms against walls (proposal for Maid Indoor)

Proposal, 2026-11-03, for Tobias to decide before anything is built. Nothing here is implemented. Sources: Maid's code,
the indoor research in [../indoor/](../indoor/README.md) (Simple Indoor Tagging, read from the wiki on 2026-10-20), and
iD's `modules/behavior/draw_way.js` on `develop` (read through raw.githubusercontent.com on 2026-11-03).

## The ask

Tobias, 2026-11-03: a drawing tool like the parking editor's rectangle, for areas and lines, that draws new geometry
with reference to the selected geometry, in the end the building. A building is taken and rooms are drawn into it. A bit
like cutting, but to add areas, not to cut one. The areas are usually rectangular, but above all they always keep their
reference to the walls, like iD's Follow when a field is glued to a forest. Check whether this is for areas only or for
lines too, and whether it goes into the Area dropdown or gets a button of its own.

## What Simple Indoor Tagging says (areas or lines?)

From [../indoor/tagging-model.md](../indoor/tagging-model.md):

| Element | Geometry | What it means for the tool |
| --- | --- | --- |
| `indoor=room`, `indoor=area`, `indoor=corridor` | area | The main case. Rooms are walled by their outline: "adjacent spaces share nodes with the wall". |
| `indoor=level` | area | The outline of one floor, often the building outline. A good reference to draw rooms into. |
| `indoor=wall` | line (centreline), rarely an area | Only where a wall is not given by a room outline, mostly inside `indoor=area` or a corridor. Runs from wall to wall. |
| `indoor=door`, `door=*` | node | On the shared outline of two rooms, or on a wall line. Glued rooms give the node it sits on. |
| `highway=steps`, `highway=elevator` (open way) | line | Lines, but they connect levels; they are not drawn against a wall. |

So: **mostly areas, sometimes lines.** The lines that are drawn against walls are `indoor=wall` (and footways for
routing that start at a door). They are straight and run from one wall to the opposite one, usually at a right angle.
Doors are nodes and need the shared outline more than a tool of their own.

Two rules follow from the data model and from Maid's level mode:

- Shared nodes only within one level. A room on level 1 must not share nodes with a room on level 0
  ([tagging-model.md, "A node shared by ways on different levels"](../indoor/tagging-model.md)). The level mode already
  locks the other levels, so they cannot be clicked or snapped to. The building outline has no level and may be shared.
- The new feature gets the chosen level, as every new feature does in the level mode today.

## What iD's Follow does

`followMode` in iD's `behavior/draw_way.js` (PRs 8671 and 9340): while a line or area is drawn, the key `F` adds the
next node of the way that the last drawn node is on, in the direction given by the second last node. Each press adds
one node. It refuses with a message when the last node is on several ways that go different ways, or when there is only
one node to go from. Maid has no Follow yet.

## Proposal

### Tool 1: "Rectangle at a wall" (areas, the main tool)

Three clicks, as the rectangle of the parking editor, but the first two are on a wall:

1. **Click 1 on a wall.** The edge of the selected area (or, with nothing selected, of the area or line under the
   pointer) becomes the reference. The click snaps onto the edge or onto one of its vertices. It is refused on open
   ground, with a hint.
2. **Click 2 along that wall.** The pointer is projected onto the reference segment, so the second corner slides along
   the wall. The preview shows the wall part.
3. **Click 3 sets the depth**, at a right angle into the area. The depth snaps onto the opposite wall (a room as deep as
   the building) and onto the far side of a neighbouring room (rooms in a row line up). The lengths are shown, as with
   the angle snap of the parking editor.

The result is one closed way and one undo step:

- Corners 1 and 2 are nodes of the reference way (inserted into it when they are not vertices already).
- A far corner that lands on an edge or vertex (the opposite wall, a neighbouring room, the second wall of a corner)
  becomes a node of that way too. A room in a corner is then glued to both walls without extra work.
- Tags come from a favourite (Alt + number), as for the rectangle; the level from the level mode.

Version 1 keeps the base to one straight segment of the wall. A wall with a bend (a room along an L-shaped wall) needs a
base that goes round the corner and a depth offset of a polyline. That is version 2, together with Follow (below).

The module: `wallRectangle()` in `packages/module-shapes`, next to `rectangle()`, whose math (two points and a depth) it
reuses. It is not indoor specific: the parking editor can glue parking spaces to a parking lot or a building to the next
one the same way.

### Tool 2: "Split off an area" (the "like cutting" idea, for any shape)

Select an area (the building, the level outline), draw a line across it from edge to edge (any number of nodes, Shift for
right angles), and the side under the pointer becomes a **new** area. The selected area stays as it is. The new area
shares all nodes along the outline it follows and the line's end nodes. This follows the outline round every bend, so it
is iD's Follow done for you, and it works for buildings that are not rectangles.

It is built from `cutArea()`, which already computes both halves of an area cut by a line. Instead of replacing the area
by the two halves, it adds one half. For the second room the reference is the space that is still free (the building
minus the rooms on this level). That needs the free face under the pointer, which is more work, so the first version
cuts the selected area only.

### Lines: angle snap measured from the wall

The line case does not need a tool of its own. Two changes to the existing line drawing and `angleSnap()`:

- When a line starts on a way, Shift measures the first segment from that way's segment (0, 45, 90 degrees to the wall),
  not from map east as today ([1-angle-snap.md](1-angle-snap.md), "Reference"). This is JOSM's base segment, taken from
  where the line starts.
- At a right angle, the pointer snaps to where that ray meets the next edge (the opposite wall), so the end node is
  shared too.

This helps every app (a driveway at a right angle to the street), and keeps the Line button without a dropdown.

### Follow (F) in the core

iD's Follow, ported to Maid's draw code (`packages/renderer/src/draw.ts`), for lines and areas in every app. With it a
normal area can be drawn along a bent wall node by node. It is a core step of its own (one commit, one check), and it is
the base for the bent-wall version of tool 1.

## Dropdown or a button of its own

**Recommended: an entry in the Area dropdown, plus an entry in the edit menu of a selected area.**

- The dropdown already holds the ways to draw a new area (Area, Rectangle, keys 3, 33, 333). "At a wall" is one more
  way to draw an area, so it belongs there (key 3333). Because the first click picks the wall, the tool also works with
  nothing selected.
- The edit menu (right click, command bar) of a selected building or room gets "Draw a room at this wall" and, for tool
  2, "Split off an area". That is how Cut and Divide start today: select, then the operation continues in a drawing
  mode (ADR 0011, hook 5). It answers "with reference to the selected geometry" directly.
- A button of its own costs space in the top bar, most of all on a phone, and would be a second Area button. It is worth
  it only if the indoor app should draw rooms against walls by default. That can come later as an app option (the Area
  button of Maid Indoor starts the last used tool) without a new extension point.

## Order, if agreed

| Step | What | Done when |
| --- | --- | --- |
| 1 | Tool 1 for one straight wall, dropdown and edit-menu entry, in Maid Indoor | `check-wall-rectangle` on the indoor scene: 3 clicks give 4 right angles, two nodes shared with the building, a far corner on the opposite wall shared, one undo step, Escape leaves nothing, level set, refused on open ground and on a locked level |
| 2 | Angle snap from the wall for lines, the ray snap to the opposite wall | `check-angle-snap` cases for a line that starts on a way |
| 3 | Follow (F) in the core | `check-follow`: as iD's cases (one way, two ways, refusals), in all apps |
| 4 | Tool 2 "Split off an area" for the selected area | Unit tests on cut's cases, `check-split-off` |
| 5 | Bent walls in tool 1, the free face for tool 2 | Later |

## Open questions for Tobias

1. Start with tool 1 (the rectangle at a wall, as asked) or with tool 2 (split off, any shape)?
2. Should the far corners be glued to neighbouring rooms automatically (shared nodes), or only to the building outline?
   SIT allows both; shared nodes make doors between rooms easy, separate outlines are easier to edit one by one.
3. Dropdown and edit menu as recommended, or a button of its own in Maid Indoor?
