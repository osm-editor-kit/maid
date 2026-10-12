# Relations: Maid against iD

Status: first pass (step one). Compared at iD commit `0194f3926` (the pinned reference). Maid's side read from the code in `apps/maid/src/modules/relations*`, `packages/model/src/actions/*` and `packages/model/src/data/OsmRelation.ts`. Nothing was seen in a browser.

Rows marked **unchecked** were not verified in iD's source in this pass (the UI sections `raw_member_editor.js` and `raw_membership_editor.js` were not read). Their iD column is what the brief describes, and must be checked before a row is acted on.

Size: S = under an hour, M = a few hours, L = needs a new API or a renderer change.

## Summary

| Result | Rows |
| --- | --- |
| Rows in the table | 30 |
| Equal to iD on the cases tested | 15 |
| Behind iD | 13 |
| Not compared (iD side unchecked) | 2 |
| Ahead of iD, built | 0 (six proposals in the next section) |

Scenarios tested in this pass: 31 in `packages/model/test/id/relations/*.test.ts` (member-order 18, structure 9, restriction 4). 26 pass, 5 are parked as `it.todo` with the feature id in a comment. The logic tests in `apps/maid/src/modules/relations-logic.test.ts` were not changed in this pass.

| Feature id | What fails in the model | Data |
| --- | --- | --- |
| F-relations-1 | Adding a way moves a member that is not loaded behind the ways after it | route `[w1 a-b, wM (not loaded), w3 c-d]`, add `w2 b-c`: result `[w1, w3, wM]` (the `wM` entry was between `w1` and `w3`) |
| F-relations-2 | Adding a way regroups the members by type (nodes, then ways, then relations), so a sub-relation moves to the end | route `[w1, R (subarea), w3]`, add `w2`: result `[w1, w2, w3, R]` |
| F-relations-3 | Splitting a member way that runs against the route's travel direction puts the new part after the old one (same class as F-actions-b-36) | route `[ed, dcba, az]`, split `dcba` at `c`: result `[ed, cba, dc, az]`, expected `[ed, dc, cba, az]` |
| F-actions-b-31 | A closed roundabout in a route is not refused (iD: `simple_roundabout`) | parked in `structure.test.ts` |
| F-actions-b-35 | The `intersection` role of `destination_sign` is not `via` | parked in `restriction.test.ts` |

F-actions-b-36 (five iD split tests with the new way in the wrong place) is not re-run here; F-relations-3 is a new data point for it.

## Table

| # | Area | Topic | iD | Maid today | Tests in Maid (file) | Gap | Size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Loading | Relation with members not loaded | Loads the relation, members are missing from the graph; `isComplete` is false (`relation.js`) | Same: `isComplete` in `OsmRelation.ts`; a missing member is shown as `not loaded` text in the Members list | `member-order.test.ts` (missing members) | Equal in data; the UI does not say how many are missing | S |
| 2 | Loading | Fetch missing members of a relation | `loadEntityRelations` / `/relation/#id/full` (`services/osm.js`, **unchecked**) | Not implemented. The mock API already serves `/api/0.6/relation/ID/full` (`tools/mock-osm-api/server.ts`, `full()`) | none | Behind: no button, no request | L (step two) |
| 3 | Loading | Count of members not loaded | (**unchecked**) | Not shown; the list shows rows marked `not loaded` | `relations-logic.test.ts` (new cases, see section 3) | Behind | S |
| 4 | Loading | Members loaded after the relation (late load) | Parent relations follow when members arrive (`core/tree.js`, F-core-3) | Spatial index: not confirmed; tests parked | `core/tree.test.ts` (4 + 10 todos, not adopted in this pass) | Unknown | M |
| 5 | Display | Members list in order, with index | Ordered list (**unchecked**) | Ordered, but the index is not shown | `relations-logic.test.ts` | Behind (no index) | S |
| 6 | Display | Label of a member | Name, else preset name (**unchecked**) | `memberLabel`: name, else first main tag as `key=value` | `relations-logic.test.ts` `memberLabel` (1 test) | Equal in idea; no preset names | S |
| 7 | Display | Label of a relation | Name / preset name (**unchecked**) | `relationLabel`: name, ref with type, type, "Relation" | `relations-logic.test.ts` `relationLabel` (5 tests) | Equal | S |
| 8 | Display | Limit of shown members | Limit with a count (**unchecked**) | 50 shown, "and N more" | none | Equal in idea; no test | S |
| 9 | Display | Memberships list (which relations this is in) | Listed with role (**unchecked**) | Listed with label, id, role; folded, count in headline | `relations-logic.test.ts` `membershipsOf` (4 tests) | Equal | S |
| 10 | Display | Memberships of an entity in one relation twice | Two entries (**unchecked**) | Two entries | `relations-logic.test.ts` (1 test) | Equal | S |
| 11 | Display | Sorting of relations for "add to a relation" | Sorted by type and nearness, recently used first (**unchecked**) | Sorted by label, then id; capped at 200 | `relations-logic.test.ts` `joinableRelations` (1 test) | Behind: no nearness, no recent | M |
| 12 | Map | Highlight members of a selected relation | Members get the `related` class (`modes/select.js`, **unchecked**) | None | none | Behind; step two | L |
| 13 | Map | Highlight members on hover of a relation row | `behavior/hover.js` (**unchecked**) | None | none | Behind; step two | L |
| 14 | Map | Multipolygon rendering | Area from outer and inner rings (`multipolygon.js`) | `multipolygon()` in `OsmRelation.ts`, renderer draws areas | `packages/model/test/lib/multipolygon.test.js` (13 of 13 adopted in `osm.md`) | Equal in model; renderer not checked here | S |
| 15 | Editing | Add a way to a route at a sensible position | `actionAddMember` with `osmJoinWays` (`add_member.js`, 8 tests) | Same algorithm (`add_member.ts`), placed between neighbours, PTv2 stops and platforms first | `member-order.test.ts` (10 scenarios, 8 pass, 2 parked as F-relations-1, -2) | Behind on F-relations-1 and -2 | M |
| 16 | Editing | Reorder a member | `actionMoveMember` in the UI by drag (**unchecked**) | Model action exists (`move_member.ts`), no UI | `member-order.test.ts` (2 tests) | Behind: no UI | S |
| 17 | Editing | Role edit with suggestions | Combo with roles from taginfo and other members (**unchecked**) | Free text per row, no suggestions | `actionChangeMember` in `member-order.test.ts` (1 test) | Behind | S |
| 18 | Editing | Remove a member | `actionDeleteMember`, deletes the relation when it becomes empty | Same. The UI deletes the relation when its last member goes | `member-order.test.ts` (2 tests) | Equal; see "better" 4 below | S |
| 19 | Editing | Add to a new relation | "New relation" in memberships (**unchecked**) | Not offered | none | Behind | M |
| 20 | Editing | Delete a relation | `actionDeleteRelation` (`delete_relation.js`, 10 tests) | Same action | `actions-a.md` row (10 of 10) | Equal | S |
| 21 | Structure | Split a member way keeps the route's order (forward) | `split.js` | Same | `structure.test.ts` (2 tests, pass) | Equal | S |
| 22 | Structure | Split against the travel direction | `split.js` route tests (**5 todo in iD's order, F-actions-b-36**) | New part placed after the old one | `structure.test.ts` (1 todo, F-relations-3) | Behind | M |
| 23 | Structure | Split out-and-back | `split.js` out-and-back | Pair order kept, both directions | `structure.test.ts` (1 test, pass) | Equal on this case | S |
| 24 | Structure | Join two member ways | `join.js`, survivor is oldest (**unchecked**) | Same survivor rule; replaced members keep their place; duplicate with same role dropped | `structure.test.ts` (2 tests, pass) | Equal here | S |
| 25 | Structure | Reverse a way: forward and backward roles | `reverse.js` | Same | `structure.test.ts` (2 tests, pass) | Equal | S |
| 26 | Structure | Delete a member way | `delete_way.js` removes it from parents | Same | `member-order.test.ts` (1 test, pass) | Equal | S |
| 27 | Structure | Merge of multipolygons | `merge_polygon.js` (F-actions-b-3, -4 in `actions-b.md`) | Keeps the first relation, not the oldest | `actions-b.md` rows | Behind | M |
| 28 | Structure | Split of a restriction's from way | `split.js` restriction titles (14 adopted) | Keeps the part at the via node or via way | `restriction.test.ts` (2 tests, pass) | Equal | S |
| 29 | Structure | Split of a via way | `split.js` | Both parts get role `via`; order of via ways is not checked (not semantic) | `restriction.test.ts` (1 test, pass) | Equal | S |
| 30 | Validation | Missing role, outdated multipolygon tags | `missing_role.js`, `outdated_tags.js` (**unchecked**) | Not checked in this pass | none | Unknown | M |

## Where Maid can be better than iD

Proposals, to judge. Not all are built.

1. **Show the gaps in a route's chain.** Between two consecutive way members that do not share a node, show a `gap` marker with both ways' end nodes. iD shows nothing. Pure logic: `relations-logic.ts` (`routeGaps`), to build in this step.
2. **Show the role's meaning.** A role input with suggestions from the roles this relation uses and from a built-in table per type (multipolygon: outer, inner; route: forward, backward, stop, platform; restriction: from, via, to; boundary: outer, inner, admin_centre, label). Built in this step (pure logic, `relations-logic.ts`).
3. **Warn before an edit that breaks a relation, instead of silently changing it.** Examples: removing the last member deletes the relation (iD does this without a word); joining two ways that are members of a restriction. Not built. Needs a decision on the UI pattern.
4. **Keep the member order visible.** A route diagram as a vertical list of member chains, with the gap markers of (1). Not built.
5. **"Load the missing members" as one button with a count.** Step two.
6. **Say where a new way was put.** "Placed between X and Y" after an add. Built in this step if the logic is clean; see section 3.

## Specification for step two

(a) **Highlight engine API.** In `packages/renderer` add an engine method `setRelationHighlight(state)` where `state` is `{ kind: 'members'; relationID: EntityID } | { kind: 'memberships'; entityID: EntityID } | null`. The renderer resolves the member ids (from the model's `members`) and draws them with a `related` paint class. Hover sends the state from the Members list row or the Relations row; select sends it for the selected relation. The state lives in the engine, not in React state, so the map does not re-render the sidebar. Imperative MapLibre calls stay inside the renderer package, as AGENTS.md allows.

(b) **Load a relation in full.** Endpoint: `GET {apiUrl}/api/0.6/relation/{id}/full` (the same `apiUrl` the engine uses for `map.json`, `engine.ts` near line 284). Mock: the mock API already answers `/api/0.6/relation/ID/full` from its fixtures (`tools/mock-osm-api/server.ts`, `full()`), so automated tests stay on localhost. Merge: the response is OSM JSON, merged with `this.merge(json.elements)` in `engine.ts` (line 309), the same path as map tiles, so the members enter the base graph and the relation's `isComplete` becomes true. UI: the Members headline shows "N of M members loaded" and one "Load missing members" button (disabled while loading, shows a spinner text "Loading 12 members"). On failure, an inline message "Could not load the members: <status>" with a retry button; the relation's rows stay as they are. Nothing is written to the history: loading is not an edit.

(c) **Tests for step two.** A browser check (`bun run check-relations`) with the mock API: select an incomplete relation, load its members, see the count drop to zero; a failing relation id shows the message.

## Unsure points

- iD UI sections (members list, memberships, roles, suggestions, sorting, limit) were not read in this pass. The iD column for those rows is unchecked.
- `docs/research/id-tests/core.md` (F-core-3) was not updated: the tree tests in `packages/model/test/id/core/tree.test.ts` were not adopted in this pass.
- The renderer's multipolygon drawing and the `related` highlight were not read.
- Nothing was run in a browser.
