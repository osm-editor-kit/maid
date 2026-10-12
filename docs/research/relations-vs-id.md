# Relations: Maid against iD

Status: second pass. The first pass compared the model (step one, iD commit `0194f3926`, the pinned reference). This pass is the inspector side: the Members and Relations sections of the sidebar, built against iD's two UI sections, `modules/ui/sections/raw_member_editor.js` and `raw_membership_editor.js` (read in this pass). Maid's side is read from `apps/maid/src/modules/relations*`, `packages/model/src/actions/*` and `packages/model/src/data/OsmRelation.ts`. Nothing was seen in a browser.

Rows marked **unchecked** were not verified in iD's source. In this pass only `modes/select.js` (row 12) and the validation rules (row 30) are still unchecked.

Size: S = under an hour, M = a few hours, L = needs a new API or a renderer change.

## Summary

| Result | Rows |
| --- | --- |
| Rows in the table | 30 |
| Equal to iD on the cases tested | 15 |
| Behind iD | 7 |
| Ahead of iD, built (iD has no such thing) | 3 (rows 3, 5, 8) |
| Partly built | 4 (rows 12, 13, 17, 30; the iD side of 12 and 30 is still unchecked) |
| Not compared (iD side unchecked) | 1 (row 4) |

The counts were updated on 2026-10-13 for the map side (b4208b4) and later commits (0cddca7, 52a3502, e9e688c, d8193a8): rows 27 and 30 changed, rows 12 and 13 are partly built. Each bucket is counted from the Gap column of the table.

Tests in this pass:

- `apps/maid/src/modules/relations-logic.test.ts`: 39 tests, all pass. 14 were there before and are unchanged; 25 are new: `memberRows` (2), `membersHeadline` (2), `moveTarget` (1), moving members on the order that `actionMoveMember` gives (2), `routeJoins` and `routeGaps` (7), `roleSuggestions` (3), `placementOf` and `placementSentence` (5), `membershipHint` (3).
- Scenarios in the model from the first pass: 31 in `packages/model/test/id/relations/*.test.ts` (26 pass, 5 are parked as `it.todo` with the feature id in a comment). Not re-run here.
- The Members list cap ("Show all N"), the move buttons, the role datalist and the gap line are components. They have no unit tests and were not seen in a browser.

| Feature id | What fails in the model | Data |
| --- | --- | --- |
| F-relations-1 | Adding a way moves a member that is not loaded behind the ways after it | route `[w1 a-b, wM (not loaded), w3 c-d]`, add `w2 b-c`: result `[w1, w3, wM]` (the `wM` entry was between `w1` and `w3`)
| F-relations-2 | Adding a way regroups the members by type (nodes, then ways, then relations), so a sub-relation moves to the end | route `[w1, R (subarea), w3]`, add `w2`: result `[w1, w2, w3, R]`
| F-relations-3 | Splitting a member way that runs against the route's travel direction puts the new part after the old one (same class as F-actions-b-36) | route `[ed, dcba, az]`, split `dcba` at `c`: result `[ed, cba, dc, az]`, expected `[ed, dc, cba, az]`

Built now as well (in `packages/model`, see the README's "What is different from Rapid"): F-actions-b-11 (join keeps the parent memberships of a collapsed multipolygon), F-actions-b-34 (a split area replaces itself in its other parent relations, iD#12024) and F-actions-b-35 / F-osm-7 (the `intersection` role of a destination sign counts as via). Their parked tests are real tests now. F-actions-b-33 (line-only tags on a split area) and F-actions-b-36 (dual carriageway) are still todo.

Status of these three (built now, in `packages/model`): F-relations-1 and -2 are fixed in `add_member.ts`, a change beyond iD (iD has the same join code, read, not run); their parked tests are real tests in `member-order.test.ts`. F-relations-3 is fixed in `add_member.ts` (the pair order of an insert pair), with its test in `structure.test.ts`, the same change as F-actions-b-36.
| F-actions-b-31 | A closed roundabout in a route is not refused (iD: `simple_roundabout`) | parked in `structure.test.ts` |
| F-actions-b-35 | The `intersection` role of `destination_sign` is not `via` | built now: adopted in `restriction.test.ts`, `relation.test.ts` and `split.test.ts` (F-osm-7 in `osm.md`) |

F-actions-b-36 (five iD split tests with the new way in the wrong place) is not re-run here; F-relations-3 is a new data point for it. Built now: three of the five iD tests are real tests (`split.test.ts`); the two dual-carriageway tests stay todo, because the pair order there comes from the join's direction through the parallel ways, not from the neighbours as in iD's `splitWayMember`.

Under F-relations-1 and F-relations-2 the "Added as member N of M" line (row 15, item 6 below) reports the position that the model gives. The line says nothing where the model moved other members too (see `placementOf`).

## Table

| # | Area | Topic | iD | Maid today | Tests in Maid (file) | Gap | Size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Loading | Relation with members not loaded | Loads the relation, members are missing from the graph; `isComplete` is false (`relation.js`) | Same: `isComplete` in `OsmRelation.ts`; a missing member has its own row, marked "not loaded", with its id | `member-order.test.ts` (missing members); `relations-logic.test.ts` `memberRows` (2) | Equal in data | S |
| 2 | Loading | Fetch missing members of a relation | Per row: a download button on each member that is not loaded, `context.loadEntity` of that member (`raw_member_editor.js`, `member-download`). Also `loadEntityRelations` / `/relation/#id/full` (`services/osm.js`, **unchecked**) | Not implemented. A "Load the N missing members" button is shown disabled with the tooltip "Coming with the map side". The mock API already serves `/api/0.6/relation/ID/full` (`tools/mock-osm-api/server.ts`, `full()`) | none | Built: one request per click (`engine.loadRelation`, `/relation/ID/full.json`), "Loading N members" while it runs, a failure line with Retry, a line when the API does not return the rest. Per-member download (iD's row 2 button) not built | M |
| 3 | Loading | Count of members not loaded | No count: the Members label is the member count, `>1000` over the cap (`raw_member_editor.js`) | Headline "40 members, 12 not loaded" (`membersHeadline`) | `relations-logic.test.ts` `membersHeadline` (2) | Ahead: iD does not count | S |
| 4 | Loading | Members loaded after the relation (late load) | Parent relations follow when members arrive (`core/tree.js`, F-core-3) | Spatial index: not confirmed; tests parked | `core/tree.test.ts` (4 + 10 todos, not adopted in this pass) | Not compared | M |
| 5 | Display | Members list in order, with index | Ordered list of label and role. No index is shown (`raw_member_editor.js`) | Ordered, with the 1-based index in front of each row | `relations-logic.test.ts` `memberRows` (index, twice) | Ahead: iD shows no index | S |
| 6 | Display | Label of a member | Preset name (NSI parent preset, with its icon) and the display name (`raw_member_editor.js`, verified) | `memberLabel`: name, else first main tag as `key=value`. No preset names | `relations-logic.test.ts` `memberLabel` (1 test) | Behind: no preset names (`packages/presets` could supply them) | M |
| 7 | Display | Label of a relation | Preset name, then the name, with the relation's colour (`raw_membership_editor.js` `baseDisplayLabel`, verified) | `relationLabel`: name, ref with type, type, "Relation" | `relations-logic.test.ts` `relationLabel` (5 tests) | Behind: no preset name | S |
| 8 | Display | Limit of shown members | Hard cap at 1000 with `>` in the headline; members past the cap cannot be reached (`_maxMembers`, `raw_member_editor.js`) | First 50, then "Show all N" (shows every member) | none (UI) | Ahead: nothing is hidden for good. Not tested | S |
| 9 | Display | Memberships list (which relations this is in) | Listed with role; one entry per membership for one selected entity; capped at 1000 (`raw_membership_editor.js`) | Listed with label, id, role; folded, count in headline. No cap | `relations-logic.test.ts` `membershipsOf` (4 tests) | Equal | S |
| 10 | Display | Memberships of an entity in one relation twice | Two entries for a single selection (`getMemberships`, verified) | Two entries | `relations-logic.test.ts` `membershipsOf` (1 test) | Equal | S |
| 11 | Display | Sorting of relations for "add to a relation" | The membership list sorts by label (numeric collation), then id, newly added last. The picker shows relations on screen, connected ones first, then the newest id (`fetchNearbyRelations`, verified) | Sorted by label, then id; capped at 200. No nearness, no connected-first, no recent | `relations-logic.test.ts` `joinableRelations` (1 test) | Behind: no nearness, no connected-first, no newest-first | M |
| 12 | Map | Highlight members of a selected relation | Built: a selected relation's members get the `related` state (a calm halo, `engine.setRelated`, selection in `setSelected`). iD gives members of a selected relation a yellow `selected-member` class (`modes/select.js`, `20_map.css`, verified); Maid uses its own calmer halo instead | `relations-check.ts` (select, deselect, setRelated) | Partly: halo, not iD's yellow outline; only the loaded members are marked; nested relations one level | M |
| 13 | Map | Highlight on hover of a relation row | Hover on a member row highlights its feature; hover on a membership row highlights the relation and its members, all levels deep (`utilHighlightEntities`, verified; `highlighted` class, blue) | Built: a member row sets `related` on its feature, a relation row on the relation and its members (one level down). Map hover of a feature does not highlight its relations, as in iD (`hover.js` sets `.hover` only, verified) | `relations-check.ts` (setRelated) | Partly: calmer halo, not iD's blue highlight; one level, not all levels | M |
| 14 | Map | Multipolygon rendering | Area from outer and inner rings (`multipolygon.js`) | `multipolygon()` in `OsmRelation.ts`, renderer draws areas | `packages/model/test/lib/multipolygon.test.js` (13 of 13 adopted in `osm.md`) | Equal in model; renderer not checked here | S |
| 15 | Editing | Add a way to a route at a sensible position | `actionAddMember` with `osmJoinWays` (`add_member.js`, 8 tests) | Same algorithm (`add_member.ts`), placed between neighbours, PTv2 stops and platforms first. The line under the form says where it went (item 6) | `member-order.test.ts` (10 scenarios, 8 pass, 2 parked as F-relations-1, -2); `relations-logic.test.ts` `placementOf` (3) | Behind on F-relations-1 and -2 | M |
| 16 | Editing | Reorder a member | Drag in the list, from 5 px, one `actionMoveMember` on drop (`raw_member_editor.js`, verified) | Move up and move down buttons on each row, each one undo step, disabled at the ends and when the feature is read-only. No drag | `member-order.test.ts` (2 tests); `relations-logic.test.ts` `moveTarget` (1), moving members (2) | Equal in effect; buttons instead of drag (buttons work with the keyboard) | S |
| 17 | Editing | Role edit with suggestions | Combo from taginfo (network), filtered by the relation type and the member's geometry, prefix matches first (`raw_member_editor.js`, `raw_membership_editor.js`, verified) | Native datalist: roles the relation's members already use (most frequent first), then the built-in roles of its type. No network, no taginfo ranking, no geometry filter | `relations-logic.test.ts` `roleSuggestions` (3) | Partly: offline by design; no ranking by taginfo's usage counts | S |
| 18 | Editing | Remove a member | `actionDeleteMember`, leaves browse mode when the relation goes (`raw_member_editor.js`) | Same action. The UI deselects when the relation goes. Disabled when the feature is read-only | `member-order.test.ts` (2 tests) | Equal; see "better" 3 below | S |
| 19 | Editing | Add to a new relation | "New relation" is the first entry of the picker: creates the relation with the member and selects it (`raw_membership_editor.js`, verified) | Not offered | none | Behind | M |
| 20 | Editing | Delete a relation | `actionDeleteRelation` (`delete_relation.js`, 10 tests) | Same action | `actions-a.md` row (10 of 10) | Equal | S |
| 21 | Structure | Split a member way keeps the route's order (forward) | `split.js` | Same | `structure.test.ts` (2 tests, pass) | Equal | S |
| 22 | Structure | Split against the travel direction | `split.js` route tests (**5 todo in iD's order, F-actions-b-36**) | New part placed after the old one | `structure.test.ts` (1 todo, F-relations-3) | Behind | M |
| 23 | Structure | Split out-and-back | `split.js` out-and-back | Pair order kept, both directions | `structure.test.ts` (1 test, pass) | Equal on this case | S |
| 24 | Structure | Join two member ways | `join.js`, survivor is the oldest | Same survivor rule; replaced members keep their place; duplicate with same role dropped | `structure.test.ts` (2 tests, pass) | Equal here | S |
| 25 | Structure | Reverse a way: forward and backward roles | `reverse.js` | Same | `structure.test.ts` (2 tests, pass) | Equal | S |
| 26 | Structure | Delete a member way | `delete_way.js` removes it from parents | Same | `member-order.test.ts` (1 test, pass) | Equal | S |
| 27 | Structure | Merge of multipolygons | `merge_polygon.js` (F-actions-b-3, -4 in `actions-b.md`) | Keeps the oldest relation (built, F-actions-b-3) | `actions-b.md` rows | Equal (built, F-actions-b-3) | M |
| 28 | Structure | Split of a restriction's from way | `split.js` restriction titles (14 adopted) | Keeps the part at the via node or via way | `restriction.test.ts` (2 tests, pass) | Equal | S |
| 29 | Structure | Split of a via way | `split.js` | Both parts get role `via`; order of via ways is not checked (not semantic) | `restriction.test.ts` (1 test, pass) | Equal | S |
| 30 | Validation | Missing role, outdated multipolygon tags | `missing_role.js`, `outdated_tags.js` (**unchecked**) | Not checked in this pass | none | Partly built: `missing_role` (d8193a8); `outdated_tags` is todo (F-validations-24, 25) | M |

## Where Maid can be better than iD

Proposals, to judge. Status after this pass.

1. **Show the gaps in a route's chain.** Built. Between two consecutive way members of a `type=route` that do not share a node (or, for a closed way such as a roundabout, any node), the list shows a "gap" line. A member that is not loaded is "unknown", not a gap. Stops, platforms and node members are skipped. `routeGaps` and `routeJoins` in `relations-logic.ts`, 7 tests. iD shows nothing.
2. **Show the role's meaning.** Partly built. Role suggestions come from the roles the relation's members already use, then a built-in table per relation type (multipolygon, boundary, route with PTv2 variants, restriction, site, associatedStreet). `roleSuggestions`, 3 tests. No taginfo, so no usage counts.
3. **Warn before an edit that breaks a relation, instead of silently changing it.** Partly built, information only: "Deleting this way breaks the turn restriction" for the only `from` or `to` way of a restriction, and "Deleting this way removes an outer ring of the multipolygon" for an `outer` way (`membershipHint`, 3 tests). Not built: removing the last member deletes the relation without a word (iD does the same); joining two ways that are members of a restriction.
4. **Keep the member order visible.** Not built: a route diagram as a vertical list of chains.
5. **"Load the missing members" as one button with a count.** Partly built: the count is in the headline and on a disabled button. Loading is step two.
6. **Say where a new way was put.** Built. After an add: "Added as member 7 of 12, between A and B" (or "at the start" or "at the end"). `placementOf` (finds the one insertion that turns the old members into the new ones; undefined when the add also moved other members) and `placementSentence`, 5 tests.

## Specification for step two

(a) **Highlight engine API.** In `packages/renderer` add an engine method `setRelationHighlight(state)` where `state` is `{ kind: 'members'; relationID: EntityID } | { kind: 'memberships'; entityID: EntityID } | null`. The renderer resolves the member ids (from the model's `members`) and draws them with a `related` paint class. Hover sends the state from the Members list row or the Relations row; select sends it for the selected relation. The state lives in the engine, not in React state, so the map does not re-render the sidebar. Imperative MapLibre calls stay inside the renderer package, as AGENTS.md allows. Hover is iD's behaviour (row 13): a member row highlights its feature, a membership row its relation. Zoom to a member (iD's `member-zoom`, which also selects it if it is off screen) and select a member are the map side too. The list's `select` prop is already wired for the select half.

(b) **Load a relation in full.** Endpoint: `GET {apiUrl}/api/0.6/relation/{id}/full` (the same `apiUrl` the engine uses for `map.json`, `engine.ts` near line 284). Mock: the mock API already answers `/api/0.6/relation/ID/full` from its fixtures (`tools/mock-osm-api/server.ts`, `full()`), so automated tests stay on localhost. Merge: the response is OSM JSON, merged with `this.merge(json.elements)` in `engine.ts` (line 309), the same path as map tiles, so the members enter the base graph and the relation's `isComplete` becomes true. UI: the disabled "Load the N missing members" button in `MemberList` (`relations.tsx`) becomes live, shows "Loading N members" while it runs, and on failure an inline message "Could not load the members: <status>" with a retry button; the relation's rows stay as they are. Nothing is written to the history: loading is not an edit. iD loads one member per row instead (row 2); a per-row button is an option if a whole relation is too big.

(c) **Tests for step two.** A browser check (`bun run check-relations`) with the mock API: select an incomplete relation, load its members, see the count drop to zero; a failing relation id shows the message.

## Unsure points

- The iD sections (members list, memberships, roles, suggestions, sorting, picker, limit) were read in this pass: `raw_member_editor.js` and `raw_membership_editor.js`. Not read: `modes/select.js` (row 12) and the validation sources (row 30). Row 2's "per-row download" was read in the source; whether iD hides the download on complete relations (CSS) was not checked.
- Nothing was run in a browser. The datalist role suggestions, the move buttons, the "Show all" button and the gap line are untested in the real app.
- The move buttons replace iD's drag. Keyboard focus is lost after a move when the row's key changes (the key holds the index, id and role, which change); the role field needs that key to reset its draft.
- The role inputs and the remove button of the Relations section and the add form are disabled when the feature is read-only. Before this pass they were not, so a filter-protected way could be edited through its membership.
- `roleSuggestions(relation)` takes no graph: the suggestions come from the relation alone.
- F-relations-1 and F-relations-2 show in the "Added as" line as the model places the way. Where the model moves other members, the line is left out.
- `docs/research/id-tests/core.md` (F-core-3) was not updated: the tree tests in `packages/model/test/id/core/tree.test.ts` were not adopted in this pass.

## Step two: what was built (map side)

- **Related features** (engine + layers). A third feature state, `related`, drawn as a halo at 0.25 opacity, under hover (0.4) and selection (0.7). `engine.setRelated(ids | null)` replaces the set the inspector asked for; the members of a selected relation are related too, computed in `setSelected`. Only feature state changes, no rebuild. Ids that are not loaded yet get the state when they arrive. Unit tests: `packages/renderer/src/related.test.ts`.
- **Zoom** (engine + inspector). `engine.fitTo(ids)` moves the map to the bounds of the loaded geometry (a relation counts as its members, one level). A single point is not zoomed past OSM zoom 18. A zoom button per loaded member row, and "Zoom to the relation" above the list.
- **Load in full** (engine + inspector). `engine.loadRelation(id)` sends one request to `apiUrl` on a click, merges through the usual path, and shares one request between two concurrent calls. The mock answers `/api/0.6/relation/ID/full.json` (`server.ts`, `server.test.ts`): each element once, member relations one level.
- **Map hover.** iD does not highlight a feature's relations on map hover (`hover.js` adds `.hover` only). Maid does the same: the map hover is left alone.

### Still behind iD

- iD's selected-member yellow outline for members of a selected relation (Maid uses its own halo).
- iD's blue `highlighted` on hover goes through all levels of nested relations; Maid goes one level.
- Per-member download button (iD row 2): Maid loads the whole relation only.
- Parent way of a selected vertex is `related` in iD (`select.js`, `_focusedParentWayId`); Maid does not do that yet.
- The API does not return members that are missing from the fixture: the load reports them as not in the API.

