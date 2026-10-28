# 0011: Hooks for drawing tools in modules

Date: 2026-10-16. Planned in [docs/research/drawing-tools/README.md](../research/drawing-tools/README.md), step 0.

## Context

Five drawing tools are coming as modules of `packages/module-shapes`, for the parking app:

- angle snap
- three-click rectangle
- merge areas
- cut an area
- divide an area

Today a module cannot change where a drawn or dragged node goes, cannot add an entry to the Area button, and cannot take a click on the map with snapping. An operation cannot ask for more input either. Also, the drawing code reads no modifier keys. Without hooks, every tool would edit the shell and the renderer.

## Decision

Five small hooks in core. Each has one first user among the tools.

### 1. Modifier keys: `engine.modifiers`

`engine.modifiers: { shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }` is the state of the keys now.

- **Writers:**
  - The map view sets it from each pointer event (`originalEvent`).
  - A window `keydown`/`keyup` listener sets it as well.
  - Window `blur` clears it.
- **`engine.setModifiers(next)`:** when the value changes during a drawing or a drag, it runs the last move again at the last pointer (`engine.pointer`), so the preview follows a key press without a mouse move.
- **Readers:** `DrawTool.move`, `DrawTool.click` and `DragTool.dragTo`.
- **The rule for the keys (Tobias, 2026-10-17):** Shift means "round values": an angle snaps to 45 degrees, and a length on the ground is a whole 0.1 m (angle snap, the rectangle's wall and depth). Alt means "free": no snapping to features, as Alt already does in a drag. Shift is the only key a constraint reads for a value; Alt with Shift gives no snap and no rounding.

### 2. Constraints: extension point `draw.constraint`

A module can move the node that a drawing or a drag places on open ground. Feature snapping always wins: a constraint is asked only when the pointer is not on a node or a way.

```ts
type ConstraintInput = {
  kind: 'draw' | 'drag'
  /** The pointer on the screen, in pixels */
  point: Point
  /**
   * The fixed nodes next to the placed node, on the screen. One neighbour for the end of a line,
   * two for a corner (an area's draw node between the last and the first node, or a dragged vertex).
   */
  neighbours: { at: Point; before?: Point }[]
  modifiers: Modifiers
  bearing: number
  /** Metres on the ground per screen pixel, at the latitude of the first neighbour (the pointer with none) and the zoom */
  metresPerPixel: number
}
type ConstraintResult = { point: Point; guides: [Point, Point][]; labels?: { at: Point; text: string }[] }
type ConstraintItem = { id: string; constrain(input: ConstraintInput): ConstraintResult | undefined }
```

- `before` is the node on the far side of the neighbour along the way, which gives the reference direction.
- The first item that returns a result wins.
- Its `guides` are drawn by the renderer as dashed lines (source `osm-guides`, layer `guides`). They are cleared on the next move without a result, at the end of the drawing or drag, and on blur.
- Its `labels` are texts at a screen place (for example a segment's length in metres). They are points of the same source, drawn by the symbol layer `guides-label` in the rectangle's size-label style. A result may keep the point and give only labels: the parking editor's angle snap does that without Shift, so a constraint is then asked on every free placement. Without a result, or with an empty one, the labels are cleared as the guides are.
- The renderer computes `metresPerPixel` with the Web Mercator formula for MapLibre's 512 pixel tiles: the equator's circumference times cos(latitude), over 512 times 2^zoom. A constraint that rounds lengths in metres uses it; the pure function is `metresPerPixel` in `packages/renderer/src/constraint.ts`.
- **Drawing:** the result is where the node goes, and a click places it there. Space places a node the same way.
- **Dragging:** a constraint applies only to a vertex with exactly one parent way, and only when the drag is not free (Alt).

### 3. Draw tools: extension point `draw.tool`

```ts
type DrawToolItem = {
  id: string
  geometry: 'area'
  label: () => string
  icon?: ComponentType
  /** A single key, as an operation's */
  shortcut?: string
  start(engine: MaidEngine): void
}
```

When any item is registered, the Area button gets a small dropdown next to it with "Area" plus the items. The items' keys work like the keys 1, 2 and 3. A tool usually starts a module mode (hook 4).

### 4. Module modes with snapping and keys

`ModuleMode` gets three optional members:

- **`snap: true`:** the callbacks `onMove` and `onClick` get a third argument `info: { point; target?: SnapTarget; modifiers }`. The snap target is computed only when a callback reads `target`.
- **Undo and redo** end a module mode first, since the mode may hold ids of what the step takes back. A mode with `endsOnUndo: true` keeps its work outside the history (the resize box draws a preview and commits at the end): undo and redo then only end it and step through nothing (added 2026-10-28).
  - `target` is what the pointer would snap to (a node, or a place on a way), from the engine's `snapAt` with the click layers.
  - `skip?: () => ReadonlySet<string>` leaves out the mode's own preview entities.
- **`onKey(key): boolean`:** the mode gets `Enter` and `Backspace` (Escape still ends the mode). True means the key was used.
- **`onExit`:** unchanged.

The map view passes the screen point to `moduleModeMove` and `moduleModeClick`.

Committing works as in `module-reroute` (`editor.history.perform` and then `commit`): one undo step.

A module that drew new ways calls `engine.announceDrawn(ids)` after its undo step. The shell then selects them, as it does after the drawing tool. One way also counts as new, so the inspector asks for its type.

### 5. Operations that ask for more input: `Operation.start`

`Operation` gets `start?(context: OperationContext, host: OperationHost): void`. `host` holds the engine and the editor; the renderer adds them to the empty `OperationHost` of maid-operations by declaration merging, so a module needs no reference of its own.

- When it is set, the edit menu and the key call `start` instead of `run`; `run` is then never called and may return no actions.
- The module starts its own mode from `start`, and that mode makes the one undo step. Cut and Divide use this.
- `engine.runOperation` keeps all its checks: read-only, `applies`, `disabled`.

## Consequences

- Modules stay in their folder; the shell and the renderer carry no tool-specific code.
- The modifier keys and the constraint run on every pointer move while drawing. The constraint is a pure function over a few points (no map query), so this is cheap.
- The guides layer is renderer-owned. The renderer updates its source as it does the highlight source, which is allowed inside the renderer by AGENTS.md.
- The labels (added 2026-10-17) share that source: the engine's `setGuides` takes them as a second argument, and the layer `guides-label` draws them.
- With labels on, a constraint is asked on every free placement, Shift or not. It is a pure function over a few points, so this stays cheap.
- Not built yet: Alt does not switch off feature snapping while drawing, as it does in a drag. The rule in section 1 is the decision; the drawing code does not read Alt for snapping yet.
- Added 2026-10-24 for the resize box ([7-resize.md](../research/drawing-tools/7-resize.md)): a module mode's `onDragStart`, `onDrag` and `onDragEnd` get `{ modifiers }` as a fourth argument (`ModuleModeDragInfo`). A key change during a drag already reached `onDrag` through `setModifiers`. In the resize box, Shift keeps the proportions and Alt keeps the centre, as in graphics programs: the handles snap to nothing, so Alt has no snapping to switch off there.
- Added 2026-10-28 after the review of the resize box: a module mode keeps its work out of the history until it commits, and draws it as a preview. A mode that holds work in progress while other edits can commit (the inspector, operations, other modules) lets them take that work into their own undo step. Ending the mode before each such commit needed a call in every place that commits and missed the modules' own, so it was dropped for the preview.
