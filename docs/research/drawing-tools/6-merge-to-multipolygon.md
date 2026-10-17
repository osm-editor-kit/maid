# Merge to a multipolygon (C for a building with a hole)

Research and spec, 2026-10-17. No code changed. iD and Rapid were read only (`.reference/id`, `.reference/rapid`). Nothing was run: statements about Maid's current behaviour come from reading the code, and where that is an inference it says so.

## The answer for Tobias

- **iD: yes.** Select the outer area and the inner area, press C (or right-click, Merge). iD makes one `type=multipolygon` relation. The outer way's tags move to the relation, the outer way loses them, the inner way gets the inner role and keeps its own tags.
- **Maid today: no.** C works for lines only (join). The parking app's union (`module-shapes`) merges two overlapping or touching areas into one outline and refuses nested ones. `actionMergePolygon` is ported in `packages/model` but no operation calls it.

## 1. How iD does it

1. **Key C runs one operation.** `operationMerge` (`modules/operations/merge.js:12`) takes the first action that is not disabled, in this order: join, merge, merge polygon, merge nodes (`merge.js:18-28`). If all are disabled it keeps the first one whose reason is not `not_eligible` (`merge.js:31-35`). Disabled reasons become tooltips from `operations.merge` in `data/core.yaml:315-333`.
2. **Join also sees closed untagged ways.** `actionJoin` groups by `entity.geometry()` (`join.ts:26-32`), so a closed way without area tags is a line. Two closed rings then fail join with `not_adjacent` (`join.ts:141-143`). Two tagged closed areas fail join with `not_eligible` (`join.ts:136-137`). Merge (point into feature) needs a point (`merge.ts:119-125`).
3. **Rings.** Closed ways and multipolygons are accepted, anything else is `other` (`merge_polygon.ts:12-32`). A multipolygon contributes its joined member rings (`osmJoinWays`, `:42-45`), a closed way is one ring (`:44-48`).
4. **Containment and roles.** A matrix says which ring contains which (`:53-61`). The loop takes the rings that nothing remaining contains as `outer`, removes them, then takes the next layer as `inner`, then `outer` again (`:63-94`). Depth parity decides the role. Geometry only: nothing checks whether rings cross.
5. **No overlap check.** Two overlapping rectangles become two overlapping outers (also noted in `3-merge-areas.md:12`).
6. **Survivor.** If multipolygons are selected, the oldest one survives (`utilOldestID`, `:96-101`). The others' tags are merged into it and they are removed (`:106-111`). Otherwise a new relation `{type: multipolygon}` gets the `newRelationId` (`:103`).
7. **Tags.** Outer closed ways give their tags to the relation, except `osmWayOnlyTags` (`natural=coastline` only, `tags.ts:138-142`), which stay on the way (`:113-130`). Inner closed ways keep all tags (test "merges no tags from inner ways"). Member ways of an existing multipolygon never give up tags. The relation loses `area` (`:132-135`). `mergeTags` (`abstract-entity.ts:99-124`) keeps equal values and joins different ones with `;`.
8. **Disabled.** `not_eligible` if any entity is not a closed way or multipolygon, or there are fewer than two (`merge_polygon.ts:141-144`). `incomplete_relation` if a multipolygon has a member missing from the graph (`:145-147`). With no multipolygon selected: `not_eligible` if the ways already are exactly the members of one shared multipolygon (`:149-164`). With multipolygons selected: `not_eligible` if a closed way is already a member of one of them (`:165-170`).
9. **Result and selection.** One `perform`, one annotation "Merged {n} features." (`merge.js:42`, `:89-91`; `core.yaml:319-321`), then `validate()` (`:44`). Selection is the selected ids that still exist, and if there are several, only those with interesting tags (`merge.js:46-53`). The relation is new and not selected, so the selection lands on the tagged inner way, not on the building (inferred from the code).

There is no iD operation test for merge in this checkout: `test/spec/operations/` has only circularize, delete, extract and straighten.

## 2. Differences in Rapid 3

Rapid has the same chain (`MergeOperation.ts:115-144`), the same reasons and the same roles. The differences:

| Aspect | iD | Rapid | Maid today |
| --- | --- | --- | --- |
| Survivor | oldest id (`merge_polygon.ts:100`) | first selected (`:148`) | oldest existing, else first (`merge_polygon.ts:148-163`) |
| Way-only tags on outer ways (`natural=coastline`) | stay on the way (`:122-128`) | all removed (`:167-168`) | all removed (`:174-175`) |
| Inner ways | keep tags | keep tags | keep tags |
| `mergeTags` of different values | joined with `;` (`abstract-entity.ts:110-115`) | `building` special case (`OsmEntity.ts:319`) | same as Rapid (`OsmEntity.ts:359-369`) |
| Selection after | interesting selected ids (`merge.js:46-53`) | same (`MergeOperation.ts:52-58`) | not an operation yet |

The `building` special case is Rapid's, not iD's. With `building=house` and `building=shed` on the two outers, the rule keeps `house` and drops `shed` without a trace (inferred from the code: it neither joins nor flags). iD joins them: `house;shed`. This affects join and merge too, see open question 7.

## 3. Maid today

- **`packages/model/src/actions/merge_polygon.ts`** (239 lines): the Rapid port with iD's survivor rule. Reasons match iD (`:198-235`). Tests: `packages/model/test/actions/merge_polygon.test.js` (18 `it`, the Rapid set, including four disable cases) and `packages/model/test/id/actions/merge_polygon.test.ts` (iD's survivor test, and one `it.todo` for coastline, F-actions-b-4 in `docs/research/id-tests/actions-b.md`). No operation uses it (`0-maid-today.md:14`, `:183`).
- **`packages/operations/src/operations.ts`**: `MERGE_REASONS` (`:190-198`), `mergePlan` (`:204-216`) accepts only selections where every entity is a way of geometry `line`, `mergeOperation` (`:219-236`). Two closed untagged rings therefore reach join and get "These lines do not share an end node." (inferred, not run). Tagged closed areas get no core Merge; in maid and bicycle they get none at all, and in parking only the union applies (section 3, module-shapes below).
- **`packages/module-shapes/src/merge/operation.ts`** (`mergeAreasOperation`, id `merge-areas`, key C): applies to exactly two closed ways of geometry `area` (`:26-33`). `mergePlan` (`merge.ts:108`, `planOutline` `:130`) refuses `contained` (no contact between outlines, `:198`) and `not_touching` (no overlap and no shared edge, `:197`). Registered only by `mergeAreas()` in `apps/maid-parking/src/maid.config.ts:90`.
- **Shell.** The edit menu lists every applying operation (`packages/shell/src/commands.ts:118`). Each operation with a shortcut is bound to its key (`useShortcuts.ts:171-176`), and `engine.runOperation` returns unless `applies` is true and `disabled` is undefined (`engine.ts:869-872`). A disabled C does nothing.
- **Doc to correct.** `3-merge-areas.md:11` says iD shows "Merge (multipolygon)". iD's label is "Merge" (`core.yaml:316`).

## 4. Spec for Maid

### 4.1 What changes where

**`packages/model`**
- Keep `actionMergePolygon(ids, newRelationId?)`. Add `getCreatedRelationID()`, as split has `getCreatedWayIDs()` (`split.ts:335`), so the operation can select the relation.
- New pure helper in `src/geo/`: `ringConflict(a, b)` returns `'crossing'`, `'shared_edge'` or `undefined` for two outlines given as lon/lat rings. Crossing: a proper crossing of two segments (interior to both). Shared edge: collinear overlap of positive length, or two consecutive nodes in common. A single shared node or a single touching point is no conflict. Compute in a local planar frame (longitude scaled by the cosine of the mean latitude).
- Way-only tags: `osmWayOnlyTags = { natural: { coastline: true } }` (iD's list), used by the polygon action. This closes F-actions-b-4.

**`packages/operations`**
- `mergeOperation` uses iD's chain. Candidates: `join` (for lines, including closed untagged ways) and `polygon`. Take the first candidate that is not disabled; otherwise the first whose reason is not `not_eligible`; otherwise `join`.
- `applies`: at least two selected, all resolvable, and either every entity is a way of geometry `line`, or every entity is a closed way or a multipolygon relation. Anything else (points, a line with an area) is not applicable, as today.
- `run`: a polygon result has annotation "Merged {n} features.", the join result keeps "Merged {n} lines.". Select: the new or surviving relation for the polygon, unchanged for join.
- `types.ts`: optional `supersedes?: readonly string[]` on `Operation`: the ids this operation hides when it applies. A helper `visibleOperations(list, context)` drops superseded ones. The shell uses it at `commands.ts:118` and `useShortcuts.ts:48`. The hotkey is already safe through the `applies` and `disabled` guard in `runOperation`, so the helper is for the menu.

**`packages/module-shapes`**
- `mergeAreasOperation.applies` = `selectedAreas` and the union plan is not refused as `contained` or `not_touching`. Add `supersedes: ['merge']`.
- Remove the sentences for `contained` and `not_touching` (not reachable from the menu any more). Update `operation.test.ts:172` and `:190`.

### 4.2 Disabled reasons (polygon chain)

Checked in this order: `incomplete_relation`, `not_closed`, `already_multipolygon`, `already_member`, `crossing`, `shared_edge`. The first two and the two `already_*` reasons are iD's, in iD's order.

| Code | When | Sentence |
| --- | --- | --- |
| `not_eligible` | fallback, not applicable through `applies` | These features can't be merged. |
| `incomplete_relation` | a selected multipolygon has a member missing from the graph | These features can't be merged because at least one hasn't been fully downloaded. |
| `not_closed` | a joined ring of a multipolygon is open (Maid-specific guard, check in the port) | These features can't be merged because a multipolygon's outline is not closed. |
| `already_multipolygon` | no multipolygon selected, and the closed ways are exactly the members of one multipolygon | These areas already make up one multipolygon. |
| `already_member` | a closed way is already a member of a selected multipolygon | One of these ways is already in a selected multipolygon. |
| `crossing` | outlines of two different inputs cross | These areas overlap, so they can't become one multipolygon. |
| `shared_edge` | outlines of two different inputs share a stretch of way | These areas share an edge, so they can't become one multipolygon. |

Not refused, as iD: nested at any depth, apart (two outers), touching at one node.

Join keeps its reasons: `not_adjacent` ("These lines do not share an end node.") and the rest in `MERGE_REASONS`.

### 4.3 Roles, members, tags, ids

- **Roles.** iD's depth-parity algorithm, unchanged. Existing roles of a selected multipolygon are discarded and recomputed. Members are listed level by level, in input order.
- **Survivor.** The oldest existing selected multipolygon (`utilSurvivorID`, falls back to the first), as today. No multipolygon selected: the new relation with the id from `getCreatedRelationID()`. It starts with `type=multipolygon`.
- **Tags.** Outer closed ways give their tags to the relation, except way-only tags (`natural=coastline` stays on the way). Outer ways end up untagged members. Inner ways keep all their tags. `area` is removed from the relation. Non-survivor multipolygons are removed after their tags are merged.
- **Conflicting tags.** Follow iD: different values are joined with `;`. This needs the `building` rule fixed in the shared `mergeTags` (open question 7). Until then the polygon action should not rely on it.
- **Ids and geometry.** No node moves, no way is deleted, no way changes id.
- **Undo.** One `actions` entry, one annotation: one undo step restores both ways (and removes the relation).
- **Selection afterwards.** The relation (survivor or new). This departs from iD, which selects the tagged inner way (open question 5).

### 4.4 The menu with the union (parking app)

| Selection | Merge in the menu | Enabled |
| --- | --- | --- |
| Two open lines, joinable | join (as today) | yes |
| Two closed untagged rings, not crossing | polygon | yes |
| Two areas, nested or apart | polygon (union does not apply) | yes |
| Two areas, overlapping or sharing an edge, union accepts the tags | union (polygon hidden by `supersedes`) | yes |
| Same pair, union refuses (tags, tagged nodes, relations) | union, with its sentence (polygon hidden) | no |
| Maid and bicycle apps, same overlapping pair | polygon | no: "These areas overlap, ..." or "... share an edge, ..." |
| Area and line, point and area, multipolygon and point | no Merge | n/a |

Exactly one Merge is shown for each selection. The hotkey C runs through `runOperation`, which only runs an applicable and enabled operation. Nothing runs twice.

## 5. Tests

### 5.1 Ported from iD and Rapid (already in Maid unless marked)

| iD test (`test/spec/actions/merge_polygon.js`) | Maid |
| --- | --- |
| creates a multipolygon from two closed ways | `model/test/actions/merge_polygon.test.js`, same name, ported |
| creates a multipolygon from a closed way and a multipolygon relation | same name, ported |
| creates a multipolygon from two multipolygon relations and keeps the oldest alive | `model/test/id/actions/merge_polygon.test.ts`, ported (numeric ids) |
| merges multipolygon tags | ported |
| merges tags from closed outer ways | ported |
| merges no tags from unclosed outer ways | ported |
| merges no tags from inner ways | ported |
| doesn't copy area tags from ways | ported |
| creates a multipolygon with two disjunct outer rings | ported |
| creates a multipolygon with an island in a hole | ported |
| extends a multipolygon with multi-way rings | ported |
| preserves coastline tag on the outer ways when creating a multipolygon | **todo**, implement (4.1) |

Rapid's four disable tests (`test/unit/actions/merge_polygon.test.js:253-294`) are ported too. Maid's Rapid file has 18 `it`, matching Rapid's 18.

### 5.2 New unit cases

In `packages/model`, a new file next to the adopted tests (say `test/maid/merge_polygon.test.ts`):

- Two squares that overlap partly: `crossing`.
- Two squares sharing the edge x = 5: `shared_edge`.
- Two ways with the same nodes: `shared_edge`.
- Two squares touching at one corner node: allowed, both outer.
- Three levels, A contains B contains C: A outer, B inner, C outer.
- Existing multipolygon with outer A, plus a new closed way B inside A: B inner, the relation keeps its id and tags.
- Existing multipolygon, plus a new closed way outside it: outer.
- Coastline on an outer way stays on the way (the iD test above).
- New relation: `getCreatedRelationID()` is set, the relation exists, `type=multipolygon`.
- Building: outer `building=yes`, inner `area=yes`: relation `building=yes`, outer untagged, inner keeps `area=yes`.
- Conflicting `building=house` and `building=shed` on the outers: relation `house;shed`. Expected to fail today by reading the code (see open question 7).
- A selected multipolygon with a missing member: `incomplete_relation`.
- A closed way selected together with a multipolygon it already belongs to: `already_member`.

In `packages/operations/src/operations.test.ts`, next to the merge tests (`:170-200`):

- Two closed untagged rings: applies. Overlapping: disabled with the `crossing` sentence.
- Two nested tagged areas: applies, not disabled, one action, annotation "Merged 2 features.", select is the relation.
- Area and point: not applicable.
- `visibleOperations` drops the core Merge when the union applies.
- Every polygon reason has a sentence (no `FALLBACK`).
- Two open lines: unchanged (`:183-200`).

In `packages/module-shapes`: the union applies to overlap and shared edge, not to nested or apart; `operation.test.ts:172` and `:190` are updated.

### 5.3 Browser check (new, `tools/bench/merge-polygon-check.ts`, fixtures only)

Added to `CHECKS` in `tools/checks/check-all.ts` for maid, bicycle and parking. Real keys and clicks, data and map compared after each step.

1. Area tool (key 3) on open ground: four corners, closed. Tags sheet: `building=yes`. Expect: the way has `building=yes`.
2. Area tool (key 3) inside the outer, not touching it. Expect: the way has `area=yes` only.
3. Shift-click both. Expect: two selected.
4. Edit menu: one Merge, enabled, tooltip "Merge these features.".
5. Press C. Expect one relation with `type=multipolygon` and `building=yes`; the outer way has role `outer` and no tags; the inner way has role `inner` and keeps `area=yes` (open question 1); selection is the relation; annotation "Merged 2 features.".
6. Undo once. Expect both ways back with their tags and no relation. Redo once. Expect the relation again.
7. Overlap (maid app): a third area crossing the outer, select both, C does nothing, the menu shows Merge disabled with "These areas overlap, ...".
8. Parking app only: the existing `merge-check` still passes, and the menu shows one Merge.

Output: one `ok <check>` per step, exit 1 on any failure. Count to be set from the first run.

## 6. Open questions

1. **Tags of the inner way.** iD keeps them, and a hole drawn with key 3 carries `area=yes` (`renderer/src/draw.ts:243`), so the hole stays an area after the merge. The union design writes holes untagged (`3-merge-areas.md:29`). Proposed: follow iD now. Alternative: drop the drawing default `area=yes` from the inner way.
2. **Refusals beyond iD.** Overlap and shared edge are refused, where iD makes invalid outers. The OSM rule against crossing outers is from memory, not checked (no network use here). Whether outers may share a stretch of way is unverified; proposed: refuse.
3. **Apart areas.** iD makes a multipolygon with two outers. A 2013 maintainer was sceptical (`3-merge-areas.md:14`). Proposed: allow, as iD.
4. **Touching at a node.** Proposed: allowed. A ring touching another at one point and crossing it elsewhere: treat as crossing. A pure crossing at a shared node is not handled in the first step.
5. **Selection afterwards.** Proposed: the relation. iD selects the tagged inner way.
6. **How one Merge is chosen.** Proposed: `supersedes` on the operation and `visibleOperations`. Alternative: registration order, which would need the union registered before the defaults and would move its menu position.
7. **`building` in `mergeTags`.** Rapid's rule drops the second value silently (`OsmEntity.ts:359-369`) and iD joins. This touches join and merge too. Proposed: a separate step, with the test above first.
8. **Mixed selections.** iD shows Merge disabled for point plus area ("These features can't be merged."). Maid hides it. Proposed: keep hidden.

## 7. Not done here

- No code, test or check was written (one-file rule for this pass). A step in `docs/build-out/steps.md` is still needed. Proposed title: "Merge: a multipolygon from closed areas, with a hole".
- `3-merge-areas.md:11` wording to correct (see section 3).
- No test was run; every statement about the current code is from reading it.
