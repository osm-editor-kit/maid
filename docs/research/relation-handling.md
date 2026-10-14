# Relation handling: what iD does, what people ask for, and what Maid can do next

Status: research pass, 2026-10-14. Sources are GitHub reads (iD issues and PRs, the branches and code of k-yle/iD) and Maid's code, read only. Nothing was run in a browser, no test was run and no OSM host was contacted.

The row-by-row sidebar comparison is in [relations-vs-id.md](relations-vs-id.md). This note does not repeat it.

Markers: **Read** means seen in a source (issue text, PR text, code). **Inferred** means my conclusion from what I read.

## 1. Summary

- iD handles the basics well: a member list with roles, add and remove, order kept on most splits, multipolygon areas, member download, and route labels with network and ref.
- iD checks very little. It has no member count checks, no boundary gap checks, no turn restriction checks, and no route gap check on the map.
- People ask most for: keeping relations in the picker after panning away (#3622), a bulk member download (#5420), clearer IDs and membership (#9349, #10184, #10501), route order and gaps (#7498, #6096, #11374), and warnings for broken boundaries and turn restrictions (#8286, #9346).
- Kyle's fork holds the biggest missing piece: a schema-based validator for member counts, roles, geometry and duplicates. Its upstream parts are still open.
- Maid already has most of the sidebar. Its gaps are the validator rules and the map side. Its schema reading needs id-tagging-schema 7.x relation data to do anything (see section 3).

## Method

- **Issues.** About 540 unique issues came up across 13 search terms (relation, membership, member, role, route, multipolygon, turn restriction, route_master, public transport, stop_area, superroute, boundary, relation editor). Read: the top ones by comments and reactions. Read in full or truncated: 18 issue bodies. Comments read: PR 11588 and PR 8707 only.
- **PRs.** Read PR 11701 in full: description, reviews and comments. Searched 8 terms in PR titles: 91 unique PRs, read as titles and state, except those named below. Read the state of the k-yle stack, PRs 12988 to 12994.
- **Kyle's fork.** Listed 11 branches. Compared each with openstreetmap/iD develop. Read the file list of the default branch (kyle-deploy, 120 changed files) and the code of its relation validator, its replace-members action and its sequence operation.
- **Maid.** Read relations-logic.ts, relations-sections.tsx, relations.tsx, missing-role.ts, the presets relation module, the renderer's multipolygon and route code, and the existing relations-vs-id.md.
- **Not done.** No browser, no tests, no demo. The Maid "Maid today" column is from reading code, not from running it.

## 2. Ideas to improve relation handling

Each idea has: what it is, why people want it, size (small, medium or large), and what Maid has today.

### Rendering on the map

- **Show route gaps on the map.** Gaps are shown only in the sidebar.
  - Why: the review of PR 11701 asks for the map to show gap endpoints and where member directions collide. Issue 659 (show route membership with a shadow) is open and old.
  - Size: medium.
  - Maid today: a selected relation's members get a calm highlight (`related`). Gap markers exist only in the sidebar (`routeGaps` in relations-logic.ts). No marker on the map.
- **Show the direction of route members on the map.** PR 11701 adds connection arrows and forward/backward icons to the list.
  - Size: medium.
  - Maid today: not seen on the map. Not checked in the list.
- **Tell direct from indirect members when a relation is highlighted.** Issue 10108 (14 comments, no reactions), about a way that breaks a route inside a superrelation.
  - Size: small to medium.
  - Maid today: unchecked.
- **Fill of incomplete multipolygons on the wrong side.** Issue 1201 (16 comments, bug, open).
  - Size: medium to large. Needs a test with incomplete multipolygons.
  - Maid today: the model builds the multipolygon (`multipolygon()` in OsmRelation.ts). Not checked for this bug.

### Relation and membership sections

- **Keep relations in the picker for the whole session.** Issue 3622 (12 comments, 4 reactions): the picker drops a relation once it is off screen. PR 11588 (Kyle, open, closes 3622) keeps relations added in the current session.
  - Size: small.
  - Maid today: the picker shows relations on screen, connected ones first (relations-logic.ts `sortNearbyFirst`, `connectedRelationIds`). I did not see session memory.
- **Bulk download of all members.** Issue 5420 (reopened, 6 reactions) asks for a button for complete member downloads. Issue 6656 (7 comments) asks for background download.
  - Size: small for a button. Background download is not recommended (see section 4).
  - Maid today: each missing member has a load button, and the headline gives the count of members not loaded (`loadButtonLabel`, `membersHeadline`). A bulk button for the whole relation is not seen.
- **Show IDs and say which relation holds a feature.** Issue 9349 (12 comments, 2 reactions): show relation and member IDs. Issue 10184 (13 comments, bug): the picker does not show the relation's ID. Issue 10501 (9 comments): mark the relations that already contain the selected feature.
  - Size: small.
  - Maid today: the memberships list shows label, ID and role (existing note, row 9). The picker's IDs and any "already contains" mark were not seen in the code.
- **Gap left behind when dragging a member.** Issue 6096 (2 reactions). Also issue 6097: drag a member from first to last place.
  - Size: medium.
  - Maid today: move-up and move-down buttons, each one undo step (`moveTarget`). No drag.
- **Route members in stop-first order.** Issue 7498 (6 comments): bus routes should list stops first.
  - Size: medium to large. It needs a rule per route type (see section 4).
  - Maid today: when a member is added, stops and platforms go first (existing note, row 15). The existing list is not sorted.
- **Copy relations with a copied feature.** Issue 9359 (reopened, 10 comments, 3 reactions): copying a stop should also copy its relations.
  - Size: medium.
  - Maid today: `clipboard.ts` copies relations with new members, as iD does. Whether a pasted stop joins the route's relations was not checked.
- **Relation colour in lists.** iD merged PR 9424 (colour of route relations in lists and comboboxes).
  - Size: small.
  - Maid today: `relationLabel` has no colour. The relations sections do not use a colour (grep found none). The existing note, row 7, says the same.
- **Several selected features in one step.** Issue 2152 (3 comments, 3 reactions): add all selected features to one relation. PR 11701 adds "merge onto a relation" and "remove from a relation" for a multi-selection. PR 11949 (open, 6 comments, 5 reviews) shows applied and partly applied relations for a multi-selection. Issue 9198: a multi-selection does not show all memberships.
  - Size: medium.
  - Maid today: multi-selection exists (multi-selection.md). `joinableRelations` in relations-logic.ts is the start of this.

### Form fields and presets

- **Role suggestions.** Done in Maid (`roleSuggestions`).
- **Translated role labels.** Done in Maid. The header of relation.ts names PR 12768 as ported.
- **Pick the role automatically when there is only one choice.** PR 12993 (part 5, +11 lines, open).
  - Size: small.
  - Maid today: not seen. Needs the relation roles of the schema (section 3).
- **Turn restriction editor.** iD merged several fixes: 10731, 10800, 9633, 11431.
  - Size: unknown.
  - Maid today: the model has a restriction module with tests. The editor UI was not compared.

### Validation

- **Member count, role, geometry and "role not allowed" checks from the schema.** Kyle's fork (commit a9b0a9ba6, modules/validations/relation.js, 460 lines, 12 test blocks). Covers too few and too many members per role, wrong role, invalid geometry and role not allowed. The fixes are: remove the member, change the role, change the tags.
  - Size: medium. Large if the 7.x schema data lands at the same time.
  - Maid today: the presets read the schema's `min` and `max` per member rule (types.ts `RelationMemberRule`). No rule reads them. The existing validators are listed in packages/validation/src/rules; the only relation rule is `missing_role`.
- **Duplicate member check.** PR 12994 (part 6a, +191 lines, open).
  - Size: small to medium.
  - Maid today: `allowDuplicateMembers` is read (presets.ts, around line 1080, `relationAllowsDuplicateMembers`). No validator uses it.
- **Missing role on boundaries.** PR 12990 (part 2, open). Issue 9127 (reopened, 5 comments): a boundary member with no role.
  - Size: small.
  - Maid today: `missing_role` checks multipolygons only (`relation.isMultipolygon()`).
- **Boundary no longer closed, extra segments.** Issue 8286 (6 comments, 3 reactions). A data user says boundaries break every day and iD gives no warning.
  - Size: medium.
  - Maid today: no check.
- **Route continuity after an edit.** Issue 11374 (5 comments, bug): extending a way in a relation breaks its continuity without a warning.
  - Size: medium.
  - Maid today: the gaps are in the sidebar only.
- **Turn restriction broken by an edit.** Issue 9346 (5 comments, 3 reactions).
  - Size: medium to large.
  - Maid today: not checked.
- **Member cap from the server.** Issue 8960: the API will reject relations above a cap that is read from the capabilities endpoint.
  - Size: small to medium.
  - Maid today: `osm-api-limits.ts` checks way nodes against a cap (default 2000). No relation member check.
- **Self-referencing relation.** Issue 7983 (1 comment). Size small. Maid: not seen.
- **Intersecting multipolygon ways.** Issue 7766 (4 comments). Size medium. Maid: not seen.

### Operations

- **Split keeps route order.** Done in Maid (structure tests). iD fixed this with PR 10149 (merged).
- **Split against the travel direction.** Maid puts the new part after the old one (existing note, row 22, F-relations-3). Size medium.
- **Merge refuses conflicting relations.** Done in Maid (operations.ts message `conflicting_relations`). iD's PR 8675 is merged.
- **Reverse with forward and backward roles.** The existing note says it is equal to iD (row 25). I did not re-check the code.
- **Reorder by drag.** See the list section above.
- **Create a route.** No source asks for a route-creation operation, only issue 6465 (toolbar button to add members, 1 reaction) and issue 6551 (closed, ribbon UI). Maid offers "New relation" in the picker (`newRelationActions`, relations-logic.ts line 217, used at relations-sections.tsx line 623). The existing note, row 19, says "not offered". The code says otherwise, so that note is out of date.

### Anything else

- **Stop numbering.** Kyle's fork has a `sequence` operation that writes a tag (default `ref`) on the selected features in order. It is not a relation feature. It could number the stops of a route. Size small. See section 6.

## 3. Sure improvements

Ranked by how clearly right they are and how little they need.

### Done in Maid: the whole k-yle stack (2026-10-14)

All seven parts are ported, with tests: tag patterns and the relation roles in the presets (12988, 12768: `relationRoles`, `memberRoles`, `allowsDuplicateMembers`), role labels, role suggestions, disabled relations in "Add to a relation" and the role picked when only one fits in the relation sections (12768, 12991, 12992, 12993), `missing_role` from the schema with "Set as …" and "Remove from relation" fixes (12990), and the new rule `relation_members` for duplicate members (12994). The bundled id-tagging-schema 6.19.2 has no member schemas, so only the multipolygon fallback shows now (outer and inner, now with fixes); the rest starts to work with 7.3.0.

The items below that name these parts are therefore done; they stay listed for the record.

### The five I rate highest

1. **Member rules in a validator** (min and max, wrong role, invalid geometry, role not allowed).
   - Source: Kyle's commit a9b0a9ba6 (validator and 12 test blocks). Upstream parts 12991 to 12994 are open.
   - Maid already has: the schema reading and the `min` and `max` values. The fix helpers exist (`fixes.ts`).
   - Needs: id-tagging-schema 7.x relation data. The header of types.ts says the bundled 6.x data has no `relation` key at all. The presets package declares `^6.11.0`, and you said Maid ships 6.19.2. Inferred: with 6.x data the schema code has nothing to read.
   - Size: medium.
2. **Missing role on boundaries** (PR 12990, part 2).
   - Needs: the boundary roles. Whether they come from the schema or are fixed in code was not checked.
   - Size: small.
3. **Duplicate member check** (PR 12994, part 6a).
   - Maid already has: `allowDuplicateMembers`.
   - Size: small to medium.
4. **Pick the role when there is only one choice** (PR 12993, part 5, +11 lines).
   - Needs: the relation roles, which come from the schema (see item 1).
   - Size: small.
5. **Member cap from the server** (issue 8960).
   - Needs: the cap in the mock API's capabilities response (a fixture or a constant, as the way-node cap is). Never a live call.
   - Size: small to medium.

Close to sure but not in the top five: keep relations in the picker for the session (issue 3622, PR 11588, 8 reviews, approval not seen). Size small.

## 4. To think about

Decided by Tobias on 2026-10-14:

- **IDs in the picker:** on hover only (a real tooltip, not a native `title`).
- **Relations of the session:** relations that got a member in this session stay at the top of the picker, also when they are off screen (as Kyle's PR for issue 3622).
- **Route on the map:** when a route is selected, the map shows gap ends and the direction of its members; nothing changes otherwise.
- **Reordering members:** the move buttons stay, and members can also be dragged, with motion's `Reorder` (already installed). Each move, by button or by drag, is one undo step.
- Still open: warnings for broken boundaries and turn restrictions, which routes get the gap check, adding several features at once, and loading all missing members.

Each item has one open question and the options. Map effects are for mappers, not only for the code.

1. **Route member order.** Question: should Maid show the route's members in a fixed order (stops first) or leave the order as the mapper set it?
   - (a) Leave as is, which is today's behaviour. No change for mappers.
   - (b) Group the list into stops and ways. The data order stays the same, and the list is easier to read.
   - (c) Sort the data. This changes the members of many routes at once, which is risky. Issue 7498 and the wiki pages cited in issue 8578 say order matters for route ways.
2. **How much the map shows about a relation.** Question: should the map show gaps, member direction and direct versus indirect members?
   - (a) Sidebar only, which is today's behaviour.
   - (b) Show gap ends and member direction on the map when a route is selected.
   - (c) A lens with an on/off switch, as Maid does for parking. Mappers who do not want it can ignore it. Option (b) adds clutter for newcomers.
3. **Warnings for boundaries and turn restrictions.** Question: warn only, or warn and offer a fix?
   - (a) Warn with no fix, as `missing_role` does today.
   - (b) Warn, and offer a fix only where one is clearly right.
   - (c) Off by default with a switch. Warnings that are wrong annoy mappers. Data users of boundaries (issue 8286) want the warning.
4. **Background download of members** (issue 6656). Question: may Maid load the rest of a relation without a click?
   - (a) Only the button, as today.
   - (b) Load when a relation is opened, in live mode only, at editing zoom and not cached. AGENTS.md allows live reads only as a manual mode.
   - (c) Background loading for every relation. This sends traffic to OSM infrastructure and breaks the core rules. Not recommended.
5. **Reordering members.** Question: how should a mapper move a member in a long route?
   - (a) Keep the move buttons. Safe for newcomers, slow for long routes.
   - (b) Add drag with a gap marker where the member was (issue 6096).
   - (c) Both.
6. **Several features at once.** Question: how should a mapper add many features to one relation?
   - (a) A section in the multi-selection that shows applied and partly applied relations (PR 11949).
   - (b) An action bar with "add to relation" and "remove from relation" (issue 11066 asks for one).
   - (c) Keep the one-at-a-time flow. Simplest, slow for building a bus route's stops.
7. **IDs in the picker.** Question: how should relations be told apart when names repeat?
   - (a) Show the ID in small text on every row.
   - (b) Show the ID on hover only.
   - (c) Show the ID only when two names are the same, as iD did in PR 10942 (merged). Experts want IDs always. Newcomers are confused by long lists.
8. **Route validation scope.** Question: which relations should get the continuity and turn restriction checks?
   - (a) `type=route` with way members only.
   - (b) Also `route_master` and superroute relations.
   - (c) Only when a member is removed or an end is detached, to cut noise. Option (b) gives many more warnings on large networks.

## 5. Issues to look into

One line each: number, short title, why it matters. Counts are comments and reactions as found.

- 3622: Keep relations in the membership picker for the session. The most asked picker fix (12 comments). PR 11588 is open.
- 5420: Complete member download, reopened. Bulk download for incomplete relations (6 reactions).
- 6656: Download all members in the background. Would send traffic, so it conflicts with the core rules (7 comments).
- 8960: API change that rejects relations above a member cap. Editors must read the cap.
- 8286: Boundaries broken without warning. Data users fix them by hand (6 comments, 3 reactions).
- 9346: No warning when an edit breaks a turn restriction (5 comments, 3 reactions).
- 9127: Empty role on boundary members, reopened. Partly covered by PR 12990.
- 7498: Route member order, stops first (6 comments).
- 6096: No gap marker when dragging a member (2 reactions).
- 659: Show route membership as a shadow on the map. Open since 2012 (5 comments).
- 10108: Direct and indirect members in a superrelation highlight (14 comments).
- 10184: Picker shows no relation ID, so a broken multipolygon cannot be fixed (13 comments, bug).
- 10501: Picker does not mark the relations that already contain the feature (9 comments).
- 9349: Show relation and member IDs (12 comments).
- 1201: Fill of incomplete multipolygons renders on the wrong side (16 comments, bug).
- 7766: Intersecting multipolygon ways are not detected (4 comments).
- 11374: Extending a way in a relation breaks continuity with no warning (5 comments, bug).
- 9359: Copying a feature should also copy its relations (10 comments, reopened).
- 2152: Add several selected features to one relation (3 reactions). PR 11701 covers part of it.
- 8578: Splitting ways damages member order (closed as completed in 2025, 23 comments). PR 10149 is merged. I did not confirm that PR closed this issue.
- 8415: Route relations broken by iD edits (closed in 2024, 14 comments). The same class of problem as 8578.
- 8707: PR, not an issue. Closed unmerged in 2022: route ref in the name. See section 6.

## 6. What Kyle's fork does

Source: k-yle/iD. The default branch is kyle-deploy, which the demo runs. Described from the code, not from the demo. Branch comparisons are against openstreetmap/iD develop.

- **kyle-deploy (default branch).** 28 commits ahead of upstream, 155 behind at the time of the check, 120 files changed. Relation-related:
  - Commit a9b0a9ba6, "create the relation validator": modules/validations/relation.js (460 lines) and test/spec/validations/relation.js (295 lines, 12 test blocks found by grep). Upstream state: no PR of its own (the commit says "iD#00000"). Its parts are in the open stack 12988 to 12994.
  - modules/actions/replace_relation_members.js (12 lines): replaces a relation's members. A code search for a caller found none. Unchecked.
  - The validator uses `actionDeleteMember` for its "remove from relation" fix. Size of the validator: about 750 lines with tests.
  - Not relation-related: divide (iD#9020), sequence (a tag-numbering operation), slice (iD#9334), osmChange import (iD#10407), traffic sign preview, lanes validator (iD#9883), locator overlay (iD#9931), expressway rendering, custom features filter, field icons (iD#10254), NSI presets, plugins, CI deploy, and others. The divide code has no relation handling.
- **route-ref.** 2 commits, 5 files. Shows the ref in the name of route relations, and fixes the network name shown twice. Not in kyle-deploy. Upstream PR 8707 was closed unmerged in 2022. The comments show the name-versus-ref question was not settled. Later upstream route label PRs by others (10478, 11052) were merged; I did not compare their code. Size small.
- **validator-oneway-onelane.** 3 commits, 4 files. Validator for `lanes=1` with `oneway=no`. Not relation-related.
- **divide.** 1 commit, 19 files. The divide operation (iD#9020). Not relation-related.
- **kh/import-osmChange.** 1 commit. osmChange import (iD#10407). Not relation-related.
- **9398-drawing-lost.** 1 commit. Keyboard shortcuts that lose work. Not relation-related.
- **disable-locator-overlay.** 1 commit. Not relation-related.
- **preset-field-icons.** 1 commit. Field icons (iD#10254). Not relation-related.
- **openseamap-overlay.** 1 commit. Not relation-related.
- **plugin-sdk and gh-pages.** No common ancestor with develop. Not compared. Not relation-related by name.

Notes:
- The stacked PRs 12988 to 12994 are upstream and open. Their head branches (kh/rel0 to kh/rel6a) are not in the fork's branch list, so I did not compare them.
- PR 11701 is by tyrasd, not by Kyle.

## Read and inferred, in short

- **Read:** issue and PR texts listed above, the fork's commits and files, the code of the validator and the two small actions, the states of the stacked PRs, Maid's relation code and presets, and the existing sidebar note.
- **Inferred:** that Maid's schema code needs 7.x data to do anything (from the comment in types.ts, not run); that the picker lacks IDs and "already contains" marks (from reading only); and the ranking of the sure improvements.
- **Not checked:** the Maid code for PRs 12990, 12992, 12993 and 12994; the copy and paste of relations in Maid; the turn restriction editor; the reverse operation's code; the caller of `replace_relation_members`.
