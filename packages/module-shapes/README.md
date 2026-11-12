# Shapes modules (`@osm-editor-kit/maid-module-shapes`)

Drawing and editing tools for buildings, parking spaces and rooms: a right-angle guide, a three-click rectangle, merge, cut, divide, resize, extrude and a room drawn into a building. The package holds eight modules, one per tool, so an app turns on each one by itself.

## What a person sees / can do

| Module | Factory | How to start it | Apps |
| --- | --- | --- | --- |
| Angle snap | `angleSnap({ lengths })` | Hold Shift while placing or dragging: segments turn in 45° steps and corners lock to 90°. `lengths: true` also shows each segment's length in metres while a node is placed | parking, indoor |
| Rectangle | `rectangle()` | Area dropdown "Rectangle", or keys 3 then 3 (33). Click two corners for one wall, the pointer sets the depth, a third click commits | parking, indoor |
| Merge areas | `mergeAreas()` | Two closed areas selected, then Merge (C) in the edit menu. One outline. Different tags are refused, with the reason | parking, indoor |
| Cut | `cutArea()` | Edit menu "Cut" on one area or multipolygon. Drag the line's ends or midpoints; the two pieces are previewed. Enter cuts | parking, indoor |
| Divide | `divideArea()` | Edit menu "Divide" on one area with four corners. `+` and `-` change the columns, Shift with them the rows, Enter applies | parking, indoor |
| Resize | `resize()` | K, or "Resize" in the edit menu. A box with eight handles; Shift keeps the proportions, Alt resizes from the centre | parking, indoor |
| Extrude | `extrude()` | J, or "Extrude" in the edit menu on one way. A handle on each side pulls it out or in at a right angle; a click on the outline adds a corner | parking |
| Draw a room | `drawRoom()` | The button "Draw a room" in the add row, on while one building is selected. Click a wall, then the corners, then a wall again. The room shares its wall nodes with the building | indoor |

Draw a room makes an `indoor=room` on the level being edited (with `packages/module-levels`). In the room tool Shift turns the guide in 45° steps, Shift and Alt in 10° steps.

## Using it in an editor's config

```ts
import {
  angleSnap, cutArea, divideArea, drawRoom, extrude, mergeAreas, rectangle, resize,
} from '@osm-editor-kit/maid-module-shapes'

// apps/maid-parking, in the modules list (apps/maid-indoor has the same set without extrude, and drawRoom instead):
angleSnap({ lengths: true }),
rectangle(),
mergeAreas(),
cutArea(),
divideArea(),
resize(),
extrude(),
```

Nothing else is wired. The tools register on the editor's hooks (`draw.tool`, `draw.constraint`, `edit.operation`, `map.content`; [ADR 0011](../../docs/adr/0011-drawing-tool-hooks.md)). Tailwind needs `@source '../../module-shapes/src';` in `packages/shell/src/styles.css` (done).

## Parts

| Folder | What it does |
| --- | --- |
| `src/angle-snap/` | `angle-snap.ts`: the pure snap on screen pixels. `module.ts`: `draw.constraint` |
| `src/rectangle/` | `rectangle.ts` (geometry in Web Mercator metres), `state.ts` (the three clicks as a state machine), `mode.ts`, `commit.ts` (writes the way), `rectangle-store.ts`, `RectangleOnMap.tsx`, `icon.tsx` |
| `src/merge/` | `merge.ts` (the union of two closed ways; refusals), `operation.ts` (edit menu, key C) |
| `src/cut/` | `cut.ts` (the refusals, `splitOffPlan`: the two pieces, also used by the room tool), `line.ts`, `default-line.ts`, `mode.ts`, `cut-store.ts`, `operation.ts`, `CutOnMap.tsx`, `texts.ts` |
| `src/divide/` | `divide.ts` (plan and refusals), `division.ts` (counts and keys), `measure.ts` (sizes in metres), `mode.ts`, `divide-store.ts`, `operation.ts`, `DivideOnMap.tsx` |
| `src/resize/` | `box.ts` (the box in its own axes, handles, drags), `resize.ts` (node positions), `shapes.ts` (GeoJSON), `mode.ts`, `resize-store.ts`, `operation.ts`, `ResizeOnMap.tsx` |
| `src/extrude/` | `extrude.ts` (the sides and the pull), `shapes.ts` (GeoJSON), `mode.ts`, `extrude-store.ts`, `operation.ts`, `ExtrudeOnMap.tsx` |
| `src/room/` | `draft.ts` and `geometry.ts` (pointer and guides, pure), `target.ts` (the selected building), `mode.ts`, `room-store.ts`, `RoomOnMap.tsx`, `icon.tsx` |
| `src/shared/` | `metres.ts` (a local metre frame), `vector.ts`, `refusals.ts` (one sentence per refusal code), `keep-from-map.ts` (panel events that do not reach the map) |
| `src/messages.ts`, `messages/` | The module's texts in en, de, fr and es, compiled by `bun run i18n-compile` (project in `project.inlang/`) |

Each folder keeps its data in a `*-store.ts` (UI state, written only by the mode) and its geometry in pure files; the map parts (`*OnMap.tsx`) only draw the store.

## Tests

`bun test packages/module-shapes`: the pure geometry and state of each tool (angle snap, rectangle, merge, cut, divide, resize, extrude, room), each operation's applies and refusals, and the modes. Browser checks, one per tool, run with `bun run check-rectangle`, `check-angle-snap`, `check-merge`, `check-cut`, `check-divide`, `check-resize`, `check-extrude` and `check-room` (see [tools/checks/README.md](../../tools/checks/README.md)). Not run here.

## Open

From [steps.md](../../docs/build-out/steps.md), "Drawing tools (parking)" and the later entries:

- A favourite that starts the rectangle tool; a Shift hint in the help.
- Merge of multipolygons and of three or more areas; a cut through a concave shape; a touch alternative to Shift.
- Resize: Shift with `+` and `-` inside the mode, rounding the size to 0.1 m, and the help list of keys.
- Extrude: "as a new area" (JOSM's Alt) and distance steps for parking space depths. The name and the key J are open for Tobias.

## More

- Research and plan: [docs/research/drawing-tools/README.md](../../docs/research/drawing-tools/README.md), with one note per tool: [1-angle-snap](../../docs/research/drawing-tools/1-angle-snap.md), [2-three-click-rectangle](../../docs/research/drawing-tools/2-three-click-rectangle.md), [3-merge-areas](../../docs/research/drawing-tools/3-merge-areas.md), [6-merge-to-multipolygon](../../docs/research/drawing-tools/6-merge-to-multipolygon.md), [4-cut-areas](../../docs/research/drawing-tools/4-cut-areas.md), [5-grid-and-rows](../../docs/research/drawing-tools/5-grid-and-rows.md), [7-resize](../../docs/research/drawing-tools/7-resize.md), [8-draw-against-walls](../../docs/research/drawing-tools/8-draw-against-walls.md), [9-extrude](../../docs/research/drawing-tools/9-extrude.md).
- Hooks: [ADR 0011](../../docs/adr/0011-drawing-tool-hooks.md).
