# Resize: a box with handles around the selection

Research from 2026-10-24 for a new operation, asked for by Tobias: select one or more features (mainly areas), start "Resize" from the edit menu or the inspector's command bar, and drag the handles of a box around them, as in a graphics program. Nothing here was run in a browser; the code references were read at the commits in `.reference/` and on `main` (7c83545).

## 1. What Maid has today

### Tools this builds on

| What                                                                                                                                                                                                                  | Where                                                                                        | Use for resize                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Cut: handles that are dots of a `map.content` preview with hit areas, dragged through a module mode; Enter applies, Escape leaves                                                                                     | `packages/module-shapes/src/cut/` (`mode.ts`, `CutOnMap.tsx`, `line.ts` `HANDLE_HIT_LAYERS`) | The template: same module shape, same handle mechanics |
| Operations that ask for input: `Operation.start` starts a module mode, which makes the one undo step                                                                                                                  | ADR 0011 hook 5, `cut/operation.ts`                                                          | Resize is such an operation                            |
| Module modes: `handleLayers`, `onDragStart/onDrag/onDragEnd`, `onKey` (Enter, Backspace), `onClick`, `onExit`                                                                                                         | `packages/renderer/src/module-mode.ts`                                                       | The box mode                                           |
| Modifier state: `engine.modifiers`, re-runs the last move on a key change                                                                                                                                             | ADR 0011 hook 1                                                                              | Shift/Alt while dragging a handle                      |
| Move (M) and Rotate (R): the result lives in the history's work in progress while the pointer moves, a click keeps it as one step, Escape takes it back; nodes are moved with `actionMoveNodes` on the Mercator plane | `packages/renderer/src/transform.ts`                                                         | The live preview and the geometry frame                |
| The oriented box of a selection: `geomGetDominantSurroundingRectangle` (@rapid-sdk/math), used by Flip long/short (T, Y)                                                                                              | `packages/model/src/actions/reflect.ts`                                                      | The box's orientation                                  |
| A size label in metres next to a wall                                                                                                                                                                                 | `module-shapes/src/rectangle/RectangleOnMap.tsx` `sizeLabel`                                 | Live width and height                                  |
| The edit menu and the inspector's command bar both list every `edit.operation`, with its key in the tooltip (`kbd`) and the reason when disabled                                                                      | `packages/shell/src/commands.ts`, `components/Operations.tsx`, `ui/src/CommandBar.tsx`       | The two places the task names come for free            |

### Keys that are taken

- **Maid** (`shell/src/useShortcuts.ts`, operation `shortcut`s): 1, 2, 3 (and 33, 333), 4 and up for favourites, A, C, D, E, G, M, N, O, Q, R, S, T, V, W, X, Y, `,` `.` `=` `-`, arrows, Shift+arrows (turn), Mod+Z/C/V/F, Delete, Backspace, Enter, Space, Escape. Divide uses `+`/`-` and Shift with them inside its mode.
- **iD** (`data/shortcuts.json`, `core.yaml`): additionally B (background), F (follow), H (help), I (issues), L (location), P (preferences), U (map data), Z (zoom to selection), `/` (minimap), `` ` `` (sidebar), N (note). **iD already scales:** Shift + `+`/`-` scales the selection by 5 % about its centre, Shift+Alt by 5 % five times (`modes/select.js` `scaleSelection`, refused when `too_small` under 1 m, `too_large` under 80 % in view, `not_downloaded`, `connected_to_hidden`).
- **Rapid** (`data/core.yaml`): like iD; K only with Shift (Kartaview layer).
- **Free in all three:** J and K. Figma's Scale tool is K, which makes K the one with a precedent.

### What Maid lacks for this tool

1. **A module mode's drag gets no modifiers.** `onDrag(handle, lon, lat)` has no `info`, and `engine.setModifiers` re-runs the last move only for the draw and drag tools. Resize needs `onDrag` to get `{ point, modifiers }` and to be called again when Shift or Alt changes mid-drag (the same rule as ADR 0011 hook 1). A small change in `module-mode.ts` and the engine.
2. **An operation's tooltip cannot list its modifiers.** `Operation` has a label and one letter. The command bar shows `reason ?? description`, but an operation has no `description`. Proposed: `Operation.hints?: () => { keys: string; text: string }[]`, shown under the label with a `kbd` each (the tooltip already renders one `kbd`). Without it, the modifiers can only go into a plain sentence.
3. **The shell's help list of keys** cannot be extended by a module (already open from the shapes tools).

## 2. Conventions elsewhere

| Program                   | Keep proportions                            | From the centre              | Notes                                                                                                                                                     |
| ------------------------- | ------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Figma                     | Shift                                       | Alt / Option                 | K is a separate Scale tool that also scales strokes and text                                                                                              |
| PowerPoint                | Shift                                       | Ctrl (Windows), Option (Mac) | Corner handles of pictures keep proportions by default                                                                                                    |
| Keynote, Google Slides    | Shift                                       | Option / Alt                 |                                                                                                                                                           |
| Illustrator               | Shift                                       | Alt / Option                 |                                                                                                                                                           |
| Photoshop (since CC 2019) | Default for corners; Shift turns it **off** | Alt / Option                 | A much-criticised change, with a setting to go back                                                                                                       |
| JOSM                      | Always (one factor)                         | Always (centre of the nodes) | Ctrl+Alt+drag in the select mode (`SelectAction.determineMapMode`, `ScaleCommand`: one factor about the nodes' centre, from the pointer's distance to it) |
| iD                        | Always                                      | Always                       | Shift + `+`/`-`, 5 % steps, no handles                                                                                                                    |

Common ground: **Shift = proportions, Alt/Option = from the centre**, both together = both. Only Photoshop inverts Shift, and PowerPoint on Windows uses Ctrl.

**Against Maid's modifier rule** (ADR 0011: Shift = round values, Alt = free, i.e. no snapping to features):

- Shift = keep proportions fits "Shift constrains" well enough, and every graphics program agrees.
- Alt = from the centre clashes only in name: the resize handles do not snap to features (section 3), so there is nothing for Alt to switch off. The ADR's rule gets one sentence: "in the resize box, Alt means from the centre, as in graphics programs".
- Rounding: the live size label shows metres to 0.1 m; rounding the size itself is not needed in v1.

## 3. Recommendations

### Modifiers

Free stretch without keys. Shift: proportions (a corner scales both sides by the same factor; an edge midpoint scales the other side along). Alt: about the centre (the opposite handle moves the other way). Shift+Alt: both. The keys are read on every move and on a key press without a move, as angle snap does.

**Touch** has no keys. The resize panel (like Cut's and Divide's panel) gets two toggle buttons, "Keep proportions" and "From centre"; a held key inverts its toggle. That also helps people who forget the keys.

### Start key

**K** (free in Maid, iD and Rapid; Figma's Scale). J as the fallback. iD's Shift + `+`/`-` steps are worth adding later as keys inside the mode.

### Box orientation

The box follows **the shape's own orientation**, not the screen: the dominant surrounding rectangle that Flip long/short already uses. Reason: a stretch along an axis that is not the shape's own **shears** it, so a rectangular building stops being rectangular. Graphics programs avoid the problem because objects carry their own rotation; OSM data does not, so the box takes the shape's. On a turned map the box turns with the data, not with the screen. For a group: one box, oriented to the dominant rectangle of all nodes together (same as Flip on several features). A group of differently turned buildings then shears some of them; that is what a group scale in a graphics program does too, and proportional scaling (Shift) never shears.

### Selection

- **Applies to** areas, lines and multipolygons, and groups of them with points. Points in a group move with the box (their position is scaled; they are not resized).
- **Not offered** for a single point, or only points fewer than three, as Flip.
- **Disabled** with iD's scale reasons: read-only, too large (under 80 % in view: `isTooLargeToEdit`), connected to hidden features, an incomplete relation. Plus "too thin": a box under 0.5 m on its short side (a straight line) cannot be stretched across.

### Shared nodes

Nodes shared with features that are not selected **move with the box**, as with Rotate (R) in iD and Maid: the connected roads and the neighbouring building stretch along. The live preview shows it. Alternatives (refuse when anything is connected, or keep the shared nodes in place) either block the common case (a building on a landuse edge) or tear the shape.

### Sizes and precision

- **Minimum:** each side stays at least 0.5 m; a handle dragged further stops there. No flipping through the opposite side (Flip does that).
- **Live size:** width × height in metres on two sides of the box, in the rectangle's label style; the factor in % in the panel.
- **Precision:** the geometry is computed on the Mercator plane like `transform.ts` (conformal, so proportions on the ground hold at any zoom and latitude), in the box's own axes: translate to the anchor, rotate to the box axes, scale x and y, rotate back. Every move starts from the positions at the start of the drag, so no error accumulates.

### Drawing

`map.content` component `ResizeOnMap` with declarative `<Source>`/`<Layer>`: the box as a dashed line, eight square handles (corners and edge midpoints) as a circle or symbol layer with a larger invisible hit layer for touch (as Cut). The resized features themselves are the real data in the history's work in progress, so the map draws them with the normal style.

### Flow

K or the menu item → box appears around the selection. Drag handles as often as wanted; each drag continues from the last. Enter, the panel's Apply, or a click outside the box keeps the result as **one undo step** ("Resized a feature" / "Resized N features"); Escape restores everything. Undo and redo end the mode first (ADR 0011).

## 4. Open questions for Tobias

1. Modifier scheme: Shift = proportions, Alt = from the centre (recommended), or Photoshop's inverted Shift.
2. Start key: K (recommended), J, or none.
3. Box orientation: the shape's own axes (recommended) or the screen.
4. Shared nodes: move along (recommended), refuse, or keep in place.
5. Minimum size 0.5 m per side, no flipping (proposed default).
6. Live width and height in metres (proposed: yes).
7. Name: "Resize" / "Größe ändern" (proposed), or "Scale" / "Skalieren".

## 5. Build plan (after the answers)

1. Renderer: modifiers in `onDrag` plus a re-run on a modifier change; unit tests in `module-mode.test.ts`.
2. Operations: `Operation.hints` for the tooltip; shown in the command bar and the edit menu.
3. `packages/module-shapes/src/resize/`: geometry (`box.ts`: oriented box, handle positions, scale about an anchor in box axes with the proportional and centre variants, clamping) with unit tests at metre scale; operation, mode, store, `ResizeOnMap.tsx`, panel; texts in en, de, fr, es.
4. Turn it on in the apps (`maid.config.ts`), `tools/bench/resize-check.ts` with real drags and modifiers, registered as `check-resize` and in `check-all`.
