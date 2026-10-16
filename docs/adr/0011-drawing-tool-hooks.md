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
}
type ConstraintResult = { point: Point; guides: [Point, Point][] }
type ConstraintItem = { id: string; constrain(input: ConstraintInput): ConstraintResult | undefined }
```

- `before` is the node on the far side of the neighbour along the way, which gives the reference direction.
- The first item that returns a result wins.
- Its `guides` are drawn by the renderer as dashed lines (source `osm-guides`, layer `guides`). They are cleared on the next move without a result, at the end of the drawing or drag, and on blur.
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
- **Undo and redo** end a module mode first, since the mode may hold ids of what the step takes back.
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
