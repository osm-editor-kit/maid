# Merge areas (union of two areas)

Status: research, no code. Companion to the three-click rectangle tool: two rectangles drawn quickly overlap, and the user wants one outline (for example an L-shaped building).

Sources read: iD (pinned reference, `develop`), Tobias's local iD branch `WIP-join-merge-areas` (tip `64b95797b` "WIP", on top of `a0dee98d6` Phase B and `c20f0ad50` Phase A), Rapid 3, the JOSM help page for Join overlapping Areas, iD issue [#435](https://github.com/openstreetmap/iD/issues/435), and Maid's `packages/operations` and `packages/model`.

## 1. What exists and how it works

### iD today

- The Merge operation (`modules/operations/merge.js`, shortcut C) picks the first action that is not disabled from: join (lines), merge (features with tags), merge polygon, merge nodes. There is no union. Two overlapping buildings get "Merge (multipolygon)" or are refused.
- `actionMergePolygon` ([`modules/actions/merge_polygon.ts`](https://github.com/openstreetmap/iD/blob/develop/modules/actions/merge_polygon.ts)) does not compute a union. It builds a multipolygon relation from closed ways, and sorts them into outer and inner by containment (`geoPolygonContainsPolygon`). Two overlapping rectangles become two overlapping outers. Tags move to the relation.
- iD issue #435 ("Operations: merge", opened 2013-01-18, still open, about 21 comments). Points raised in it:
  - 2013-03-08: a maintainer is sceptical about merging non-intersecting areas, since data consumers split such multipolygons apart again.
  - 2016-12-13: the proposal to bring in polygon boolean operations (turf-style union) was welcomed.
  - 2022 and 2023: users ask for "two areas into one area, not a multipolygon". The demand is for a plain outline, not a relation.

### Tobias's WIP union (`WIP-join-merge-areas`)

Files: `modules/actions/union.ts` (about 470 lines), `modules/geo/polygon_boolean.ts` (about 280), `modules/operations/union.ts`, `modules/operations/merge_exclude.ts`, `modules/operations/merge.js` (changed), `test/spec/actions/union.js` (13 cases).

What it does:

- `actionUnion(ids)` takes exactly two ids.
- Each target is either a closed way with no parent multipolygon, or a complete multipolygon with exactly one closed outer way. Holes are allowed in the second kind (they are part of the geometry).
- Geometry: `polygon_boolean.ts` projects both shapes into a local planar space (iD's raw Mercator, centred on the joint centroid) and calls `polyclip-ts` `union` and `intersection`.
- Eligibility (`hasUnionGeometry`): the planar overlap area is above `AREA_EPSILON = 1e-4`, or the two outer ways share a run of two or more consecutive node ids (forward or reversed; `hasMatchingSharedBoundarySegment`).
- Result, simple outline: the survivor way gets the union ring. Each ring vertex reuses an existing node from either outer way if one lies within 0.05 m (`NODE_SNAP_METERS`), moving it to the exact union coordinate if it differs. Otherwise a new node is created. The loser way is removed with `actionDeleteWay`, and its relation memberships move to the survivor.
- Result, with holes: a new `type=multipolygon` relation is created (or the existing one is reused). The outer way gets no tags; the tags move to the relation. Hole rings become untagged inner ways.
- Survivor: a relation target beats a plain way; otherwise `utilOldestID` (the older OSM id wins; new ids lose).
- Tags: disabled when the comparable tags are not `deepEqual` (the `type` tag is ignored for relations). `area=yes` is dropped when it is redundant.
- Disabled reasons (strings in `data/core.yaml`): `not_eligible`, `not_simple_area`, `conflicting_tags`, `conflicting_relations` (the sorted parent relation lists must match), `invalid_union` (empty or several disjoint parts), `tagged_nodes` (a node with interesting tags on either outer way would drop off the result), `too_many_vertices` (checked in the operation against `osm.maxWayNodes()`).
- Operation `union` (`modules/operations/union.ts`): no shortcut key, `keys = []`, annotation "United two areas.", `available` = `hasUnionGeometry`. The icon comes from `operation.icon()`, with new sprites `operation-union.svg` and `operation-merge-exclude.svg`.
- Merge routing (`merge.js`, WIP): join, merge, union, merge polygon, merge nodes, in that order, with the "interesting disabled reason" fallback. `merge_exclude.ts` is the old merge polygon split out as its own operation; it is `available` only when the union applies and is not disabled.
- The diff also adds `svg/fontawesome/far-thumbs-up.svg`, which is unrelated to this feature and should be dropped from the commit.

Unfinished, found by reading:

1. **The overlap threshold is in the wrong unit.** `AREA_EPSILON = 1e-4` is compared with `polygonIntersectionArea`, which is computed in planar raw-Mercator units. The projection (`modules/geo/raw_mercator.js`) uses `k = 512/π` on radians, so one metre is about 2.6e-5 units east-west and about 4.1e-5 units north-south at 52° N. One square metre is then about 1e-9 units². The threshold is therefore roughly 1e5 m² (about 300 m on a side near Germany). A 10 m × 10 m overlap of 100 m² is not eligible unless the outlines share nodes. The WIP tests do not catch this because their squares are 2 to 6 degrees wide (for example `node('n1', 4, 0)` is four degrees of longitude). This is a computed finding, not a measured one; it should be confirmed with a metre-scale test.
2. **Shared nodes outside the selection can move.** The candidate nodes are the outer ways' own nodes, but `materializeRing` calls `graph.replace(node.move(loc))` on any of them, including a wall node that a neighbouring building also uses. The distance is at most 0.05 m, so the effect is small, but the action does not check for it.
3. **No collinear clean-up.** The output ring keeps every vertex that `polyclip-ts` returns, including collinear points on the same edge. I found no step that removes them.
4. **Only two ids.** `ids.length !== 2` is `not_eligible`; three or more areas are not supported.
5. **Dead reason key.** `operations.union.not_mergeable` exists in `data/core.yaml`, but `disabled` returns `not_eligible` for non-overlapping pairs, so the key is never shown.
6. **Multi-outer relations look available.** `hasUnionGeometry` accepts multipolygons with several outers, so `union` is offered and then disabled with `not_simple_area`. The `available` check should reject them first.
7. **Tests not run in this pass.** The 13 cases in `test/spec/actions/union.js` cover the listed behaviour (overlap, shared edge, corner touch, opposite corners, disjoint, multipolygon member, single-outer multipolygons, multi-outer, tagged node, node-id reuse), but I have not run them.

### JOSM (Shift+J, "Join overlapping Areas")

From the [JOSM help page](https://josm.openstreetmap.de/wiki/Help/Action/JoinAreas):

- Areas overlap if they intersect, or if they touch at two nodes.
- The area selected first keeps its history and id, so selection order matters.
- All tags of all areas go to the result. Differing values open a conflict dialog and the user chooses. Relation membership conflicts open a dialog too.
- A selected area with no overlap is not joined, but it still receives the tags.
- Selected nodes are ignored.
- An area surrounded by others with no intersection becomes a multipolygon.
- Refusals: "No overlapping areas in the Selection", "No intersection found. Nothing was changed.", and an open way in the selection.

### Rapid 3

[`modules/operations/MergeOperation.ts`](https://github.com/bhousel/Rapid/blob/main/modules/operations/MergeOperation.ts) chooses between join, merge, merge polygon and merge nodes, with the same routing as iD. It has no union. Its shortcut comes from `shortcuts.command.merge.key`. Rapid is not a reference for this feature.

### Maid today

- `packages/operations/src/operations.ts` line 219: `mergeOperation` (shortcut `c`) joins lines only (`mergePlan` requires every selected entity to be a line way). Its comment says that areas into a multipolygon are not ported. Its reason sentences are in `MERGE_REASONS` (line 190).
- `packages/model/src/actions`: `actionJoin`, `actionMerge`, `actionMergePolygon` (`merge_polygon.ts`), `actionMergeNodes`, `actionDeleteWay`, `actionDeleteRelation`, `actionChangeTags`, `actionMoveNode`, `actionSplit`, `actionStraightenWay` and others. There is no union action and no polygon boolean code. `packages/model/src/geo/geom.ts` has only coverage boxes, segments and self-intersection.
- `packages/model/package.json` depends on `d3-geo`, `d3-polygon`, `fast-deep-equal`, `rbush`, `node-diff3`, `@mapbox/polylabel`. `polyclip-ts` is not a dependency. Adding it would be a new dependency decision.
- Operation contract (`packages/operations/src/types.ts`): `id`, `label`, optional `icon` and `shortcut`, `applies(context)` (not offered when false), `disabled(context)` (a sentence for the tooltip), and `run(context)` returning `actions[]`, an `annotation` and an optional `select(after)`. Several actions in `actions` become one undo step.
- Wiring: each app's `maid.config.ts` passes `operations([...defaultOperations, pointToArea(...)])`. `defaultOperations` is a fixed array in `operations.ts` (line 846). A module adds an operation through that list; I did not locate a separate module extension point for operations in this pass.

## 2. Algorithm options

**A. Polygon boolean on coordinates, then map back to nodes (WIP).** Clip the two rings with a boolean library in a local planar projection. Map each output vertex to an existing node within a small tolerance, else create a node.
- Pro: correct for every overlap, holes come for free, and the code is small.
- Con: the output is floating-point geometry. Vertices created at edge crossings are always new. Snapping to nearby nodes can move nodes that other ways use. Clipper output can contain collinear vertices. The tolerance and the threshold need a single unit, and the WIP currently mixes units (see finding 1).

**B. Topology on shared nodes.** Build a planar graph from both outlines. Split each way at the points where the other outline crosses it (new nodes only there). Keep every edge that lies outside the other area, plus the shared edges once. Walk the boundary to get the outer ring.
- Pro: every original node that stays on the outline keeps its id and position. Only crossing points are new. Nothing is moved.
- Con: more code (edge splitting, ring walking, inside tests). Needs its own tests for touching and collinear cases.

**C. Shared nodes only (no new geometry).** Allow the union only when the two outlines share a consecutive run of nodes (the shared-edge case). Delete the shared run from the result and keep both ways' other nodes.
- Pro: very small and exact. No coordinates change.
- Con: does not solve the L-shaped case, where two rectangles overlap without sharing nodes. The rectangle tool would need to create shared nodes at the overlap first, which is a separate feature.

**Recommendation for discussion:** B for the outline, because it preserves ids and never moves a node. Use A only as a cross-check in tests. If B is too much for a first step, C plus a clear refusal for pure overlaps is the safe first step (see section 4). Thresholds should be in metres (`geoSphericalDistance`, `geoSphericalArea`), not in projected units. A node snap of 0.05 m and an overlap threshold of about 1 m² are sensible starting points, to be confirmed.

## 3. Geometry cases

| # | Case | iD / WIP | Proposed for Maid |
|---|------|----------|-------------------|
| 1 | Two closed ways overlap, no shared nodes | Overlap > 1e-4 units (too large for buildings, see finding 1). Survivor is the older way. | Allowed, with an overlap threshold in m². Survivor is the older id. Crossing points are new nodes. |
| 2 | Touching along an edge, shared nodes (row houses sharing a wall) | Allowed by shared-run check. Shared nodes drop out of the outline. | Allowed. Remove the shared run from the result. Nodes used elsewhere stay. |
| 3 | Touching, no shared nodes (coordinates equal, ids different; or a small gap) | Not mergeable (zero overlap). | Refuse with a reason ("the areas do not share nodes"). Do not merge nodes silently. |
| 4 | One inside the other, no touching | Overlap test passes, the inner way is absorbed. | Refuse by default ("one area is inside the other"). A hole would need the user's intent. Open question 3. |
| 5 | Three or more areas | Not supported (`ids.length !== 2`). | Not in the first step. Later: fold pairwise, one undo step, only if every pair connects. |
| 6 | Closed way plus multipolygon (single outer) | Supported; the relation survives. | Supported in a second step. |
| 7 | Multipolygon with holes | Supported as a target; holes are kept or cut by the union. | Supported in a second step. A hole that the other area fills is removed from the inner list. |
| 8 | Multi-outer multipolygon | Disabled (`not_simple_area`). | Disabled, same reason. |
| 9 | Ways that are members of other relations | Allowed only if both have the same parent relations; the loser's memberships move to the survivor with their role. | Same rule. Refuse different parent sets. |
| 10 | Areas whose nodes are shared with other ways (row houses, landuse next to building) | Shared nodes kept if the position does not change; not checked. | Refuse if an outline node that moves or disappears is used by a way outside the selection. Shared nodes whose position stays are fine. |
| 11 | Different tags (for example `building=yes` vs `building=house`) | Refused (`conflicting_tags`). | Refused, same as iD. JOSM's conflict dialog is a later option. |
| 12 | Same tags (differing only in `area=yes`) | Allowed; `area=yes` dropped when redundant. | Allowed, same rule. |
| 13 | Areas that do not overlap and do not touch | Not offered (`available` false). | Not offered. `applies` false, so no menu entry. |
| 14 | Tagged node on the shared outline | Refused (`tagged_nodes`) if it would drop off the result. | Same rule. |
| 15 | Result is several disjoint parts | Refused (`invalid_union`). | Same rule. Two parts would need a multipolygon, which is not a plain merge. |

Node ids: whichever way survives keeps its id. Nodes that stay on the outline keep their ids and positions (approach B). Only crossing points are new. Interior nodes that the result no longer uses are deleted if untagged and unused elsewhere (`actionDeleteWay` already does this).

## 4. Proposal for Maid

**Where.** A new `unionOperation` in `packages/operations/src/operations.ts`, next to `mergeOperation`, and a new `actionUnion` in `packages/model/src/actions`. Maid's Merge (`c`) should choose between join and union in one place, as iD and Rapid do, so the user keeps one key. `mergeOperation` keeps its line behaviour. Either: (a) `mergeOperation` routes to union when the selection is two areas, or (b) a separate `union` operation with no shortcut, offered in the edit menu. (a) matches iD; decide with Tobias.

**Name.** Label "Merge" in the edit menu when it is the chosen merge; annotation "United two areas." (matches iD's wording). Do not add a second shortcut.

**Applicability.** Two closed ways, or one closed way and one multipolygon with a single outer way, both areas, both with overlap or shared-run touching (computed in metres). Anything else: not applicable, so the menu does not show it.

**Disabled reasons (sentences in `MERGE_REASONS`-style table).**
- `conflicting_tags`: tags differ (apart from `area=yes`).
- `conflicting_relations`: different parent relations.
- `multiple_outers`: a multi-outer multipolygon is involved.
- `contained`: one area is inside the other (no touching).
- `shared_nodes_outside`: an outline node would move or vanish and another way uses it.
- `tagged_nodes`: a tagged node would be lost.
- `result_not_simple`: the result is several parts or empty.
- `too_many_vertices`: over the server limit (Maid reads it from its OSM config; check where).

Keep the sentences short and specific. Refusing is the default when the result is uncertain.

**Undo and selection.** One `actions` entry, one undo step, annotation "United two areas.". `select` returns the survivor id.

**Survivor.** The older OSM id (`utilOldestID`-style), a relation beats a plain way (WIP rule). Not the first selected (JOSM), which is a different convention; see open questions.

## 5. Test plan

Unit tests (`packages/operations/src/*.test.ts` and `packages/model` action tests), each a small graph built in code, as the existing `operations.test.ts` does:

1. Overlapping metre-scale rectangles (10 m squares, 3 m overlap): eligible and merged. This also guards the threshold unit (finding 1).
2. Same, with overlap below the threshold: refused.
3. Shared-edge row houses: merged, shared nodes removed from the outline, neighbour's nodes untouched.
4. Touching with no shared nodes: refused with the no-shared-nodes reason.
5. One inside the other: refused.
6. Three areas: not applicable.
7. Closed way plus single-outer multipolygon: merged into the relation (second step).
8. Multipolygon with a hole that the other area fills: hole removed (second step).
9. Multi-outer multipolygon: refused.
10. Different tags: refused. Same tags with `area=yes` on one: merged, `area=yes` dropped.
11. Different parent relations: refused.
12. Shared node with an outside way that would move: refused.
13. Tagged node on the outline that would be lost: refused.
14. Result with a second disjoint part: refused.
15. Survivor id is the older one; node ids on the outline are reused; new nodes only at crossings.
16. Collinear points do not remain in the output.
17. Undo restores all ways, nodes and relation memberships (one step).

Browser check (`bun run check-union`, proposed name, to be added to `tools/checks` and the `check-all` table): draw two overlapping 10 m buildings with the rectangle tool, shift-select both, press `c`, verify one outline with the expected vertex count and the survivor id; undo; verify the two buildings are back; select two buildings with different tags, verify the tooltip shows the conflicting-tags reason and nothing changes. Use real input and compare data and map after each step. This runs only with `bun run dev` and never in parallel with other agents.

## 6. Open questions for Tobias

1. **Threshold.** Confirm the overlap threshold in metres (proposal: about 1 m² for any overlap, or a minimum overlap length). The WIP's 1e-4 is not in a meaningful unit (finding 1).
2. **Approach.** Topology on shared nodes (B) or polygon boolean with snapping (A), or the shared-edge-only first step (C)? This should be an ADR in `docs/adr/`.
3. **Contained areas.** Refuse (proposed), or offer a multipolygon with the inner as a hole?
4. **Survivor.** Oldest id (iD, proposed) or first selected (JOSM)?
5. **Shortcut.** One Merge key that picks join or union (iD and Rapid) or a separate union operation?
6. **Tags.** Refuse on any conflict (iD, proposed) or a later conflict dialog (JOSM)?
7. **Scope of step one.** Two closed ways only, or also closed way plus single-outer multipolygon?
8. **Dependency.** Is `polyclip-ts` acceptable in `packages/model` if approach A is chosen?
9. **WIP cleanup.** Drop `far-thumbs-up.svg` and the unused `not_mergeable` key before anything is ported.
10. **Overlap of the rectangle tool.** Should the three-click rectangle tool offer to merge with an area it overlaps, or stay separate?

## Not verified in this pass

- The WIP tests were not run. No iD or Maid tests, installs, dev servers or browser checks were run.
- The overlap-unit finding is computed from the code (projection scale and `ringArea`), not measured. Confirm with a metre-scale test.
- The iD issue summary covers the comments listed, not all 21.
- Where Maid's shell wires `operations` into the edit menu was not located in this pass.
