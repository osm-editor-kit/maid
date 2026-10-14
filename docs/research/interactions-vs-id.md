# Interactions: iD against Maid today

Compared at iD commit `0194f3926` (`git -C .reference/id rev-parse --short HEAD`). Read: the full `data/shortcuts.json`; the mode and behavior files the brief names; the `shortcut:` lines of Maid's operations; Maid's key, mouse and draw code. The key letters of iD's operations come from the built English strings in `.reference/id/dist/locales/en.min.json`, because the source strings are built. Not looked at: iD's help, background, map data, notes, measurement and history panels (left out of the keyboard table on purpose); iD's d3 zoom code (map pan, pinch and double tap on the map); iD's self-intersection check in detail; Maid's layer code beyond a few lines; Maid's zoom buttons. Nothing was run. Anything about MapLibre's built-in keys or touch events is an assumption and is marked as one.

Key: "same" means Maid does the same thing. "missing" means no code for it. "different: ..." means Maid does something else.

## Keyboard

| Action | iD key | Maid today | Gap |
| --- | --- | --- | --- |
| Pan the map | ↓ ↑ ← → (`shortcuts.json`) | Built (2026-10-13): `useShortcuts.ts` binds the arrows to `pan` | none |
| Search (not in iD's keyboard list) | ⌘F / Ctrl+F in Maid, iD has no search key | Built: `useShortcuts.ts` opens the search flyout (`SearchButton.tsx`), see [search.md](search.md) | Fetching an object by id that is not loaded (see search.md) |
| Pan more | ⌥ + arrows | missing | Pan by keyboard |
| Zoom | + - | Built (2026-10-13): `useShortcuts.ts` binds `=` and `-` to the map's zoom. Zoom buttons exist (`ZoomControls.tsx:10-19`) | none |
| Zoom more | ⌥ + + or - | missing | Zoom by keyboard |
| Select one | Space (at the pointer) | missing (`useShortcuts.ts` binds no Space) | Space selects at the pointer |
| Select several | ⇧ + click | different: Shift-click toggles (`MapView.tsx:133-135`). Known: not reliable | Known gap |
| Lasso | ⇧ + drag | missing | Lasso |
| Search | ⌘F | missing | Search |
| Edit menu | ☰ (menu key) | missing | Menu key opens the edit menu |
| Zoom to selected | Z | missing | Zoom to selected |
| Previous vertex | [ (also PageUp) | missing | Vertex navigation |
| Next vertex | ] (also PageDown) | missing | Vertex navigation |
| First vertex | { (also ⌘[, Home) | missing | Vertex navigation |
| Last vertex | } (also ⌘], End) | missing | Vertex navigation |
| Parent of vertex | ⌘ ↑ | missing | Vertex navigation |
| Next parent | \ (also Pause) | missing | Vertex navigation |
| Child of way | ⌘ ↓ | missing | Way navigation |
| Back to browse, deselect | Escape | the key: in browse, Escape clears the selection (`App.tsx:18-27`) | none |
| Add point | 1 | the key (`useShortcuts.ts:31`) | none |
| Add line | 2 | the key (`useShortcuts.ts:32`) | none |
| Add area | 3 | the key (`useShortcuts.ts:33`) | none |
| Place a point at the pointer while drawing | Space | Built (2026-10-13): `useShortcuts.ts` binds Space in the draw modes | none |
| Disable snapping | Alt (hold) | Built for a dragged vertex (`MapView.tsx:193`, Alt passed as `free`). While drawing: unverified (2026-10-13) | Alt for drawing (unverified) |
| Finish a way and keep it | Enter, or Escape (`behavior/draw.js:245-246`) | Enter: the key (`useShortcuts.ts:34-37`). Escape: finishes and keeps the way (`useShortcuts.ts:53-54`) | none |
| Undo the last node while drawing | Backspace (`draw.js:243`) | Built (2026-10-13): `useShortcuts.ts` binds Backspace while drawing | none |
| Cancel the way being drawn | Delete, ⌦ (`draw.js:244`) | Built (2026-10-13): Delete cancels the drawing while drawing (`useShortcuts.ts`). Delete only acts on a selection otherwise | none |
| Copy | ⌘C | Built (075ec35) | none |
| Paste | ⌘V | Built (075ec35) | none |
| Undo | ⌘Z | the key (`useShortcuts.ts:28`). Ctrl+Z on other systems (`UndoRedo.tsx:12`) | none |
| Redo | ⇧⌘Z | the key (`useShortcuts.ts:29`). Ctrl+Y also | none |
| Save | ⌘S | out of scope: Maid never uploads (`AGENTS.md`, rule 1) | none, by design |
| Delete the selection | ⌘⌫ (`operations/delete.js:147` also binds ⌘⌦ and ⌦) | the key: ⌘/Ctrl+Backspace and Delete (`useShortcuts.ts:38`) | none |
| Continue a line | A | Built (2026-10-13): `useShortcuts.ts` binds A to `continueLine` | none |
| Merge | C | the key: c (`operations.ts:224`) | none |
| Disconnect | D | the key: d (`operations.ts:547`) | none |
| Extract | E | the key: e (`operations.ts:596`) | none |
| Extract without relations | ⇧E | different: Shift keys are ignored (`useShortcuts.ts:40`) | Shift+E |
| Split | X | the key: x (`operations.ts:162`) | none |
| Reverse | V | the key: v (`operations.ts:104`) | none |
| Move | M (`operations/move.js:74`) | Built (075ec35): the move mode | none |
| Follow a line while drawing | F (`behavior/draw_way.js:523`) | missing | Follow mode |
| Nudge | ⇧ + arrows | missing | Nudge |
| Nudge more | ⌥⇧ + arrows | missing | Nudge |
| Scale | ⇧ + + or - | missing | Scale |
| Scale more | ⌥⇧ + + or - | missing | Scale |
| Rotate | R (`operations/rotate.js:75`) | Built (075ec35): the rotate mode | none |
| Rotate a point's direction | R on a point with a numeric `direction` or `*:direction` (iD: `modes/rotate.js`, `util/direction_field.ts`, branch rotate-point-direction) | Built: `transform.ts` turns the tag by the pointer's bearing from the point, one undo step "Rotated a point" ("Rotated a node in a way" for a vertex), Enter or a click puts it down, Escape restores; the inspector stays open; the value keeps its format (`operations/src/rotate-direction.ts`). As iD: the first angle follows the pointer's absolute bearing from the point, the other angles keep their offset (the "preserve" commit). As iD: the first move after a pan or zoom writes nothing. Not built: iD's preset fallback (a point with no direction tag gets its numeric field) | the preset fallback |
| Square (iD: orthogonalize) | Q | the key: q (`operations.ts:387`) | none |
| Straighten | S | the key: s (`operations.ts:317`) | none |
| Circularize (Maid: Make round) | O | the key: o (`operations.ts:453`) | none |
| Reflect, long | T (`operations/reflect.js:112`) | Built (075ec35): `reflect-long` in `packages/operations/src/operations.ts` (key not checked) | none |
| Reflect, short | Y | Built (075ec35): `reflect-short` in `packages/operations/src/operations.ts` (key not checked) | none |

Keyboard rows: 51.

## Mouse

### Browse, nothing selected or one feature hovered

| Gesture | iD | Maid today | Gap |
| --- | --- | --- | --- |
| Click a feature | Selects it. A click moves at most 4 px (`behavior/select.js:14`, `:210`). Enters select mode (`:286`) | Selects the id under the pointer, picked within 6 px (`MapView.tsx:131-137`, `engine.ts:1051`) | Minor: iD's 4 px limit is not matched. Not checked against MapLibre's click |
| Click empty map | Back to browse, deselects (last branch of `processClick`, `behavior/select.js` around line 366) | Clears the selection (`MapView.tsx:137`) | none |
| Shift + click | Toggles the feature in the selection (`behavior/select.js:242-247`) | Toggles (`MapView.tsx:133-135`). Known: not reliable | Known gap |
| Shift + drag | Lasso: selects what is in the lasso (`behavior/lasso.js:19-27`, `:105-118`) | missing | Lasso |
| Double click on empty map | Zooms in (map default). Off while drawing (`behavior/draw.js:99`) | Zooms in, in browse only (`MapView.tsx:155`) | none |
| Double click on a way | In select mode: adds a vertex at the click (`modes/select.js:311-312`, `:427-452`). In browse: zooms | missing: no double click handler | Add vertex on double click |
| Right click | Opens the edit menu for the selection (`behavior/select.js:172-196`) | Built: `MapContextMenu.tsx` opens the edit menu at the pointer (2026-10-13) | none |
| Hover | Highlights the feature. A hovered way shows its vertices (`svg/vertices.js:400-401`). Midpoints show only on selected ways (`svg/midpoints.ts:77`) | Highlights the hovered id (`MapView.tsx:110-111`). Whether vertices show on hover: not checked | Check vertices on hover |

Browse rows: 8.

### One feature selected (select mode)

| Gesture | iD | Maid today | Gap |
| --- | --- | --- | --- |
| Click another feature | Selects it instead (`behavior/select.js`, `processClick`) | same (`MapView.tsx:137`) | none |
| Click a vertex of the selected way | Selects the vertex (`processClick`, entity node) | Known: nodes of a selected area cannot be selected | Known gap |
| Click a midpoint of the selected way | Treated as a click on the way (`behavior/select.js:294-296`) | missing: midpoints are not drawn (only `draw.ts` names them) | Midpoints |
| Double click on the selected way | Adds a vertex at the click (`modes/select.js:427-452`) | missing | Add vertex on double click |
| Right click | Edit menu (`behavior/select.js:172-196`) | Built: `MapContextMenu.tsx` (2026-10-13) | none |
| Long press (touch) | Edit menu after 500 ms (`behavior/select.js:101`) | Built: `MapView.tsx` 250 to 262, 500 ms (2026-10-13) | none |
| Escape | Back to browse (`modes/select.js:287`, `:492-495`) | clears the selection (`App.tsx:26`) | none |
| Vertices and midpoints of the selected way | Vertices: `svg/vertices.js:400`. Midpoints: `svg/midpoints.ts:77` | Not checked in Maid's layers | Check |

Selected rows: 8.

### Add point (mode `add-point`)

| Gesture | iD | Maid today | Gap |
| --- | --- | --- | --- |
| Click empty map | Adds a point, then selects it (`modes/add_point.js:16`, `add`) | Adds a point and selects it (`MapView.tsx:115-120`) | none |
| Click on a way | Puts the point on the way as a vertex, if the preset is a vertex (`behavior/draw.js:177-181`, `add_point.js` `clickWay`) | different: a plain point. The click passes only lng and lat (`MapView.tsx:117`) | Snap to a way |
| Click on a node | Tags that node (`behavior/draw.js:169-171`, `add_point.js` `clickNode`) | different: a new point beside it | Snap to a node |
| Escape | Cancels (`add_point.js` `cancel`) | Back to browse (`App.tsx:21-24`) | none |
| Space | Places a point at the pointer (`behavior/draw.js`, `space()`) | missing | Space as a click |

Add point rows: 5.

### Draw line and draw area (`behavior/draw.js`, `behavior/draw_way.js`)

Area and line work the same, except that the first node of an area closes it.

| Gesture | iD | Maid today | Gap |
| --- | --- | --- | --- |
| First click | Starts a way. A click on an end of a line continues it (`modes/add_line.js` `startFromNode` and `startFromWay`) | Starts a way. A click on an end continues it (`draw.ts:65-75`) | none |
| Next click | Adds a node (`behavior/draw_way.js`, `drawWay.add`, lines 370-400) | Adds a node (`draw.ts:65-103`) | none |
| Click on an existing node | Joins that node (`draw.js:169-171`) | Joins it (`draw.ts:82-91`) | none |
| Click on a way | Adds a node on that way (`draw.js:177-181`) | Adds a node on that way (`draw.ts:91-96`) | none |
| Click on the last node (line) or the first node (area) | Finishes the way (`draw_way.js`, `addNode`) | Finishes (`draw.ts:73-76`) | none |
| Mouse move | The preview node follows the pointer, snapped to the touch target under it (`behavior/draw.js:47-58`, `:133`) | The preview follows, snapped within 8 px (`MapView.tsx:108`, `draw.ts:27`, `:54-58`) | different: snap radius, and snaps to the nearest node or way |
| Alt held | No snapping (`behavior/draw.js:47`). The "nope" marker is hidden (`behavior/draw_way.js:118`) | missing for drawing (unverified, 2026-10-13: `MapView.tsx:193` checks Alt for a dragged vertex only) | Alt turns snapping off |
| Click that would cross the way | Rejected, with feedback (`draw_way.js`, `rejectedSelfIntersection`) | Not checked | Check |
| Double click while drawing | Second click ignored for 500 ms. Map zoom off (`behavior/draw.js:93-103`) | Map zoom off while drawing (`MapView.tsx:155`). Known: area closing still zooms | Known gap |
| Right click while drawing | Nothing: draw mode has no context menu handler | Nothing (no context menu) | none |
| Enter | Finishes and keeps the way (`behavior/draw.js:246`) | Finishes and selects (`useShortcuts.ts:34-37`) | none |
| Escape | Finishes and keeps the way (`behavior/draw.js:245`) | Finishes and keeps the way (`useShortcuts.ts:53-54`, 2026-10-13) | none |
| Backspace | Undoes the last node (`behavior/draw.js:243`, `:220`) | Built (2026-10-13): `useShortcuts.ts` | none |
| Delete (⌦) | Cancels and removes the way (`behavior/draw.js:244`, `:226`) | Built (2026-10-13): `useShortcuts.ts` | none |
| After finishing | Selects the way as a new feature (`draw_way.js`, `finish`, lines 529-544) | Selects the way (`MapView.tsx:126-127`) | none |

Draw rows: 15.

### Drag (mode `drag_node`, `behavior/drag.js`)

| Gesture | iD | Maid today | Gap |
| --- | --- | --- | --- |
| Drag a vertex | Moves it after 1 px of movement, 4 px for a pen (`behavior/drag.js:33-34`, `:94-96`; `modes/drag_node.js:130-160`) | Moves it at once on press (`MapView.tsx:89-102`). No distance limit | none for the move itself |
| Drop a dragged vertex on a node | Joins the two nodes (`modes/drag_node.js:373-425`, `actionConnect`) | Built (b33374f): a dragged node snaps and connects, as in iD | none |
| Drop a dragged vertex on a way | Adds the vertex to the way (`drag_node.js:373-425`, `actionAddMidpoint`) | Built (b33374f) | none |
| Drag a point (standalone node) | Moves it. Points are drag targets (`drag_node.js:453`) | missing: `isVertex` needs a way (`engine.ts:933-935`). Known | Known gap |
| Drag a midpoint | Makes a new vertex and moves it (`drag_node.js:138-145`) | missing | Midpoints |
| Drag a way body or empty map | Pans the map. A way is not a drag target | Pans the map (the handler returns before `preventDefault`, `MapView.tsx:89-93`) | none |
| Shift during a drag | Cancels the drag. Shift then starts a lasso (`drag_node.js:130-134`) | Shift is not checked during a drag | Minor |
| Alt during a drag | Turns off snapping on drop (`drag_node.js:175`) | No snapping, so nothing to turn off | Only after snapping is added |

Drag rows: 8.

### Touch

iD uses pointer events for every pointer type. A touch press that is held for 500 ms opens the menu (`behavior/select.js:91-104`). Maid's map handlers are react-map-gl's `onMouseDown`, `onMouseUp`, `onMouseMove` and `onClick` (`MapView.tsx:156-162`). Rows marked "inferred" follow from that and were not tested on a device. MapLibre's own tap and touch handling is an assumption.

| Gesture | iD | Maid today | Gap |
| --- | --- | --- | --- |
| Tap | A click: a tap moves at most 4 px, or 12 px within 500 ms when drawing (`behavior/draw.js:93`, `behavior/select.js:143-156`) | Inferred: MapLibre fires `click` for a tap, which reaches the same handler (`MapView.tsx:114-138`) | Verify on a device |
| Double tap on the map | Zooms (d3 zoom, not read) | Inferred: MapLibre's double tap zoom | Verify |
| Long press (500 ms) | Edit menu (`behavior/select.js:101`) | Built (2026-10-13): `MapView.tsx`, 500 ms | none |
| One-finger drag on a vertex | Moves the vertex after 1 px. The press stops propagation, so the map does not pan (`behavior/drag.js:57-59`) | Inferred: touch does not fire mouse events, so no vertex drag starts and the map pans (`MapView.tsx:89-102`) | Vertex drag by touch: top gap |
| One-finger drag on empty map | Pans | Inferred: pans (MapLibre) | none |
| Hover before a tap | A touch press counts as a pointer over (`behavior/hover.js:76-78`) | Inferred: no hover, because `mousemove` does not fire for touch | Hover on tap |
| Drawing a way by touch | The preview node does not show on touch. Each tap places a node (`behavior/draw_way.js:342-352`) | Inferred: the preview moves only on `mousemove` (`MapView.tsx:108`), so it does not follow the finger. Taps probably place nodes | Preview on touch |
| Pinch | Zooms (d3 zoom, not read) | Inferred: MapLibre pinch zoom | Verify |
| Pen | Drag starts after 4 px (`behavior/drag.js:34`) | Not checked | Check |

Touch rows: 9.

## Ranked gaps

Most important for everyday editing first. Each entry says what to change and where.

Status (2026-10-13): gaps 1, 2, 3, 4, 6, 7, 8, 12, 13 are built. Gap 18 is built except Follow (F). Still open: 5, 9, 14, 15, 16, 17 (partly), and Follow. Gaps 10 and 11 were not checked in this pass.

1. **Escape throws away the way being drawn.** iD finishes and keeps it (`behavior/draw.js:245`). In `App.tsx:21-24`, finish the drawn way and select it, as Enter does (`useShortcuts.ts:34-37`). Keep cancel on a separate control.
2. **A dropped vertex does not join a node or a way.** `engine.ts` `endDrag` (line 973) should take the drop target and apply `actionConnect` or `actionAddMidpoint` from `packages/model`, as iD does (`modes/drag_node.js:373-425`). `MapView.tsx:97-102` passes the target.
3. **Touch cannot drag a vertex, and a long press opens no menu.** `MapView.tsx:89-103` uses mouse events only. Add a touch path with a 1 px start and a 500 ms long-press timer (`behavior/select.js:101`, `behavior/drag.js:33`). Verify on a device.
4. **Backspace and Delete do nothing while drawing.** Add branches to `useShortcuts.ts` that run only when `engine.draw.active`: Backspace undoes the last node, Delete cancels the way (`behavior/draw.js:243-244`).
5. **A double click does not add a vertex, and midpoints are neither drawn nor draggable.** Draw midpoints for the selected way in `packages/renderer`, add a double click handler in `MapView.tsx` that calls `actionAddMidpoint` (`modes/select.js:427-452`, `svg/midpoints.ts:77`, `modes/drag_node.js:138-145`).
6. **No right-click or long-press edit menu.** Add `onContextMenu` in `MapView.tsx` that opens the existing operations list at the pointer (`behavior/select.js:172-196`).
7. **Continue a line (A) is missing.** It is not in the known list. Add a `continue` operation in `packages/operations/src/operations.ts` with shortcut `a`, which enters draw-line at the end of the selected line (`operations/continue.js:93`).
8. **Alt does not turn snapping off.** Pass `event.altKey` from `MapView.tsx` into `draw.move` and `draw.click`, and skip the snap in `draw.ts` (`SNAP_PX`, line 27). iD: `behavior/draw.js:47`, `behavior/draw_way.js:118`.
9. **Shift-drag lasso is missing.** Add it in `MapView.tsx`: Shift and mouse down, then select what the box covers with `queryRenderedFeatures`. iD: `behavior/lasso.js:19-27`, `:105-118`. This is not the Shift-click fix.
10. **Adding a point does not snap to a way or a node.** In `MapView.tsx:115-120`, use `engine.pick`. On a way, call `actionAddMidpoint`. On a node, tag it. iD: `behavior/draw.js:169-186`.
11. **Standalone points cannot be dragged.** Known gap. `engine.ts` `isVertex` (lines 933-935) should accept point features too.
12. **Space does not place a point or select at the pointer.** Store the last pointer position in `MapView.tsx`. Space then runs the same code as a click there. iD: `behavior/draw.js` `space()`, `behavior/select.js:45-56`.
13. **Keyboard pan and zoom are not bound in app code.** Add arrows and + / - in `useShortcuts.ts`, calling the map's `panBy` and `zoomIn`. Check first whether MapLibre's own keyboard handler already does this. iD: `data/shortcuts.json`, browsing rows.
14. **Vertex keys and parent and child keys are missing.** `[ ] { }` and ⌘↑ ⌘↓ need the parent and child lookup from `packages/model`. iD: `modes/select.js:265-290`.
15. **Z (zoom to selected) is missing.** Add it in `useShortcuts.ts`, fitting the map to the selection extent. iD: `modes/select.js:264`.
16. **Shift-arrow nudge and Shift-+/- scale are missing, and `useShortcuts.ts:40` ignores every Shift key.** Nudge needs the move operation (M, on the known list). iD: `modes/select.js:263-290` (the key bindings; the nudge and scale handlers were not read).
17. **Hover may not show a way's vertices.** Not checked in Maid's layers. Check `packages/renderer`, then compare with `svg/vertices.js:400-401` and `svg/midpoints.ts:77`.
18. **Follow (F), and move, rotate, reflect, copy and paste.** The last five are on the known list. Follow needs a line-following mode in `draw.ts`. iD: `behavior/draw_way.js:523`, `operations/move.js:74`, `rotate.js:75`, `reflect.js:112`, `copy.js:134`, `paste.js:92`.

## Not checked

- Whether MapLibre's built-in keyboard handler pans and zooms, and whether it fires `click` for a tap in the installed version.
- Whether Maid draws vertices for a selected way. Only the `build.ts` rule for points (`buildPoint`, `build.ts:383`) and the vertex state (`build.ts:411-414`) were read.
- iD's self-intersection rule in `draw_way.js`, and what Maid does for it.
- Escape during a drag, in both editors.
- The touch rules of iD's d3 zoom (pan, pinch, double tap on the map).
- The key letters are the built English strings, not the source translations.
