# Maid today: drawing, tools, operations and presets

State: `main` at commit 8300172 (working tree clean when read). Read-only survey, no code changed, nothing run.

Purpose: a map for a planner who designs five new tools and one workflow (see the list at the end of section 8). Every claim cites `file:line`. Anything not read directly in the code, or only inferred from it, is marked **(inferred)**. Where iD behaviour is cited it comes from `.reference/id` (pinned checkout). Paths are relative to the repo root unless absolute.

---

## Short answer

- Drawing is click-based with a real "cursor" node. The way being drawn is real data in the history's work in progress. Snapping is always on while drawing. **No code in `packages/renderer/src` reads a modifier key at all.** Alt only disables snapping for a node drag.
- Toolbar: Point, Line and Area are hard-coded in the shell (`packages/shell/src/components/ModeButtons.tsx`), not an extension point. Keys 1/2/3 are hard-coded in `useShortcuts.ts`. Modules cannot add a top-bar tool or a hotkey. They can add a map mode (`enterModuleMode`), and only the reroute module uses one.
- Operations (`packages/operations`) are the only module-facing menu item: one `Operation` value feeds both the sidebar and the right-click menu. An operation sees only the selection and the graph, never a drawn geometry or a parameter.
- Merge exists only for lines. An unused `actionMergePolygon` (containment-based, not a boolean union) is in the model. No polygon clipping library is a dependency.
- Presets: a finished feature is selected with the type picker open. Alt plus a favourite's number changes its type. Recent presets are recorded by the picker, not by the Alt path (inferred).
- The parking app's modules are listed in `apps/maid-parking/src/maid.config.ts:60-82`. `module-parking` adds a field, a quick-tag section, a map layer, four operations (no shortcuts), and presets. It adds no mode and no hotkey.

---

## 1. Drawing and the pointer

### 1.1 Modes and entry

- The mode is a closed union: `export type Mode = 'browse' | 'add-point' | 'draw-line' | 'draw-area' | 'move' | 'rotate'` (`packages/renderer/src/engine.ts:145`).
- `setMode(mode)` (`engine.ts:961-981`): ends a module mode first (963), finishes a drawing (967, `this.draw.finish()`), finishes a move or rotation (968), then switches. Setting the same mode is a no-op (964).
- The draw tool is a field of the engine, `readonly draw = new DrawTool(this)` (`engine.ts:849`). It is a concrete class; there is no registry.
- `DrawKind = 'line' | 'area'` (`packages/renderer/src/draw.ts:19`). `drawKindOf(mode)` maps the two draw modes (`packages/shell/src/drawing.ts`, `drawKindOf` comment at line 29-33). Point mode is not a draw mode; it places a point on click (`MapView.tsx:513-537`).

### 1.2 Click becomes a node: `packages/renderer/src/draw.ts`

File header (`draw.ts:1-6`): the way is real data; its last node follows the pointer; a click fixes the node and adds the next; finishing commits one undo step; cancelling reverts.

- `move(point, layers)` (`draw.ts:50-54`): moves the cursor node to the snapped location via `engine.dragTo`. Pointer moves are routed here from `MapView.tsx:362`.
- `click(kind, point, layers)` (`draw.ts:61-100`):
  - First click: `start()` (`draw.ts:189-224`). A free start adds a new node (`actionAddEntity`). A start on an existing node uses that node. A start on a way inserts a midpoint (`actionAddMidpoint`, 212-213). A line that ends at exactly one unclosed line continues that line (`lineEndingAt`, 262-270, and 199-206).
  - Later clicks (`draw.ts:76-98`): a click on the last fixed node, or on the first node of an area with at least three nodes, finishes (72-74, `closes` at 257-259). Otherwise the target decides: an existing node replaces the cursor (`actionDeleteNode` + `actionAddVertex`, 83-87); a way inserts a midpoint (`actionAddMidpoint`, 89-92); open ground moves the cursor node to the click (`actionMoveNode`, 93-95). A new cursor node follows (`addCursor`, 97).
- Areas are closed ways with `area=yes` until they get a type (`draw.ts:215-219`), the iD convention (comment at 215).
- `finish()` (`draw.ts:114-141`): deletes the cursor node, drops a way with too few distinct nodes (2 for a line, 3 for an area; 127-131, unless it was a continued line), commits one step with annotation "Continued a line", "Added an area" or "Added a line" (133-138).
- `undoLast()` (`draw.ts:147-172`): Backspace removes the last fixed node. With one node left it cancels drawing and returns to browse.
- `cancel()` (`draw.ts:175-181`): reverts the whole drawing.
- Keys (`packages/shell/src/useShortcuts.ts`): Space places a node at the engine's last pointer position (`space`, 83-87, reads `engine.pointer`, which the map view sets at `MapView.tsx:330`). Enter and Escape finish (`finishDrawing`, 57-61; `escape`, 63-72). Backspace undoes the last node (80-82). Delete cancels (`hotkey: 'Delete'`, line 120).

### 1.3 Snapping, and what Alt does

- Snap radius: `SNAP_PX = 8` (`packages/renderer/src/snap.ts:8`), screen pixels.
- While drawing (`DrawTool.target`, `draw.ts:276-312`):
  1. The way's own fixed nodes within 8 px (290-297). Most have no vertex drawn, so they are found by distance, not by `pick`.
  2. `engine.pick(point, layers, SNAP_PX, skip)` skipping the drawn way and the cursor (298-301). A node target is used directly (302-305). A way target gives the nearest point on its outline (306-309, `nearestOnWay` at `draw.ts:316-329`) and becomes a midpoint on click.
  3. Otherwise open ground: `map.unproject` of the pointer (279-281, 311).
- **Alt does not disable snapping while drawing.** `DrawTool.target` takes no modifier argument, and `draw.move` and `draw.click` take none (`draw.ts:50`, `61`). `MapView.tsx:362` and `drawing.ts` pass none. (Verified: `grep altKey` finds no read in `packages/renderer/src`.)
- Alt disables snapping only for a node drag: `MapView.tsx:351` and `:359` pass `free: event.originalEvent.altKey`; `DragTool.dragTo` aims only when `!aim.free` (`packages/renderer/src/drag.ts:65`).
- iD for comparison: Alt disables snapping in draw (`.reference/id/modules/behavior/draw.js:47`, `if (d3_event.altKey || isNote) return {};`), and Alt also disables it for a node drag (`.reference/id/modules/modes/drag_node.js:175-176`). iD's draw way also marks the surface `nope-disabled` with Alt (`draw_way.js:118`). Maid's drawing and iD's differ here.
- A grep of iD's `behavior/` and `modes/` for `orthogonal|angle snap|snapAngle|constrain` found no angle constraint for drawing (only rotate and move matched). **(inferred from grep; not searched further)**

### 1.4 Modifier keys read today

Full grep of `shiftKey|altKey|metaKey` over `packages/renderer/src`, `packages/shell/src`, `packages/ui/src`, `packages/core/src`:

| Where | Key | Use |
| --- | --- | --- |
| `packages/renderer/src` | none | no modifier is read anywhere in the renderer |
| `packages/shell/src/components/MapView.tsx:279-280` | Alt, Ctrl | press on open map in browse mode turns the map (`startTurnOnOpenMap`, 278-290) |
| `MapView.tsx:351`, `:359` | Alt | node drag: no snap (`free`) |
| `MapView.tsx:569` | Shift | click adds or removes a feature from the selection; Shift on open ground keeps the selection |
| `packages/shell/src/components/FavouriteHint.tsx:52-62` and `favourites-keys.ts:17`, `:100-113` | Alt (+ digits) | start a favourite by number |
| `packages/shell/src/components/SearchButton.tsx:322` | Ctrl/Cmd + F | search |
| `packages/ui/src/sheet/keys.ts:87-96`, `:138` | Alt, Ctrl, Cmd, Shift | keys of the tags sheet |
| `packages/shell/src/useShortcuts.ts` (`Shift+ArrowLeft`, `Shift+ArrowRight`, `Mod+Z`, ...) | Shift, Mod | the hotkey library, `@tanstack/react-hotkeys` |

The pointer's last state (`engine.pointer`, `engine.ts:847`) holds no modifier. So any modifier-based feature needs the event passed in.

Where the modifier would be passed (the seams, inferred): `MapView.tsx:362` (`engine.draw.move`), `MapView.tsx:541-543` and `drawing.ts:11` (`drawClick`), `useShortcuts.ts:83` (Space, which has no event), and `MapView.tsx:356-360` (node drag, which already passes an `aim` object with `free`, the natural place for a constraint flag).

### 1.5 Temporary geometry and hover guides as MapLibre layers

- The way being drawn is real data. `start()` adds the nodes and the way with `history.perform` (`draw.ts:195-222`). `engine.change` (`engine.ts:1131-1156`) redraws the differences (`redrawDifferences`, `engine.ts:1166`). The features reach the map through the same tiers as all data: the live tier of a changed feature (`pushActive` and friends, `engine.ts` ~398-530) and the layers in `packages/renderer/src/layers.ts` (`area-fill` at 292, `area-stroke` 331, `line-*` ~433-452, `vertex` 489). So the in-progress way looks like any way, with its tags.
- Each pointer move is a real node move. `DrawTool.move` calls `engine.dragTo` (`draw.ts:53`), which calls `moveNodeStep` (`engine.ts:658-675`): one `history.perform` with no undo step, then a channel idle wait and a repaint.
- Hover: `setHover` sets a feature state, `hover`, on the feature in each source (`applyHighlight`, `engine.ts:1375-1418`). The halo layers (`highlight-halo`, `layers.ts:369`; `highlight-halo-vertex`, 479) draw it.
- Highlight source: `SOURCES.highlight = 'osm-highlight'` (`layers.ts:17-22`). `pushHighlight` (`engine.ts:1420-1434`) sends one GeoJSON collection: `shapeFeatures` (the selection's outline), `handles`, `previewFeatures` (operation preview), `fieldFeatures`, `measure.features`. Layers filter by a `state` property:
  - `preview-glow` and `preview-line` (`layers.ts:582-598`): dashed red line, filter `state == 'preview'`. This is the operation preview.
  - `measure-casing` and `measure-line` (`layers.ts:648-...`): filter `state == 'measure-line'`.
- So a snap guide line has no existing layer. The cheapest route is a new `state` value on the highlight source with its own layers (inferred), which needs the engine's `pushHighlight` to carry it (that list is fixed in `engine.ts:1420-1434`).
- Module layers: `ModuleLayers.tsx:1-44` draws each `map.layer` item as a `<Source type="geojson">` with its layers, re-rendered by React when the item changes. `map.content` components are rendered with the engine (`ModuleLayers.tsx:33-41`), and a module's preview (reroute's `reroute-preview`) uses that route. Updating such a source on every pointer move goes through React **(inferred: not measured)**.

### 1.6 Node dragging, and whether a module can constrain it

- Press: `MapView.tsx:255-270` (`press`). Only in browse mode (256), not measuring (256), and only a button-0 press that is not a midpoint handle (258-263). `engine.pick` finds the node; `engine.isDraggable(id)` (`engine.ts:1209` to `dragging.isDraggable`, `drag.ts:45-51`) decides; `dragging = id` (269). Alt on a feature press still drags (the comment at `MapView.tsx:272-276`).
- Move: `movePointer` (`MapView.tsx:323-364`) sends the position with the aim (`engine.dragTo`, 356-360).
- `DragTool.dragTo(id, lon, lat, aim?)` (`packages/renderer/src/drag.ts:59-88`): if aimed, `aimAt` snaps to a node or a way (`snap-aim.ts:17-65` `snapTargetAt`, which queries rendered features within 8 px in the layers the click uses; `snap-aim.ts:99-104` `aimAtNode`). A refused target (`connectRefusalOf`, `snap-aim.ts:77-93`: turn restriction, relation roles, a way joined to its neighbour, a read-only way) keeps the node at the pointer.
- Drop: `endDrag` (`drag.ts:109` on) makes one undo step: a move, a connection (`actionConnect`, `drag.ts:125-132`) or an insertion into a way (`actionAddMidpoint`, 145-150). A refused drop is reverted (`drag.ts:121-124`).
- **A module cannot constrain a vertex drag.** There is no hook. The core has a hook mechanism (`packages/core/src/types.ts` `Hooks`, `hooks.ts`), but no production hook is declared (grep finds `declareHooks` only in `hooks.ts` and in `core/src/test-fixtures.ts`). The only drag a module can take over is a module mode's handle drag (`module-mode.ts`, `handleLayers`), which pre-empts node dragging (`MapView.tsx:293-300`, `engine.moduleMode` is checked first).
- A module that has `engine` (via `map.content`, `MapContentProps` in `packages/renderer/src/extension-points.ts:~52-60`) can call public engine methods, including `dragTo` and `snapAt` (`engine.ts:1206-1218`), but it cannot intercept the map's own call (inferred).

---

## 2. Toolbar, keys, modes

### 2.1 The Point, Line and Area buttons

- Defined in `packages/shell/src/components/ModeButtons.tsx`: `addModes()` (lines 25-56) lists `add-point` (34), `draw-line` (41) and `draw-area` (48), each with label, shortcut `'1'`, `'2'`, `'3'`, text and an icon. Icons: `MapPinIcon` for point, `LineIcon` and `AreaIcon` drawn inline (lines 8-22).
- `ModeButtons()` (58-72): one `ToolButton` per mode, `pressed={mode === add.mode}`, click toggles back to browse (`onClick`, 71).
- Mounted in the top bar, centre group, in `packages/shell/src/App.tsx:46` (`<ModeButtons />` inside `center`).
- Not an extension point. A module cannot add a button to this group.

### 2.2 Keys

- `1`, `2`, `3` at `useShortcuts.ts:104-106`. `A` continues a line (107). Space, Enter, Backspace, Escape, Delete at 113-120.
- Operation keys: an operation's `shortcut` (one letter) is registered by `useShortcuts.ts:143-151` for every `edit.operation` item. A key runs `engine.runOperation` (`runOperation` is checked for applicability there).
- Alt plus digits: the favourite sequence (section 5).
- Modules cannot register hotkeys: the only module-facing key is an operation's one-letter `shortcut`.

### 2.3 Can a button have a dropdown?

- `ToolButton` (`packages/ui/src/Toolbar.tsx:139-168`) takes `label`, `shortcut`, `description`, `icon`, `text`, `disabled`, `pressed`, `selected`, `onClick`. It has **no children and no menu slot**.
- `Flyout` (`packages/ui/src/Flyout.tsx:43`) takes a `trigger` element and children as the panel, with `open` and `onOpenChange`, and `placement`. It is already used with button triggers in shell top-bar buttons: `FilterButton.tsx`, `SaveButton.tsx`, `SearchButton.tsx`, `UserButton.tsx` (from `grep -rln "<Flyout"`). So a dropdown on the Area button is a `Flyout` with a `ToolButton` as trigger, but `ModeButtons.tsx` is shell code, so it needs a change there or a new extension point **(inferred, not built)**.

### 2.4 Can modules add tools and modes?

- Top-bar panels: the `topbar.panel` point (`packages/ui/src/extension-points.ts:84`, declared at `:106`) gives an icon button with a flyout at the end of the top bar (`packages/shell/src/components/TopBarPanels.tsx:6-20`). Used by `module-notes` (`notes.tsx:315`) and the layers, backgrounds, photos, style modules. This is a panel, not a mode, and it sits on the right, not in the add group.
- Module map modes: `engine.enterModuleMode(mode: ModuleMode)` (`engine.ts:883-898`), `exitModuleMode(id?)` (901-906), `moduleModeClick` (924). A `ModuleMode` (`packages/renderer/src/module-mode.ts:20-38`) has `id`, `cursor`, `handleLayers`, `onClick(lon, lat)`, `onMove`, `onDragStart/onDrag/onDragEnd(handle, lon, lat)`, `onExit`. Callbacks get lon/lat only, not a screen point. Setting another mode, Escape (`engine.ts:890`), or `setMode` ends it (`engine.ts:963`). `MapView` gives the module the pointer (`MapView.tsx:296-309, 331-335, 503-506`), and gives the cursor (`MapView.tsx:592-595`).
- Who uses module modes today: **only** `packages/module-reroute/src/RerouteOnMap.tsx` (`modeFor` at 79-107, `enterModuleMode` at 136, `exitModuleMode` at 137). Way table (`module-way-table/src/module.tsx:30`) uses a dock view, not a mode. Parking (`module-parking/src/index.ts`) uses no mode.
- A module's mode is started from its own UI (reroute's section), so a rectangle tool would need the same: a mode that starts from a button the module provides (a `topbar.panel` or an `inspector.section`).

---

## 3. Operations and the right-click menu

### 3.1 The Operation shape: `packages/operations/src/types.ts`

- `OperationContext` (types.ts): `graph`, `selected` (ids, in selection order), optional `viewExtent` and `viewPolygon` (used by `too_large`). **No geometry input and no parameters.**
- `OperationResult`: `actions: Action[]`, `annotation` (undo label), optional `select(after: Graph)`.
- `Operation`: `id`, `label`, optional `icon` (an iD sprite name), optional `shortcut` (one lower-case letter), `applies(context)`, `disabled(context)` (a reason sentence or undefined), `run(context)`.
- Reasons are sentences in the operation files, from reason codes of the actions: `reasonSentence`, `blockedByAll` and `FALLBACK` at `operations.ts:1-60` (approx.). The `multiple_blockers` case is at `operations.ts` `blockedByAll`.

### 3.2 Running one: `engine.runOperation` (`packages/renderer/src/engine.ts:819-841`)

- Refused while drawing (`this.draw.active`) or when a selected feature is read-only (821).
- Requires `applies` and no `disabled` (822).
- Runs inside `this.change` with `history.perform(...actions)` and one `history.commit({ annotation, selectedIDs })` (826-835): one undo step.
- Sets the selection to what `select` gives, drops a hover that no longer exists (838-840).

### 3.3 Preview: `engine.previewOperation` (`engine.ts:1545-1553`)

- Runs the operation on a copy of the staging graph (`packages/renderer/src/operation-preview.ts:1-62`) and draws the changed ways as `LineString` features with `state: 'preview'` in the highlight source (`layers.ts:582-598`). Only ways are shown, not areas as fills. The preview is cleared by the context menu on close (`MapContextMenu.tsx:55-57`) and by the command's `preview(false)`.

### 3.4 Where the menu is rendered

- Right-click and long press: `MapView.tsx:445-455` (`handleContextMenu`) and `openMenu` (396-412). Not while a module mode is on (`MapView.tsx:448-450`).
- Component: `packages/shell/src/components/MapContextMenu.tsx`. `items = place.ground ? paste : [...here, ...selection, ...paste]` (line 51). `selection = useEditCommands()` (35).
- `useEditCommands()` (`packages/shell/src/commands.ts:80-133`): Move (M), Rotate (R), Copy (Mod+C), then every `edit.operation` where `operation.applies(context)` (117-120), with `reason` = `operation.disabled(context)` (126), `run` (127-130, previews, `runOperation`), and `preview`. Delete is last (the operation with id `delete`, `shortcut` shown as ⌫).
- The renderer of the list: `ui/src/ContextMenu.tsx:85`. Its `MenuItem` (13-30) has `section`, `keepOpen` and `current`, but the shell's `Command` type (`commands.ts:14-30`) has no `section` or `keepOpen`. So a module cannot put a heading or a stay-open item in the menu, through the current path **(inferred from the types)**.
- The sidebar copy: `packages/shell/src/components/Operations.tsx:9-17`, the same commands as a `CommandBar`.

### 3.5 What a module can contribute to the edit menu

- `edit.operation` only (`packages/renderer/src/extension-points.ts:74`; registration helper `operations(list)` at 81-88).
- The app's `operations([...defaultOperations, pointToArea(...)])` is at `apps/maid-parking/src/maid.config.ts:63`.
- Parking registers its four operations at `packages/module-parking/src/index.ts:59`, from `packages/module-parking/src/operations/index.ts`:
  - `copyParkingOperation('left','right')` and the reverse (`copy-parking.ts`): "Copy parking to the other side", icons `iD-icon-forward` / `iD-icon-backward`.
  - `swapSidesOperation` (`swap-sides.ts`): icon `roentgen-exchange`.
  - `removeParkingOperation` (`remove-parking.ts`).
  - None has a `shortcut` (grep of `packages/module-parking/src` for `shortcut` finds nothing).
- Other extension points (for the planner): `map.layer`, `map.content`, `edit.operation`, `imagery.used` (`renderer/src/extension-points.ts:71-76`); `inspector.section` (with `placement: 'top'`, `multiple`, `when`), `dock.view`, `inspector.field`, `topbar.panel` (`ui/src/extension-points.ts`, types at 27-50ish, 74, 84, declarations at 102-106); `note.selection` (`module-notes/src/extension-points.ts:24`).

### 3.6 Operation shortcut letters in use

- Operations: `v` reverse (`operations.ts:104`), `x` split (160), `c` merge (222), `s` straighten (325), `q` square (402), `o` circularize (473), `d` disconnect (578), `e` extract (636), `t`/`y` reflect long/short (677). Delete has `Mod+Backspace` and `Mod+Delete` (`useShortcuts.ts:121-122`).
- Taken by the shell: `1 2 3 A M R N`, Enter, Space, Backspace, Escape, Delete, arrows, `+ -`, `, .` (stack), `Mod+Z`, `Mod+Shift+Z`, `Ctrl+Y`, `Mod+C`, `Mod+V`, `Mod+F`, `Shift+ArrowLeft/Right`. Alt+digits belong to favourites.

---

## 4. Model actions and geometry helpers (`packages/model/src`)

### 4.1 Actions (`packages/model/src/actions/`, one file per action)

Names of the files (all exported as `action<Name>`): add_entity, add_member, add_midpoint, add_vertex, change_member, change_tags, circularize, connect, copy_entities, delete_member, delete_members, delete_multiple, delete_node, delete_relation, delete_way, discard_tags, disconnect, extract, index, join, merge, merge_nodes, merge_polygon, merge_remote_changes, move, move_member, move_node, noop, orthogonalize, reflect, restrict_turn, reverse, revert, rotate, scale, split, straighten_nodes, straighten_way, sync_crossing_tags, types, unrestrict_turn, upgrade_tags.

| Action (file:line) | Used by |
| --- | --- |
| `actionSplit(nodeIDs, newWayIDs?)` (`split.ts:46`) | split operation (`operations.ts:157`); closed ways: "finds a partner node" (`split.ts:38`) |
| `actionJoin(ids)` (`join.ts:49`) | merge of lines (`operations.ts:219`) |
| `actionMerge(entityIDs)` (`merge.ts:26`) | **not used** outside the model (grep) |
| `actionMergePolygon(ids, newRelationID?)` (`merge_polygon.ts:39`) | **not used** outside the model (grep). Assigns outer and inner roles by containment (`merge_polygon.ts:82-117`). Not a geometric union. |
| `actionMergeNodes(nodeIDs, loc?)` (`merge_nodes.ts:20`) | not used by an operation (grep for `actionMergeNodes` not run further) **(inferred)** |
| `actionOrthogonalize(wayID, vertexID?)` (`orthogonalize.ts:36`) | square operation (`operations.ts:399`) |
| `actionCircularize(wayID)` (`circularize.ts:32`) | circularize (`operations.ts:470`) |
| `actionDisconnect(nodeID, newNodeID?)` (`disconnect.ts:35`) | disconnect (`operations.ts:575`) |
| `actionExtract(entityID)` (`extract.ts:23`) | extract (`operations.ts:633`) |
| `actionReflect(entityIDs)` (`reflect.ts:22`) | reflect long and short (`operations.ts:697-698`) |
| `actionReverse(id)` | reverse (`operations.ts:101`) |
| `actionStraightenNodes`, `actionStraightenWay` | straighten (`operations.ts:322`) |
| `actionDeleteMultiple(ids)` (`delete_multiple.ts:15`) | delete (`operations.ts:812`) |
| `actionConnect` | node drag connect (`drag.ts:125-132`) |
| `actionMoveNode(id, loc)` (`move_node.ts:15`) | `draw.ts:94`, `engine.ts:658` |
| `actionAddVertex(wayId, nodeId, index?)` (`add_vertex.ts:14`) | `draw.ts:86`, `draw.ts:234` |
| `actionAddMidpoint({loc, edge}, node)` (`add_midpoint.ts:24`) | drawing on a way (`draw.ts:91`, `:213`) and drag insertion (`drag.ts:146`) |
| `actionAddEntity(entity)` (`add_entity.ts`) | `draw.ts:211`, `:220`, `:232` |
| `actionDeleteNode(id, ...)` (`delete_node.ts`) | `draw.ts:86`, `:125`, `:169` |
| `actionChangeTags(id, tags)` (`change_tags.ts:12`) | tag edits (`engine.setTags`, `engine.ts:714-716`; also `packages/renderer/src/change-tags.ts:81,125`) |
| `actionAddMember`, `actionChangeMember`, `actionDeleteMember(s)`, `actionMoveMember` | relations (`packages/shell/src/modules/relations-logic.ts`, `packages/module-reroute/src/plan.ts`) |
| `actionRestrictTurn`, `actionUnrestrictTurn` | turn restrictions (`packages/module-turn-restrictions/src/turns.ts`) |
| `actionRotate`, `actionMove`, `actionScale` | the move and rotate modes (`packages/renderer/src/transform.ts`) |
| `actionCopyEntities(ids, fromGraph)` | copy and paste (`packages/renderer/src/clipboard.ts`) |

### 4.2 Geometry helpers

- `packages/model/src/geo/geom.ts`: `geomLineSegments` (123), `geoHasSelfIntersections` (198). The latter uses `geomLineIntersection` from `@rapid-sdk/math` (`geom.ts:1`, `:223`).
- `packages/model/src/geo/ortho.ts`: `geoOrthoCalcScore` (62), `geoOrthoCanOrthogonalize` (128), used by `actionOrthogonalize`.
- `packages/model/src/lib/intersection.ts`: `osmIntersection` (104), for turns of a junction.
- `packages/model/src/lib/multipolygon.ts`: `osmJoinWays` (58), joins ways into rings.
- Model dependencies (`packages/model/package.json:10-19`): `@mapbox/polylabel`, `@rapid-sdk/math`, `@rapid-sdk/util`, `d3-geo`, `d3-polygon`, `fast-deep-equal`, `node-diff3`, `rbush`. **No polygon boolean or clipping library** (checked: no `polygon-clipping`, `turf`, `jsts`, `martinez`, `clipper` in any `package.json`).
- Renderer helpers: `packages/renderer/src/snap.ts`: `nearestOnPolyline` (26), `chooseTarget` (50). `packages/renderer/src/midpoints.ts:42` `segmentsOf`.
- Operations' extent helpers: `packages/operations/src/extent.ts`: `percentInPolygon` (145), `isTooLarge` (171), `isTooLargeToEdit` (195).

---

## 5. Presets after drawing, keys and favourites

### 5.1 What happens when a feature is finished

1. `drawClick` (`packages/shell/src/drawing.ts:11-27`) calls `engine.draw.click`. If it finished a way, it calls `giveFavouriteType` (only when a favourite started the mode), `engine.setMode('browse')`, `markNewFeature(finished)` (`packages/shell/src/new-feature.ts:36`), and `select(finished)`.
2. The keyboard path does the same in `finishDrawing` (`useShortcuts.ts:57-61`).
3. `Inspector.tsx:196-200`: a feature that is the new feature and has no preset (or a fallback preset) is `untagged`, so the type picker opens for it (`picking`, 200). So **yes, the preset list opens after an area or line is finished.** It also opens after a point (`MapView.tsx:527-535`).

### 5.2 The picker

- `PresetPicker` (`packages/ui/src/inspector/PresetPicker.tsx`): a search field, favourites first with their numbers, then "Recently used" and the defaults for the geometry. Enter activates the active row (`PresetPicker.tsx:211-217`). `activate` records the choice with `remember(preset.id)` (`PresetPicker.tsx:185`, `useRecentsActions` at 145).
- Recent presets: `packages/ui/src/inspector/recents.ts`: `RECENTS_TO_STORE = 30` (line 7), `withRecent` (13), stored as `maid:recents` (66). `packages/presets/src/browse.ts`: `RECENTS_TO_SHOW = 8` (line 8), and `browseOf`'s recent list (30-41), which fits the recents to the geometry.
- A favourite is a preset with a number: `FavouriteNumberField` (`PresetPicker.tsx:45-...`, title "Hold the modifier key and type this number to start the feature type", line 71).

### 5.3 Keys for presets

- Alt, then digits, then release: `packages/shell/src/components/favourites-keys.ts`. `FAVOURITE_MODIFIER = 'Alt'` (17). `advance` (53-78) is a pure reducer. `sequenceEventOf` (100-113) reads `event.code` so Option on macOS works. `FavouriteHint.tsx` listens on the window (its `useEffect`, about lines 40-80) and shows a pill while the digits are typed.
- On release, `startFavourite({editor, engine}, number)` (`packages/shell/src/favourites.ts:159-181`):
  - With exactly one feature selected whose geometry is the favourite's, `changeType` (84-100) sets the preset with `engine.setTags(id, tags, 'Changed the feature type to …')`: one undo step.
  - With nothing selected: the mode for the geometry (`ADD_MODE`, 25-29) is set, and a pending favourite is kept for the next click (`pending`, `addPointWithFavourite` at 183).
- **Recents are not updated by the Alt path** (`favourites.ts` and `FavouriteHint.tsx` do not call `recentsActions`; grep of `packages/shell/src` for `recents` finds none) **(inferred from grep)**.

### 5.4 The workflow "draw shape, then pick a preset by keyboard"

- Partly present. Draw (`3`, clicks, Enter), the new area is selected and the picker opens (5.1). Alt plus the favourite's number then changes its type, if the favourite's geometry is `area` (`favourites.ts:172-175`, the `entity.geometry === favourite.geometry` test) and the feature is the only selection (`favourites.ts:166-173`). The sequence was not run in a browser **(inferred)**.
- Limits: only favourites have numbers (user-set in the picker, `FavouriteNumberField`), not arbitrary presets; the picker's own keys (arrows, Enter) do not take a number; the number must be typed while Alt is held.

---

## 6. The parking app

`apps/maid-parking/src/maid.config.ts`, the `editorConfig` `modules` array (lines 60-82):

| Line | Module | What it does |
| --- | --- | --- |
| 60 | `elementInfo()` | inspector "Element" section |
| 63 | `operations([...defaultOperations, pointToArea(...)])` | the edit menu operations (section 3) |
| 65 | `relations()` | "Members" and "Relations" sections |
| 67 | `validation({ rules: [...defaultRules, ...parkingRules] })` | Issues |
| 69 | `background` (const `imagery()` at line 46) | top bar Background |
| 71 | `dataLayers()` | top bar Data layers |
| 73 | `lenses({ lenses: [parkingLens] })` | top bar Map style, "Parking" lens |
| 75 | `streetImagery({...})` | Photos |
| 77 | `parking({ lenses: lensChoice })` | the parking module (below) |
| 79 | `notes({ apiUrl })` | Notes |
| 82 | `sceneBounds({ bbox })` | outline of the fixture |

`parking()` (`packages/module-parking/src/index.ts:37-70`):

- `inspector.field`: type `parkingRestriction` (`RestrictionField`, index.ts:40-44).
- `inspector.section` "Parking" with the quick buttons: `placement: 'top'`, `multiple: true`, shown for a line with `highway` (46-58). Component `QuickTagsSection` (`buttons/QuickTags.tsx`).
- `map.content` `parking-sides` (`ParkingSidesOnMap`, the side lines beside roads, `lens/side-features.tsx`).
- `edit.operation`: `parkingOperations` (59), section 3.5.
- When the "Parking" lens is given, it starts on at the first visit (`FIRST_VISIT_KEY` at line 12, the check at 65-67) and connects the side features to the lens (`connectParkingSides`, 69).
- Exports: `parkingPresetChanges` (`presets/index.ts:11`), `parkingRules`, `parkingLens` (`lens/parking-lens.ts:16`), `RestrictionField`, `QUICK_TAGS`, `SIDES`, `readSide`, `writeSide`.

**Presets**: the parking app's preset data is built in `apps/maid-parking/src/presets.ts` (`makePresets`: `withChanges(withChanges(defaultPresetData, streetImageryPresetChanges), parkingPresetChanges)`). `packages/module-parking/src/presets/presets.ts` holds `PARKING_PRESETS` (96), `PARKING_ROADS` (169), `ROAD_PRESET_EDIT` (187), `CROSSING_PRESETS` (194), `PARKING_PRESET_EDITS` (214).

**Modes and keys**: none. The parking module has no `enterModuleMode`, no hotkey, and no operation shortcut.

---

## 7. Tests and fixtures

### 7.1 Unit tests

- Runner: `bun test` (root `package.json:22`, `"test-run": "bun run i18n-compile && bun test"`). The `check` script runs it (`package.json:23`).
- Operations: `packages/operations/src/operations.test.ts` (32 `it` cases, 84-200+). Pattern: `const context = new ModelContext()`, then `new OsmNode(context, { id, loc: [lon, lat], tags })` and `new OsmWay(context, { id, nodes, tags })`, `new Graph(context, entities)` (lines 1-40). A helper `run(op, base, ...)` applies the actions in order, as the editor does (lines ~40-80). Tests check `applies`, `disabled` and the result (for example `split`, line 139; `merge`, 170).
- Fake graph for parking operations: `packages/module-parking/src/operations/test-helpers.ts` (plain objects with `hasEntity`, `replace`, `commit`) so no real graph is needed.
- Route graphs: `packages/module-reroute/src/test-graph.ts`, `packages/model` helpers in `packages/model/test/` (`rapid.ts`, `sdk.ts`).
- Model action tests: `packages/model/test/actions/*.test.js` (39 files, JavaScript).
- Renderer tests next to the code: `draw` has none; `engine-module-mode.test.ts`, `module-mode.test.ts`, `snap.test.ts`, `engine-selection.test.ts`.

### 7.2 Browser checks (`tools/bench/*-check.ts`)

- Driver: `tools/bench/check-helpers.ts`. `click(p, how)` (59-67) moves and clicks with Playwright's `page.mouse`, optionally with Shift (`how.shift`, 62-67). `drag(a, b)` (72-77) does `mouse.down`, `move` in steps, `mouse.up`. `key(name)` (84-87) is `page.keyboard.press`. Exported at 114.
- Runner: `tools/bench/check-page.ts`. `runCheck(scene, fn)` (28) opens `http://localhost:<port>/?scene=…`, blocks every request not to `localhost`/`127.0.0.1` (55-61), and `report(label, expected, actual)` (43-47) prints `ok <label>` or `FAIL <label>: expected …, actual …`.
- Draw check: `tools/bench/draw-check.ts` (233 lines, 15 `report(` calls). Steps: a line on open ground, continue, snap to a node and to a way (`snap` at 113-197), an area, cancel. Needs open ground, only the small scene has it (header, lines 1-13). Expected count in `check-all`: **draw 14 ok** (`tools/checks/check-all.ts`, EXPECTED_OK).
- Operations check: `tools/bench/ops-check.ts` (17 `report(` calls; expected 17 in `check-all`).
- Parking check: `tools/bench/parking-check.ts` (`--app parking`, 29 `report(` calls; expected 29). Covers quick buttons, the restriction field, a rule in Issues, "Copy parking to the other side", and the parking lens (header, lines 1-10).
- Aggregation: `tools/checks/check-all.ts`. `CHECKS` (about lines 22-37: interactions, edit, draw, undo, ops, relations, validation, journal, filters, tags, multi, parking, way-table, reroute). `RUNS` (about 45-52): parking only for the parking app; way-table and reroute only for bicycle, on the `relations` scene; `relations-scene`. `EXPECTED_OK` (about 58-75). Output: `reports/check-all-<app>.json`. The commands are `bun run check-all`, `bun run check-draw`, and so on (root `package.json`, `check-all` at line 48).
- Running them needs `bun run dev` (not done here). Per the repo rules, the checks are for a person or the orchestrator, not parallel agents.

### 7.3 Fixtures (`fixtures/`, frozen, read via `gzip -dc`)

| Scene | Meta name and description | Ways | Relations | Building tags (raw) | Multipolygon tags (raw) | `inner` members (raw) |
| --- | --- | --- | --- | --- | --- | --- |
| `small` | Residential streets in Lichtenrade (default scene for checks) | 1914 | 67 | 1150 | 4 | 6 |
| `medium` | Inner city around Hackescher Markt, Mitte | 8879 | 550 | 1833 | 117 | 220 |
| `dense` | Neukölln, detailed street-space and parking mapping | 20896 | 289 | 3571 | 81 | 102 |
| `relations` | Köpenick: bike routes, bus and hiking routes, turn restrictions and multipolygons | 3420 | 190 | 923 | 7 | 8 |

- Counts are raw string matches in the gzipped JSON (`"building":…`, `"type":"multipolygon"`, `"role":"inner"`), not a parse. **(inferred from grep counts; a parse would be exact)**
- Scenes with buildings and multipolygons with holes (inner members): `medium` and `dense` have the most. `relations` has multipolygons and a few inner members (8). `small` has a few (6).
- Files: `fixtures/<scene>.json.gz` and `fixtures/<scene>.meta.json`. The `fixtures/notes/` folder is for notes.

---

## 8. Gaps for the planned tools

The planner's five tools and the workflow, against what exists.

### Tool 1: angle snapping with a modifier, and guide lines

- Exists: snapping pipeline (`draw.ts:276-312`, `drag.ts:59-88`, `snap-aim.ts`), an `aim` object with a `free` flag for drags (`MapView.tsx:351-360`), the highlight source with state layers (`layers.ts:582-606`).
- Gaps:
  - No modifier in `DrawTool.move`/`click` (`draw.ts:50`, `61`). Pass a modifier from `MapView.tsx:362` and `:541-543`, and from `drawing.ts:11`. The Space path has no event (`useShortcuts.ts:83-87`) and would take the flags from `engine.pointer` (`engine.ts:847`), which must then carry the modifiers (seam, inferred).
  - Alt is already the "no snap" key for drags (`MapView.tsx:351`, `:359`; `drag.ts:65`), but not in drawing. Choosing Alt as the angle-snap key would mean a different meaning for Alt in drawing and in dragging. Shift is free in drawing and in dragging (`MapView.tsx:569` only in click selection; no Shift check on drag start) but iD cancels a drag that starts with Shift (`.reference/id/modules/modes/drag_node.js:133`). Decision needed.
  - No guide layer. The highlight source (`engine.ts:1420-1434`) has a fixed list; a guide needs a new list and layers, or a `map.layer` source updated through React (`ModuleLayers.tsx`), which is per-pointer-move work **(inferred)**.
  - No hook to constrain a vertex drag (section 1.6). A module cannot change the dragged position. An angle snap for dragging would be core work.
  - The angle reference (the previous fixed node, or the node's neighbour for a drag) is not computed anywhere today **(inferred)**.

### Tool 2: three-click rectangle, as a dropdown on the Area button

- Exists: the draw loop and the cursor node (`draw.ts`), the `Flyout` pattern with a button trigger (`FilterButton.tsx`, `SaveButton.tsx`), module modes (`engine.ts:883`, `module-mode.ts`).
- Gaps:
  - Area is hard-coded in `ModeButtons.tsx:48`, with the keys in `useShortcuts.ts:106`. No extension point for a top-bar tool or a dropdown item.
  - `ToolButton` has no menu slot (`ui/src/Toolbar.tsx:139-168`). The Flyout would wrap it, in shell code.
  - The `Mode` union is closed (`engine.ts:145`). A rectangle tool would be a module mode (`ModuleMode`). Its callbacks get lon/lat only (`module-mode.ts:20-38`), so snapping needs `engine.snapAt` with a screen point the module must track (`engine.pointer`, `engine.ts:847`) **(inferred)**.
  - Preview: a `map.content` component with its own GeoJSON source, as reroute does (`RerouteOnMap.tsx`). Final geometry: `actionAddEntity` + `actionAddVertex` through `editor.history` (redraw of module changes is handled: `engine.change` comment, `engine.ts:1127-1130`).
  - Hotkey for the rectangle: none for modules (only operation letters).

### Tool 3: merge (union) of areas, in the right-click menu

- Exists: `edit.operation` reaches the menu (`commands.ts:117-130`); `actionMergePolygon` (`merge_polygon.ts:39`) with containment-based roles; `mergeOperation` for lines (`operations.ts:204-236`).
- Gaps:
  - `mergeOperation` applies only to lines (`operations.ts:204-217`). Areas need a new operation.
  - `actionMergePolygon` makes a multipolygon by containment. Two adjacent areas that share an edge stay two outers. A true union needs the shared edge removed, which means a polygon boolean.
  - No polygon boolean library is a dependency (section 4.2). Adding one is a dependency decision (ADR candidate under `docs/adr/`, not checked).
  - A new `OperationResult` with several actions is fine (`runOperation` takes `actions[]`).

### Tool 4: cut an area with a drawn line, from the right-click menu

- Exists: `actionSplit` on a closed way with nodes (`split.ts:36-46`, closed ways "partner node", 38); `actionAddMidpoint` to put a node on an outline (`add_midpoint.ts:24`); `geomLineIntersection` from `@rapid-sdk/math` (used at `geom.ts:223`), reachable from the model package; `previewOperation` for the result (`engine.ts:1545`).
- Gaps:
  - `OperationContext` has no geometry input (`operations/src/types.ts`). A drawn line would have to be stored by a module (a mode that draws it, then an operation whose `applies`/`run` read that stored line). The right-click path cannot draw (the menu is an item, not a step) **(inferred)**.
  - No exported segment-segment intersection in the model. `geomLineIntersection` is in `@rapid-sdk/math`, not re-exported (`geom.ts:1` imports it).
  - Cutting through an area needs two new nodes on the outline plus the split at both; the split action's behaviour with two nodes on a closed way was not read (`split.ts` lines beyond 46) **(inferred)**.

### Tool 5: divide a rectangle into a grid or a row of parking spaces

- Exists: `actionAddEntity`, `actionAddVertex`, `actionChangeTags`; parking tag helpers (`module-parking/src/sides.ts`, `readSide`, `writeSide`); `edit.operation` with `disabled` reasons; an `inspector.section` with `multiple: true` (`module-parking/src/index.ts:46-58`) can host a form.
- Gaps:
  - An operation has no parameters (count, spacing, angle, direction). A form must live in an inspector section, a flyout, or a mode (no dialog API exists) **(inferred)**.
  - Creating new ways from a rectangle needs new entities with ids (`OsmWay` via `ModelContext`, as in `draw.ts:216`). The operation's `select(after)` would then select the new spaces.
  - Parking tags for each space: `module-parking/src/presets` and `sides.ts`. The rule for a "row" (both sides, `both` values) is in the module (`sides.ts`, `withSides` in `operations/shared.ts`).

### Workflow: draw a shape, then pick a preset with a key

- Exists: the picker opens after a finish (`Inspector.tsx:196-200`); Alt plus favourite number changes the type (`favourites.ts:159-181`, `changeType` 84-100); the favourites are numbered in Settings (`PresetPicker.tsx:45`).
- Gaps: only favourites have keys; the Alt path does not record recents (inferred); no key for an arbitrary preset without making it a favourite; the sequence was not run in a browser **(inferred)**.

---

## 9. Open questions (not settled by this reading)

1. Whether Alt or Shift should be the angle-snap key for drawing and dragging, given that iD's Alt disables snapping and iD's Shift cancels a node drag (section 1.3, 8).
2. Whether a constraint hook for node drags is acceptable in core (the hook mechanism exists but is unused, section 1.6).
3. Whether a new top-bar extension point (a tool group or dropdown items) is wanted, or whether the add group stays in the shell.
4. Whether a polygon boolean library may be added (section 4.2). No ADR was found for it in this read.
5. Whether `actionSplit` on a closed way with two nodes gives two closed ways as the cut needs (section 8, tool 4). Not verified.
6. The cost of a guide line per pointer move through React or the highlight source. Not measured.

---

## Summary

1. Drawing (draw.ts): click-based, a cursor node in real data, one undo step per drawing; `SNAP_PX = 8`.
2. No renderer code reads a modifier key; Alt disables snapping only for node drags (MapView.tsx:351, 359; drag.ts:65), not while drawing.
3. No hook constrains a vertex drag; only a module mode's handles can be dragged by a module (module-mode.ts).
4. Point/Line/Area buttons and keys 1/2/3 are hard-coded in the shell (ModeButtons.tsx, useShortcuts.ts:104-106); Flyout exists for a dropdown.
5. Only reroute uses a module mode; modules add menu items only via edit.operation (renderer/extension-points.ts:74).
6. Operations have no geometry input or parameters (operations/types.ts); merge is lines only (operations.ts:204-217).
7. actionMergePolygon is unused and not a boolean union; no clipping library is a dependency.
8. After a finish the type picker opens; Alt plus a favourite number changes the type; the Alt path does not record recents (inferred).
9. module-parking adds a field, a quick-tag section, a map layer, three copy/swap/remove operations (no shortcuts), and presets; no mode.
10. Tests: bun test (operations.test.ts), browser checks draw-check (14 ok), ops-check (17), parking-check (29), four fixtures; medium and dense have the most holes.
