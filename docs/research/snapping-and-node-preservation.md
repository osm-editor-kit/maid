# Snapping and node preservation

Research only. No code was changed. Citations are `file:line-range`. iD paths are under `.reference/id/`. "measured" means a script in the session scratchpad ran the model and printed the result (output in part 2). "read" means the code was read. "inferred" means a conclusion from code that was not run.

Line numbers in `docs/research/interactions-vs-id.md` (for example `engine.ts:973` for `endDrag`) are stale. `endDrag` is now at `packages/renderer/src/engine.ts:1128`.

## Summary

- Maid has no drop-snap. Dragging a vertex or a point never connects it to a node or inserts it into a way. Drawing and clicks do snap, but adding a point never does.
- Maid's connect keeps the first node in the list that has a `version`, not the oldest id. A drop-connect built the iD way would delete the older node.
- The transform (move and rotate) moves shared nodes in place. This keeps the id count low but silently bends ways that are not selected. iD's move adds replacement vertices for them.

## Part 1: snapping while dragging and drawing

### 1.1 Situation table

| Situation | iD | Maid today | Gap |
| --- | --- | --- | --- |
| Drag a vertex onto another vertex | Connects them. The survivor is the oldest interesting node (`modes/drag_node.js:397-400`, `actions/connect.ts:25-44`). | Nothing. The drop only commits "Moved a node" (`engine.ts:1128-1139`). Two nodes stay at one place. | Total |
| Drag a vertex onto a way | Places the node on the nearest edge and inserts it there (`drag_node.js:208-215`, `:387-396`, `geom.ts:47-85`, `actions/add_midpoint.ts`). | Nothing. | Total |
| Drag a vertex onto an area outline | Same as a way: areas draw the same segment targets (`svg/areas.js` uses `svgSegmentWay`, `svg/helpers.ts:229-289`). | Nothing on drag. Draw snaps to an outline (`draw.ts:312-349`, outline only, 8 px). | Total for drag |
| Drag a vertex onto its own way | Segments next to the dragged node are "nope" targets; the others snap. Dropping on a nope bounces back (`drag_node.js:380-386`, `svg/helpers.ts:29-60`, `:229-289`, `css/20_map.css:82-86`). A self-intersection is refused (`drag_node.js:298-354`, `:237-268`). | No target at all. No self-intersection check on drop. | Total |
| Drag a standalone point onto a vertex | Connects. The point is not a vertex, so it may snap to any node (`drag_node.js:92-97`). The point is deleted and its tags are merged into the survivor (`connect.ts` merges tags into the survivor). | Nothing. | Total |
| Drag a standalone point onto a way or area outline | The point id is inserted into the way and keeps its tags (`drag_node.js:387-396`, `actions/add_midpoint.ts`). | Nothing. | Total |
| Drag a point onto another point | Connects them, as for a node (`drag_node.js:397-400`). Tags merge into the survivor. | Nothing. | Total |
| Drag with Alt held | Alt turns snapping off: `datum()` returns `{}` (`drag_node.js:174-183`), and the nope marker is hidden (`:104-115`, `:360`). | No snapping, so Alt does nothing. | Moot until snapping exists |
| Drag onto a hidden or read-only feature | A hidden feature is not drawn, so it has no target. A drag that starts on a feature with hidden connections is cancelled (`drag_node.js:130-145`). | `isDraggable` refuses read-only nodes (`engine.ts:1088-1090`). Hidden features are not in the rendered layers (`MapView.tsx`, `pick(point, interactive)`: inferred). | Read-only and hidden targets are not checked on drop (no targets exist) |
| A drop that would break a relation | `actionConnect.disabled` (turn restrictions, roles) blocks the snap: nope cursor and a flash hint (`drag_node.js:237-244`, `:277-295`; `actions/connect.ts:79-`). | `actionConnect` has `disabled` (`packages/model/src/actions/connect.ts:73`, `merge_nodes.ts:84-92`), but no drop calls it. | Total (API exists) |
| Add a point on a vertex | No new node. The existing node is tagged and selected (`modes/add_point.js:59-78`, `behavior/draw.js:163-171`). | Add-point mode passes only lon and lat (`MapView.tsx:191-199`). Creates a second node at the same place (`engine.addPoint`, `engine.ts:833-836`). | Total: a duplicate node is created |
| Add a point on a way | A vertex is inserted, if the preset is a vertex (`add_point.js:41-50`, `behavior/draw.js:173-181`). | A standalone point. | Total |
| Draw: click on a vertex | The node is reused, and the line finishes if it is the previous node (`behavior/draw_way.js:389-417`). | Reused: `draw.ts` `click` node branch (`actionDeleteNode(cursor, false)` and `actionAddVertex(way, target.id)`), and `draw.ts:272-310` `target`. Finish on the last node: `draw.ts:72-83` (inferred line range). | Same. Snap radius differs (below) |
| Draw: click on a way | Inserts the new node on the nearest edge (`draw_way.js:378-386`, `draw.js:173-181`). | Inserts it (`draw.ts` `click` way branch, `actionAddMidpoint`), `nearestOnWay` at `draw.ts:312-349`. | Same |
| Draw: click on the way being drawn | Its own edges are skipped by `geoChooseEdge` (`geom.ts:56`). The previous node finishes (`draw_way.js:389-397`). | The way and the cursor node are skipped in `pick` (`draw.ts:282-285`). The last fixed node finishes (`draw.ts:72-83`, inferred). | Same |
| Visual feedback during the drag | The target is highlighted through hover and the `.target` styles. The cursor shows `nope`, and a flash names the reason (`css/20_map.css:48-66`, `css/55_cursors.css`, `drag_node.js:237-268`). The vertex jumps onto the target (`drag_node.js:205-208`). | Only the hover state of the dragged node (`engine.setHover`, `engine.ts:1143-1147`). No target highlight. | Total |
| Undo label | "Connected a way to a node", "Connected a point to a way" and so on (`drag_node.js:72-90`); "Moved a node" otherwise. | "Moved a node" for every drag (`engine.ts:1134`). `insertNode` says "Added a node to a way" (`engine.ts:816-831`). | Connect labels missing |
| Snap distance, ways | The way's touch target is 12 px wide, so about 6 px to each side (`css/20_map.css:60-66`). | 8 px in draw (`draw.ts:28`), 6 px in `pick` for press and hover (`engine.ts:1309-1313`). Drag: no snap. | Maid's draw snaps wider than iD's way target. Node target size: inferred, not read |
| Snap distance, nodes | The node target is its marker's fill (`css/20_map.css:48-58`). Exact radius: inferred. | 8 px in draw (`draw.ts:28`, `:272-285`). | Similar |
| Map nudge at the edge while dragging | Pans the map and keeps the node moving (`drag_node.js:50-63`, `:365-369`). | None. The only "nudge" is keyboard (`apps/maid/src/components/useShortcuts.ts`). | Total |

Draw with a snap is already the closest parity: `draw.ts:54-57` (`move`) snaps the preview node through `target`, the same as iD's `draw_way.js:112-135`.

### 1.2 Fix specification

The goal is a drop that does what iD does, through the same actions, as one undo step. Maid already has the pieces: the draw tool's `target` (`draw.ts:272-310`), `nearestOnWay` (`draw.ts:312-349`), `actionConnect` with `disabled` (`connect.ts:21`, `:73`), `actionAddMidpoint`, and `history.perform` plus `commit` (the pattern of `insertNode`, `engine.ts:816-831`).

**Engine API** (`packages/renderer/src/engine.ts`)

1. Move the target logic of `draw.ts:272-349` into a shared function, for example `packages/renderer/src/snap.ts`: `snapTarget(engine, point, layers, skip)` returns `{ type: 'node', id, loc }`, `{ type: 'way', loc, edge: [a, b] }` or `{ type: 'free', loc }`. The draw tool and the drag both call it. Tolerance: `SNAP_PX` (8 px) for nodes and ways, as in draw.
2. `dragTo(id, lon, lat)` (`engine.ts:1097-1114`) gets an optional `snap` argument. When it is present the node is moved to `snap.loc`, as iD does (`drag_node.js:205-215`). `MapView.movePointer` (`MapView.tsx:121-127`) computes it with `snapTarget(engine, event.point, interactive, new Set([dragging]))`. The skip set holds the dragged node. Its own way's adjacent segments are refused (see below), so the skip set does not hide them.
3. `endDrag()` (`engine.ts:1128-1139`) reads the last snap it stored and performs one action inside the work in progress, then commits once:
   - node target: `actionConnect([older, newer])`. Pass the ids so that the older node wins with the rule in 1.2 (the survivor fix, below). Annotation: `Connected a point to a node` when the dragged node has no parent way, otherwise `Connected a way to a node` (iD's labels: `drag_node.js:72-90`).
   - way target: `actionAddMidpoint({ loc: snap.loc, edge: snap.edge }, node)`. The dragged node keeps its id and its tags. Annotation: `Connected a way to a way` or `Connected a point to a way` (iD: `drag_node.js:72-90`).
   - no target: unchanged, "Moved a node".
   - `history.commit` once (as `endDrag` does now), so the whole drop is one undo step.
4. Refusals, checked before any action: if `actionConnect([a, b]).disabled(graph)` returns a reason, do not snap; the node goes back to its start (`_actionBounceBack`, `drag_node.js:433-444`) and a flash names the reason. Also refuse a drop on an adjacent segment of the dragged node's own way (iD's nope: `svg/helpers.ts:29-60`). A self-intersection check after the move is needed for parity (iD `hasInvalidGeometry`, `drag_node.js:298-354`). Its existence in Maid is not checked here (see unsure).
5. Read-only targets and hidden layers: `pick` in `interactive` layers already excludes hidden features (inferred). Also skip any target for which `isReadOnly(id)` is true.
6. Alt: `MapView.tsx` passes `event.altKey` into `dragTo` and `draw.move`. When Alt is held, `snap` is `undefined` (iD: `drag_node.js:174-183`).

**Survivor fix (required before the drop-connect is safe)**: `connect.ts:25-31` must pick the oldest existing node by numeric osm id, with interesting tags first, as iD does (`connect.ts:25-44`, `util.ts:709-727`). The other agent is changing this now. Until it lands, `actionConnect([target, dragged])` would keep the target even when the dragged node is older.

**Highlight**: reuse the highlight source (`engine.ts:1242-1248`, `pushHighlight`, `previewFeatures`). Add a `snapFeatures` list: for a node target, the target's point feature (or `setHover` on the target's id, `engine.ts:1143-1147`); for a way target, a short `LineString` of the edge. `pushHighlight` merges it with the shape and preview features. When the drag is refused, show the not-allowed cursor (`setCursor`, `MapView.tsx`, as `css/55_cursors.css` does for `nope`).

**Undo label**: as in 3. Test with `history.undoLabel` (`engine.undoState`, `engine.ts:979-989`).

### 1.3 Browser checks to add

Add to `tools/bench/interactions-check.ts` next to `report('dragging a point moves it', ...)` (line 185), in the same style: `report(label, expected, actual)`.

```ts
report('drag a vertex onto a vertex: one node left, the older id kept', [olderId], survivors(...))
report('drag a vertex onto a vertex: undo label', 'Connected a way to a node', undoLabel)
report('drag a vertex onto a way: the vertex is in the way between its two nodes', true, insertedBetween(...))
report('drag a point onto a vertex: the point is gone, its tags are on the vertex', [vertexId, 'amenity=bench'], ...)
report('drag a point onto an area outline: the point id is a node of the way', true, ...)
report('Alt held while dragging onto a vertex: no connect', [dragged.id, vertex.id], ...)
report('drop that would break a restriction: the node goes back, no connect', true, ...)
report('drag a vertex onto its own way, adjacent segment: bounces back', true, ...)
report('add point on a vertex: no new node, the vertex gets the tags', 0, newNodeCount)
report('add point on a way: a vertex is inserted in the way', true, ...)
report('dragging onto a read-only feature: no snap', true, ...)
```

Add the draw-side checks to `tools/bench/draw-check.ts` in the same style: click on a vertex reuses it (no new node), click on a way inserts one node, and Alt held while drawing does not snap.

### 1.4 Status after the snapping change

Built: `packages/renderer/src/snap.ts` (pure helpers, unit tests in `snap.test.ts`), `engine.ts` (`snapAt`, `aimAt`, `connectRefusal`, `dragTo` with the pointer, `endDrag`, `addNodeOn`), `draw.ts` (shares `nearestOnPolyline` and `SNAP_PX`), `MapView.tsx` (pointer, Alt, cursor, selection after a drop, add point).

| Situation | Maid now | Still behind iD |
| --- | --- | --- |
| Drag a vertex onto a vertex | Snapped to the node. On release one undo step, `actionConnect`: the older id survives, the survivor is selected. Label "Connected a way to a node" | No iD-style flash that names the refusal. The reason is returned by `endDrag` only |
| Drag a vertex onto a way or an area outline | Snapped to the nearest point of the line (8 px). Inserted into the way with `actionAddMidpoint`. Label "Connected a way to a way" | Area targets are the outline only, as in iD. Inside an area nothing snaps |
| Drag a standalone point onto a vertex or a line | Connected. The point's id and tags are kept on a line. Labels "Connected a point to a node" / "Connected a point to a way" | Tags of a point that joins a node are merged into the survivor (`actionConnect`), as iD does; not checked against a real edit |
| Drag onto the node's own ways | Own ways are not targets. A neighbour in the same way is refused with the reason "joined to its neighbour" | iD's "nope" segment and the self-intersection check (`hasInvalidGeometry`) are not built. A drop on a non-adjacent segment of its own way just moves the node |
| Refused drop | Node back at the start (the work in progress is reverted: no undo step). Cursor `not-allowed` while over the target. Reasons: turn restriction, relation roles, neighbour in the same way, read-only way | No flash message in the UI: the reason is in the `endDrag` result, and no UI shows it yet |
| Alt held | No snap, the drop moves the node | |
| Read-only and hidden features | Never a target: a drop on them is a plain move (the brief's "refused" for read-only is not used, because a read-only target is never found) | |
| Add point on a vertex | Selects the existing node, no new node | A favourite's tags are not applied to the existing node (iD applies the preset) |
| Add point on a line | One new node inserted into the way, selected (label "Added a node to a way") | A favourite picked for add point is dropped on a line: the vertex is untagged. Keeping its tags needs the pending tags from `favourites.ts`, which is outside this change |
| Hover | The target is highlighted with the `hover` state (the way or the node). No new highlight layer | iD's `.target` style and the vertex jump are approximated by hover plus the snapped position |
| Map nudge at the edge | Not built | Behind iD |

Checks: `bun run check-interactions` (new block "snapping": vertex onto vertex, Alt, corner onto road, point onto road, refused neighbour, add point on a vertex and on a line), `check-edit`, `check-draw` and `check-undo` all pass. The touch check now drops the vertex on a clear place: the old drop point was 30 px from another node and would now connect (an expectation that was only right because nothing snapped).

Drag-step timing: not measured in this change (the browser run measures correctness only). The step adds one `queryRenderedFeatures` in an 16 px box and a projection of the ways under the pointer, only while a drag runs.

## Part 2: are old nodes preserved, and are as few new ones created as possible?

### 2.1 Measured results

Script in the session scratchpad (not in the repo). It builds a small graph with `packages/model` (`actions` from `packages/model/src/index.ts`), runs one action and prints created, deleted and changed ids. Ids are chosen so that the older id is a lower positive number, as in OSM. Every node has a `version`, as every fixture node does (`fixtures/small.json.gz` has `version` on each element, read via `gunzip -c`).

```
connect [n10 old, n5 older] (drag target first)   created [] deleted [n5]          changed [w2]
connect [n5 older, n10 old]                       created [] deleted [n10]         changed [w1]
connect [n-1 new, n10 old]                        created [] deleted [n-1]
connect [n5 older untagged, n10 tagged bench]     created [] deleted [n10]         changed [n5, w1]   n5 now has amenity=bench
join w7 + w3 (both old, same tags)                created [] deleted [w7]          changed [w3]       (w3 is the lower id)
split w7 at n2                                    created [w-1]                    changed [w7]       0 new nodes
disconnect shared n3 (w1, w2 old)                 created [n-1]                    changed [w2]       n3 stays on w1
extract tagged vertex n3 from w1                  created [n-2]                    changed [w1]       way uses n-2, n3 keeps its tags
circularize 4-corner building                     created 16 new nodes             changed [c1..c4, w1]  no node deleted; 21 nodes in the way
straighten way, 3 untagged interior nodes         deleted [s2, s3, s4]
orthogonalize square with untagged mid node       deleted [qm]
reverse w1                                        changed [w1] only
delete way w1 [d1 untagged, d2 shared, d3 tagged] deleted [d1, w1]                   d2 and d3 kept
transform: actionMoveNode on w1's nodes           created [] changed [m1, m2, m3]    w2 is unchanged but its node m2 moved
actionMove (model move) of w1 by 30 m             created [n-1, n-2]                 w1 gets n-1 between m1 and m2; w2 gets n-2 at m2's old place
```

Notes on the results:

- The connect rows follow `packages/model/src/actions/connect.ts:25-31`: the first node in the list with a `version` wins, otherwise the last. The "older" node in row 1 is `n5`, which Maid deletes.
- The move row with `n-1` is not explained by the code I read. `move.ts:306` skips the orig vertex when the angle is 175 to 185 degrees, and the 3-node way is straight. The insertion into the moved way itself is unexpected. Its cause was not traced.
- Circularize: the existing corners are moved in place (`circularize.ts:100-106`), and new nodes are inserted per segment (`circularize.ts:121-130`). Maid's count for a 20 m building is 16 new nodes. iD uses `MIN_VERTICES = 12` and `MAX_VERTICES = 32` (`.reference/id/modules/actions/circularize.ts:21-22`, clamped at `:219`), so iD's count is probably lower for small features (inferred, not run). This is also F-actions-a-2 in `docs/research/id-tests/actions-a.md:33`.

### 2.2 Edit table

"Survive in iD" is the id that remains when iD makes the edit. "Maid" is measured or read.

| Edit | Survive in iD | Maid | Same? | New entities (typical) | Risk |
| --- | --- | --- | --- | --- | --- |
| Connect nodes (drag, merge nodes, merge points) | Oldest existing node, with interesting tags first (`connect.ts:25-44`, `util.ts:709-727`) | First node with a `version` in list order, else last (`connect.ts:25-31`). Measured: the older `n5` is deleted in favour of `n10` | No | 0 | High: the older id is lost. Being fixed by another agent (F-actions-a-5, F-actions-b-2) |
| Merge ways (join) | Oldest existing way (`join.js`) | Oldest by numeric osm id (`join.ts:75-82`). Measured: `w3` kept | Yes | 0 | Low |
| Split a way | Longer part keeps the id (`keepHistoryOn` `longest`, `split.ts:52`, `:183-193`) | Same default (`split.ts:52`, `:183-193`). Measured: `w7` kept, `w-1` created | Yes | 1 way, 0 nodes | Low |
| Disconnect a shared node | First way keeps the node; others get a new one (`disconnect.js:38-51`, `:105-114`) | Same, plus: an existing node stays on an existing way when a new way comes first (`disconnect.ts:101-114`). Measured: `n3` kept on `w1`, `n-1` on `w2` | Yes (Maid's extra rule is better) | 1 per extra way | Low |
| Extract a vertex | The ways get a replacement node; the tagged original becomes the point (read: `extract.ts:45-55`) | Same (`extract.ts:45-55`). Measured: way uses `n-2`, `n3` keeps tags | Yes | 1 | Low. Relation membership: F-actions-a-6 |
| Extract an area's tags to a point | New point (`extract.ts:114-122`, read) | Same | Yes (read) | 1 | Low |
| Circularize | Corners move in place; arcs get new nodes; `MIN_VERTICES` 12, `MAX_VERTICES` 32 (iD `circularize.ts:21-22`, `:219`) | Corners move in place (`circularize.ts:100-106`). Arc nodes per 20-degree segment (`circularize.ts:121-130`). Measured: 16 new for a 4-corner building | Ids yes; count likely higher than iD (inferred) | 16 for a 4-corner building (measured) | Medium: F-actions-a-2, F-actions-a-3 |
| Straighten a way | Untagged, unshared interior nodes deleted at t = 1 (iD `straighten_way.ts:100-124`) | Same (`straighten_way.ts:86-101`). Measured: 3 deleted | Yes | 0 | Low: a deliberate iD behaviour. Deletes old ids, but they are redundant |
| Straighten nodes | Moved in place | Moved in place (`straighten_nodes.ts:64`, read) | Yes | 0 | Low |
| Orthogonalize | Straight untagged node deleted at t = 1 (read: `orthogonalize.ts:170-181`). A duplicated position kept (F-actions-b-12) | Same delete. Measured: `qm` deleted. Duplicate vertex not kept (F-actions-b-12) | Partly | 0 | Medium: an old vertex is lost for a duplicate |
| Reverse | Way id and node ids kept | Same. Measured: only `w1` changed | Yes | 0 | None |
| Reflect | Nodes moved in place | Moved in place (`reflect.ts:58-59`, read) | Yes | 0 | None |
| Move (model `actionMove`) | Nodes move; a replacement vertex keeps shape for neighbouring ways that are not moved (iD `move.js:140-190`, `:184-190`) | Same design (`move.ts:232-305`). Measured: `w2` gets `n-2` at `m2`'s old place, which is correct. A second vertex `n-1` appears in the moved straight way, unexpected | Yes for neighbours; extra in the moved way | 2 for one shared node (measured) | Medium: waste, cause not traced |
| Transform (move and rotate in the editor) | iD's move keeps shape with replacement vertices (above) | `transform.ts:110` moves every node of the selected ways with `actionMoveNode`. Measured: 0 new, but a neighbouring way `w2` bends with no replacement | No | 0 | High for data: an unselected feature changes silently |
| Drag a vertex or a point | Node moved (`drag_node.js`), plus connect on drop | Node moved (`engine.ts:561-575`). No connect (part 1) | Move yes, connect no | 0 | See part 1 |
| Delete a way | Untagged, unshared nodes deleted (`delete_way.js`, `actionDeleteWay`) | Same (`delete_way.ts:19-50`). Measured: `d1` and `w1` deleted, `d2` and `d3` kept | Yes | 0 | None |
| Delete a node | Node removed from ways; degenerate ways removed (`delete_node.js`) | Same (`delete_node.ts:17-38`, read) | Yes | 0 | None |
| Copy and paste | New ids for the copies (`copy_entities`) | New ids (`engine.ts:767-795`, read) | Yes (expected) | copies | None |
| Draw: click on a vertex | Reused (`draw_way.js:389-417`) | Reused (`draw.ts` `click`, node branch; read) | Yes | 0 | None |
| Draw: click on a way | New node inserted (`draw_way.js:378-386`) | New node inserted (`draw.ts` `click`, way branch; read) | Yes | 1 | None |
| Draw: finish on the first node of an area | Closes the area, no new node (`draw_way.js:389-397`) | Closes it (`draw.ts` `closes`, read) | Yes | 0 | None |
| Draw: undo the last node | Removes the node (`draw_way.js:189-222`) | `undoLast` deletes the cursor node, and keeps a shared node (`draw.ts:146-170`, read) | Yes | 0 | None |
| Draw: cancel | Reverts everything it added (`draw_way.js`, `resetToStartGraph`) | `cancel` reverts (`draw.ts:174-180`, read) | Yes | 0 | None |
| Double click on a way | New node on the way (iD's select mode; file not read, inferred) | `insertNode` creates a new node (`engine.ts:816-831`) | Yes | 1 | None |
| Add point | New node (`add_point.js:29-39`) | New node (`engine.addPoint`, `engine.ts:833-836`). On an existing vertex: a duplicate | No, on a vertex | 1 (duplicate) | Medium: see part 1 |
| Point to area (Maid) | No iD equivalent | Point keeps its id as the first corner; 3 new nodes make the square (`point-to-area.ts:80-107`, read) | n/a | 3 (the minimum for a square) | None |
| Journal restore | Not applicable | Replays the stored changes by entity id (`journal.ts:269-300`, read, not run) | Yes (expected) | 0 | Low |
| Upload classification | `modify` for a moved node | Created = only in head; modified = in both; deleted = only in base (`Difference.ts:150-195`, read). A moved node is `modify`; a node created and deleted in one session is in neither, so it is left out (`osm-change.ts:66-75`) | Yes | n/a | None |

Edits the earlier reports already name (cite, do not re-derive): F-actions-a-2 and -3 (circularize), F-actions-a-5 (connect survivor), F-actions-a-6 (extract relations), F-actions-b-1 (merge keeps an existing point's id), F-actions-b-2 (connect survivor), F-actions-b-3 (merge polygon survivor), F-actions-b-12 (orthogonalize duplicate vertex), all in `docs/research/id-tests/actions-a.md` and `actions-b.md`.

### 2.3 Ranked list: where Maid loses an id or creates more than needed

1. **Connect survivor (lose an older id).** `packages/model/src/actions/connect.ts:25-31`. Measured: `[n10, n5]` keeps `n10` and deletes the older `n5`. Proposal: choose the oldest existing node by numeric osm id, with interesting tags first (`util.ts:709-727` in iD). Status: being fixed by another agent. Read: still the same code in the working tree.
2. **Transform moves shared nodes in place (distort a neighbour, no id lost).** `packages/renderer/src/transform.ts:59-80` (`begin`, `nodesOf`) and `:110` (`actionMoveNode`). Measured: `w2` bends with no replacement. Proposal: use `actionMove(ids, delta)` (`packages/model/src/actions/move.ts:67`) for the apply step, so neighbours keep their shape like iD's move. This adds a few new vertices for neighbours only.
3. **Circularize adds 16 nodes to a 4-corner building.** `packages/model/src/actions/circularize.ts:121-130`. Measured. Proposal: cap the count with iD's `MIN_VERTICES` and `MAX_VERTICES` (iD `circularize.ts:21-22`, `:219`). Fewer new nodes for small features. F-actions-a-2.
4. **actionMove inserts a vertex into the moved straight way.** `packages/model/src/actions/move.ts:292-305`. Measured: `n-1` in `w1`. Proposal: add a test (a straight 3-node way moved uniformly creates 0 nodes) and trace why the straight-line skip does not fire. Cause not traced.
5. **Orthogonalize deletes a duplicated straight vertex.** `packages/model/src/actions/orthogonalize.ts:170-181`. Measured: untagged `qm` deleted. Proposal: keep a vertex that shares its position with a neighbour, as F-actions-b-12 describes. iD's rule is the same for untagged straight nodes; the duplicate case is the gap.
6. **Drop does not connect (creates duplicate nodes instead of joining).** `packages/renderer/src/engine.ts:1128-1139` and `:833-836`. Read. Adding a point on a vertex creates a second node at the same place. Proposal: part 1 above.
7. **Straighten deletes untagged interior nodes.** `straighten_way.ts:95-101`. Same as iD. Not a Maid-only gap. Listed so that the owner can decide whether an old id should stay if the result can express it.

No case found where Maid creates a new way or node that iD would reuse, except items 3 and 4.

## Unsure, and what was not checked

- iD circularize counts for the 4-corner building: inferred from its constants, not run.
- iD node target radius: inferred from `css/20_map.css:48-58`.
- Hidden features are excluded from Maid's `pick`: inferred from the `interactive` layer list, not read.
- No self-intersection check exists in Maid's draw or drag. Only the draw and drag code was read, not the whole codebase.
- The cause of the extra vertex in the moved way (`n-1`, item 4) is untraced.
- Journal restore, copy and paste, and point-to-area were read, not run.
- The browser checks were not run (per the brief).
