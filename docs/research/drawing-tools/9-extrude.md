# Extrude: pull one side of an area out or in

Plan from 2026-11-10, built the same day (see section 6), asked for by Tobias from a Mastodon post (rphyrin, 2026-10-30, "TIL: JOSM's Extrude"): a mapper learned in a HOT validator training to add two nodes on a building wall, press X in JOSM and drag the part between them out. Tobias wants the function in Maid as an optional module, on in the parking editor, with a UX that fits Maid's other drawing tools rather than a copy of JOSM's.

Sources: the post and weeklyOSM 850 (through a search summary; mastodon.social and josm.openstreetmap.de are not reachable from the agent's network), the JOSM help page [Help/Action/Extrude](https://josm.openstreetmap.de/wiki/Help/Action/Extrude) through search summaries of several of its versions, and Maid's `packages/module-shapes` (Resize is the template). Nothing of JOSM was run.

## 1. What JOSM's Extrude does

Extrude is a JOSM mode (key X), not a plugin. It works on the segment under the pointer:

| Gesture | Result |
| --- | --- |
| Drag a segment | The segment moves out at a right angle to itself and two new nodes are made: the old corners stay, two new walls join them to the moved segment. A bump (or a notch, dragged inwards). |
| Ctrl + drag | "Move segment in parallel": the two nodes of the segment move, no node is added. With "dual align" (X X) each node moves along its neighbouring segment, so the neighbours keep their direction. |
| Alt + drag | A new way next to the segment instead of changing it. |
| Double-click a segment | Adds a node there (to bound the part to pull out). |
| Ctrl + drag a node | Moves it along a neighbouring segment. |

Known complaints: extruding the side of a rectangle used to leave nodes on a straight line (talk-de 2011, "überflüssige Nodes im Extrude-Modus"); Ctrl is the Mac's right-click.

## 2. What Maid has

- **Resize (K)**, `module-shapes/src/resize/`: an operation whose `start` enters a module mode with handles (`handleLayers`), a panel at the top centre with toggles that a held key turns round, Enter/Escape, the result drawn from a store. The template for this tool.
- **Midpoint handles** in browse mode add a node to a segment by dragging; there is no "add a node here" click inside a module mode yet, but a mode with `snap: true` gets the place on a way under the pointer (`SnapTarget` `type: 'way'` with `edge`).
- **Angle snap with lengths** and the rectangle's size labels: the look for a length while dragging.
- **Keys:** J is free in Maid, iD and Rapid (7-resize.md §1). X is Split in Maid and iD.

## 3. The tool in Maid

**Name:** "Extrude" (de "Extrudieren", fr "Extruder", es "Extruir"), as JOSM calls it, so the training material and the post match. **Key J.** Edit menu and the inspector's command bar, group `position` next to Resize.

**Applies to** one selected way, an area or a line, whose nodes are all loaded, with at least one segment. Refused with a sentence when it is not complete, or when too little of it is in view (as Resize).

**The mode.** Every side of the way gets a handle at its middle: a white dot with a blue ring, like Resize's edge handles. (A tick across the side for the direction was planned, but a line in metres is too short to see at zoom 18 and the sprites have no arrow; the panel's text says it instead.) A panel at the top centre, as Resize's, says what to do and holds one toggle and Done.

- **Drag a handle:** the side follows the pointer at a right angle to itself; the map shows the way as it would be (light blue fill, blue line) and the distance in metres next to the side. Letting go keeps it as **one undo step**, and the mode stays on for the next side, as JOSM's.
- **Default, "new corners":** the old corners stay and two new ones are made, the bump of JOSM. But at a corner whose next side already runs at about a right angle to the pulled side (within 10°), that corner moves along it instead of getting a new one, so pulling a side of a rectangle makes the rectangle longer, and no node is left on a straight line.
- **Toggle "Move side" (Shift):** no new corners; each end of the side slides along its neighbouring side, so the neighbours keep their direction (JOSM's Ctrl with dual align). An end without a neighbour (the end of a line), or with a neighbour almost parallel to the side, moves at a right angle. The panel toggle is there for touch; a held Shift turns it round during a drag.
- **Click on the outline:** adds a corner there (its own undo step), so the post's flow, two nodes then pull the part between, happens in one mode. This replaces JOSM's double-click.
- **End:** Escape, Enter, Done, a click away from the way, or another selection. Undo and redo work as usual while the mode is on: the handles follow the data.
- **Connected ways** at a moved corner move with it, as with any drag of a node. New corners belong to this way only.

**Why not a mode without an operation** (handles on every selected area all the time): it would cross the midpoint handles that add a node, and a module cannot take a drag in browse mode. Resize, Cut and Divide all start from the edit menu, so this one does too.

## 4. Build

`packages/module-shapes/src/extrude/`, one folder as the other tools:

| File | What |
| --- | --- |
| `extrude.ts` | Pure geometry on the graph: the sides of a way in local metres (`shared/metres.ts`), and for a side and a distance the node moves and the new nodes for both behaviours. Unit tests: bump, notch, rectangle stretch without extra nodes, move side along slanted neighbours, line ends, closing node of an area, zero distance. |
| `operation.ts` | The edit menu entry J with its hint (Shift), `applies`, `disabled`, `start`. |
| `mode.ts`, `extrude-store.ts` | The mode and its store (the drag's preview, the toggle). One commit per drag. Unit tests with Resize's fake editor and engine. |
| `ExtrudeOnMap.tsx`, `shapes.ts` | Handles, preview, distance label and the panel. |
| `module.ts` | `extrude()`; exported from `index.ts`, on in `apps/maid-parking` only. |

Texts in en, de, fr and es. A browser check `check-extrude` (draws a rectangle, pulls a side out: still four corners and longer; adds two corners by click, pulls the part between: eight corners; Shift moves a side; one undo step each; Escape), in `check-all` for the parking app.

## 5. Later

- **"As a new area"** (JOSM's Alt): pull a new rectangle off a side, for example a row of parking spaces next to a kerb line or a parking lot, with the preset of the source or a favourite.
- **Distance steps:** snap the distance to 0.5 m, or to the parking space depths (5 m, 2.5 m) of the parking presets.
- **Snap the moved side** to line up with a node or side nearby (JOSM's guide lines).
- Indoor: rooms against walls (8-draw-against-walls.md) might want the same tool.

## 6. Built (2026-11-10)

As planned, without the tick. `packages/module-shapes/src/extrude/`, `extrude()` in `apps/maid-parking` only. The icon is `fas-chevron-circle-up` (the sprites are cut to the icons Maid shows, and have no better arrow). 23 unit tests (`extrude.test.ts`, `mode.test.ts`); `bun run check-extrude --app parking`, 20 ok, run in the agent's Linux Chromium. Not run by a person yet.
