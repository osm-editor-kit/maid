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

### Done in the first run of sure improvements (2026-10-14)

- Kyle's member rules as subtypes of `relation_members`: too few and too many members of a role, wrong role, needs different tags, wrong geometry, role not allowed (11 of his 12 test blocks; his schema cross-reference does not exist in Maid's presets). A member without a role is reported once, by `missing_role`, whose fixes leave out a role whose maximum is reached.
- The relation member cap of the OSM API (32000) in `osm_api_limits`.
- Relations that got a member in this session stay at the top of "Add to a relation"; ids show on hover in the memberships list, and in the picker (native options) only when two relations have the same name.
- Members can be dragged to a new place (motion `Reorder`, one undo step per drop); the move buttons stay.

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
- **Broken boundaries and turn restrictions:** warn, and offer a fix only where it is clearly right (for example removing a member).
- **Which issues are checked:** as iD's issue options (my edits or everything, what is visible or everywhere), with better guidance: issues that do not come from the person's own edits are shown quieter and folded, and the person can make them regular (or quiet again) at that element.
- **Several features at once:** both, a section in the multi-selection with the relations all or some of the features are in, and "add to relation" / "remove from relation" in the action bar, using the same logic.
- **Loading missing members:** iD's rules for when members load, adapted to Maid's interface.

Decided by Tobias on 2026-10-15:

- **Schema data:** id-tagging-schema 7 now (7.2.0, the newest the 5-day rule allows), 7.3.0 as soon as it may be installed (16 October, 20:00 UTC). See [id-tagging-schema-7.md](id-tagging-schema-7.md).
- **Route member order:** the list shows stops and ways as two groups, each in data order. The data is not sorted.
- **Issue scope and route gaps:** as designed in [issue-scope-ux.md](issue-scope-ux.md): checked on selection in the background, issues in data the person did not edit folded and quiet until the person acts on one, a "…" setting (quiet, this session, always), no URL. A route gap the person's edit made is a normal warning; one that was there before is quiet.
- **Paste with relations** (iD issue 9359): after a paste, the relations section offers the original's relations ("Also add", with the role), one click and one undo step each. Nothing happens unasked.
- **Relation colour** (iD PR 9424): yes, as iD, but with care for the layout. iD's lists have too little room for too many long texts; Maid's lists must stay calm and readable in its own (Tailwind-like) style.
- **Multipolygons:** all three: crossing rings (iD issue 7766) as a warning that marks the place, the fill of incomplete multipolygons (iD issue 1201: check first whether Maid has the bug), and a relation that is its own member (iD issue 7983) with a "Remove" fix.
- **Superrelations** (iD issue 10108): direct members strong, members of sub-routes lighter; hovering a sub-route in the list makes only it strong. Possibly with MapLibre labels along the lines, in the route's colour, so the sub-routes can be told apart on the map.
- **Rerouting a route onto other ways:** research in section 7.

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

## 7. Rerouting a route onto other ways (research, 2026-10-15)

Status: research pass, 2026-10-15. Web pages and GitHub issues were read through a browser-like fetch. The wiki and forum statements below come from page summaries, not verbatim text. No OSM API, Overpass or other OSM host was called. Maid's code and the iD reference checkout were read only. No code was changed and no test was run.

Markers: **Read** means seen in a source or in code. **Inferred** means my conclusion. **Not checked** means I did not look.

### The problem

- A route often runs on a road's centre line while a separate cycleway or sidewalk runs beside it. The route should use the side way.
- The two are split at different points, so the members do not line up one to one. The route cannot turn off where the side way has no node at the junction. Mappers then split or connect by hand and reorder members, which is error prone.

### What other tools do

- **osm-relatify (Zaczero, AGPL-3.0).** Read: README. Bus and tram only, and only `public_transport:version=2`. No reroute, no via points, no splitting rules in the README. Read: forum thread. Users report unnecessary way splits, duplicate ways and one damaged PTv1 route. Forum users say it reads its data from Overpass; the README does not say. Inferred: its code cannot be copied into Maid (ISC) because of the AGPL.
- **JOSM PT_Assistant routing helper.** Read: wiki. The mapper picks the next way at each junction from numbered, coloured options. Coloured options are split as needed. The current way is not split and must be split by hand. Keys include backtrack, skip, and a "fast-forward" that uses other route relations to bridge a gap. It downloads ways with an Overpass query. The page was last edited in 2018, and its examples are bus routes. Maid must not copy the Overpass part (core rule 1).
- **JOSM relation editor sort.** Read: JOSM ticket 20634 (open, status "new"). For incomplete routes the sort leaves segments "in quasi-random order", and their directions can differ. One commenter called sorting incomplete relations "too dangerous".
- **iD issue 1575, "route editing mode" (open, label "bluesky").** Read: the issue. It asks for almost what Tobias proposes: click a way to add it, click a member to remove it, and optionally split roads automatically. A 2013 comment (viesturz) proposed control points, shortest-path routing between them, automatic splitting, forward and backward roles, and stop ordering. In 2026 Dimitar5555 called it a stretch for iD and suggested a specialised editor such as Relatify.
- **iD issue 12363, "mark the route relation being edited" (open).** Read: search snippet of the issue. Its comments describe iD's F key as a way to add the next segment. Read: `.reference/id/data/core.yaml`. The F key is iD's draw "follow" mode, which continues a line from its last two nodes. It is a drawing aid, not a route feature.
- **iD issues on splits damaging route members** (8415, 8578, 4876, 4864). Read: titles and first comments in search results, not in full. A split can scramble member order. Loops and stops are the worst cases. Issue 8415 proposes that a way which mends a gap goes into the right place, not at the end.
- **Rapid.** Not found. Read: a grep of `.reference/rapid/modules` for routing and shortest-path terms gives no hits. A web search found no route tool either.
- **Waymarked Trails, "Analyse relation" view.** Read: forum summaries. It is a checker, not an editor. It draws each segment of a relation. Dashed lines are virtual connections, red dots are open ends, and many dashed lines suggest unsorted members. Inferred: a useful model for a Maid check view.
- **Level0.** Read: wiki. It lists "edit relations" as supported. No route-member documentation was found. Not a useful model.
- **cycle.travel.** Read: wiki and site summaries. A planner on OSRM, not an editor. The app is proprietary according to the wiki. Not a useful model for member rewriting.
- **BRouter (MIT, Java).** Read: GitHub README. It runs as a Java server or an Android app. It routes on its own rd5 segment files built from OSM extracts. Inferred: it needs a server, and its data is not the loaded data. That conflicts with the loaded-data rule. Not for v1.
- **OSRM.** Read: cycle.travel summary. A routing server, not a browser library. Same objection as BRouter.

Mapper views that matter for the design (Read: forum threads and the wiki):

- Some mappers say member order matters for elevation profiles and some data users. Others say ordering adds little for walking and cycling routes. Simon Poole says correct ordering is impossible in general because routes lack the data for it. Inferred: keep the mapper's order and never auto-sort.
- The wiki says forward and backward roles apply where a route must follow a way in one direction. The wiki says they should not be used on PTv2 routes. Alternatives are disputed: Simon Poole calls the wiki contradictory on them. Peter Elderson says the roles are mainly used for bicycle routes.
- The wiki's "Order matters" section says splitting ways can leave members unordered. Continuity breaks show as red points in JOSM's member list.

### What Maid has today

- **Route gaps.** Read: `routeJoins` and `routeGaps` in `packages/shell/src/modules/relations-logic.ts` (around lines 404-426). For each pair of consecutive way members of a `type=route` relation, the result is connected, gap, or unknown. Unknown means a way is not loaded. Stops and platforms are skipped.
- **Routing code.** Read: no shortest-path, Dijkstra, A*, router or priority-queue code in `packages`, `apps` or `tools`. Not checked: any vendored library.
- **Closest graph walk.** Read: `routingIslandOf` in `packages/validation/src/rules/disconnected-way.ts`. It is a flood fill over shared nodes of routable ways, ported from iD (ISC). It is a template for the graph walk.
- **Graph access.** Read: `packages/model/src/lib/Graph.ts`. `parentWays(entity)`, `parentRelations(entity)`, `childNodes(way)`, `hasEntity`. Read: `packages/model/src/data/OsmWay.ts`. `first()`, `last()`, `isClosed()`, `isOneWay()`, `contains()`, `isDegenerate()`.
- **Relation members.** Read: `packages/model/src/data/OsmRelation.ts`. `addMember`, `removeMember`, `moveMember`, `replaceMember`, `memberByRole`, `memberById`.
- **Split of a route member.** Read: `packages/model/src/actions/split.ts` (around lines 200-290). For a route (not a turn restriction, not an area), the new way goes in the same relations beside the old one, with the same role. It is inserted as a pair, through a temporary way, by `actionAddMember`.
- **Join during member insert.** Read: `packages/model/src/actions/add_member.ts` (around lines 37-120). For a way member, the loaded ways are joined and reordered by `osmJoinWays`. The code comments say only loaded ways take part. Inferred: a reroute should write its members directly and must not go through this join.
- **Connect and join actions.** Read: `packages/model/src/actions/connect.ts` (`actionConnect(nodeIDs)`) and `join.ts` exist.
- **Reverse.** Read: `packages/model/src/actions/reverse.ts` swaps forward and backward roles (around lines 60-82).
- **One undo step.** Read: `packages/model/src/edit/EditHistory.ts`. `perform(...actions)` runs the actions in order on the staging graph (line 298). `commit()` makes one history step (line 345).
- **Map modes are closed.** Read: `packages/renderer/src/engine.ts` line 144. `Mode` is a fixed union of `browse`, `add-point`, `draw-line`, `draw-area`, `move` and `rotate`. A module cannot add a mode.
- **Extension points.** Read: `packages/ui/src/extension-points.ts` gives `inspector.section`, `dock.view`, `inspector.field` and `topbar.panel`. Read: `packages/renderer/src/extension-points.ts` gives `map.layer`, `map.content`, `edit.operation` and `imagery.used`. An `edit.operation` has `applies`, `disabled` and `run` (`packages/operations/src/types.ts`, line 44).
- **Turn restrictions.** Read: `packages/module-turn-restrictions` finds junctions with `isJunction` (three or more road arms) and builds the turns with `osmIntersection` (`packages/model/src/lib/intersection.ts`, line 104). The same data could later respect restrictions in a route.
- **Loading.** Read: `packages/renderer/src/tile-loader.ts`. Map tiles come from `/api/0.6/map.json?bbox=` for the view, at the app's `minDataZoom`. `loadRelation` fetches `relation/ID/full.json` (around lines 193-226). A way outside the loaded tiles is not in the graph.
- **Mock API.** Read: `tools/mock-osm-api/server.ts` line 277 serves `/api/0.6/map` from the fixtures.
- **Fixture sizes.** Read: `fixtures/small.meta.json`: 12,196 nodes, 1,914 ways, 67 relations (Lichtenrade). `fixtures/dense.meta.json`: 119,678 nodes, 20,896 ways, 289 relations (Neukölln).
- **Speed baseline.** Read: `tools/bench/budget.json`, small scene, median of the 2026-10-14 baseline run: load-settled 620 ms, hover latency 8.4 ms, select via API 35 ms.
- **Apps and modules.** Read: `apps/maid-bicycle/src/maid.config.ts` is a list of modules, presets and filters for the shared shell. Non-test lines: `module-turn-restrictions` 1,266, `module-parking` 4,978.

### Proposed interaction in Maid

- **Entry.** A "Reroute" action on a selected `type=route` relation. Inferred: put it in a new inspector section next to "Members", or as an `edit.operation`. No new map mode in v1. The section keeps the state.
- **Hint.** "Pick the start and the end. The route follows the roads and paths between them on the loaded map."
- **Picking the via points.**
  - Option (a): click a node or way on the map. Not checked: whether `map.content` gets clicks. The closed `Mode` union suggests a renderer change.
  - Option (b): an `edit.operation` "Use as route start" or "Use as route end" for the selected node or way. Inferred: cheap, needs no click mode, and can be tested without a browser.
  - Recommendation: (b) for v1, then (a) with a small hook when the renderer is open anyway.
- **Two via points first.** Each extra via point is a new leg. Leave that to v2.
- **Preview.** Recomputed after each change of a via point. It shows:
  - the old route as a thin grey dashed line;
  - the new route as a solid line in the relation's colour, or the default;
  - removed members in red and added members in green;
  - one-way arrows on the new route (`onewayOf` in `packages/renderer/src/direction.ts` already reads the direction);
  - the via points as markers;
  - where no route is possible, a red marker at the last reachable point, with the reason.
- **Summary line.** For example: "3 members removed, 5 added, 2 ways split, 1 other relation changed."
- **One-way and access.** A way the route's mode may not use is skipped. A one-way way is only followed in its drawing direction, unless the mode allows the other way (for example `oneway:bicycle=no`).
- **Roles.** Options for the role of each new member:
  - always the empty role (simplest; wrong where the route really follows one direction);
  - forward or backward only where the route follows a one-way way along or against its drawing direction (matches the wiki's description);
  - ask per case.
  Recommendation: the empty role in v1, and forward or backward only when the mapper confirms, because the sources disagree.
- **Gap or missing junction.** This is the core question. Recommendation: both, in order.
  - Option A is the base. When no path is found, the preview says why, per case: the via point is not on a loaded way; the area is not loaded; no node where the route could turn; a one-way blocks the way; the way is not open to the route's mode. The marker shows where. The mapper fixes it in browse mode and comes back. This is cheap and never wrong.
  - Option B is split only, first. Some "no path" cases are fixed by one split on a way that the route uses: the other road has a node where this way has none. A split creates a new end that touches nothing, so the turn is still impossible. The turn needs a shared node, which means a connect.
  - Connect is a topology change. It touches the other way and the validator's view. A wrong automatic connection is a common error. iD issues 8415 and 8578 show that silent edits to members cause the broken-route complaints.
  - Recommendation: B split-only in v2, shown as a preview line and applied with the reroute. Connect only as a separate, explicit action with a distance limit and a map preview, and never inside the reroute in v1.
  - Also show the other relations that a split touches ("also changes 2 other relations"). The split adds the new way to each of them (Read: split.ts).
- **One undo step.** The actions, in one `perform(...)` and one `commit()`:
  1. the splits, in route order (take the new way ids from each split's result);
  2. one action that replaces the span of members with the planned members, in order, with roles.
  Nothing else is in the step. Inferred.
- **Review before applying.** Apply writes the planned actions once. Cancel drops the plan, and nothing reaches the history. Inferred: if the plan's ways changed between preview and apply, refuse with a message and show the preview again. After apply, the validation module shows continuity as before (`routeGaps`).

### Technical approach

- **Graph.** Inferred: take the loaded ways in the bounding box of the via points, plus a margin, filtered to ways that the route's mode may use.
  - Nodes are way nodes. Edges are consecutive node pairs in a way, costed by spherical length (the model's geo helper, used in split.ts).
  - Edges meet only at shared node ids. This is the same rule as `touchPoints` in `routeJoins` and `routingIslandOf`.
  - A via point on a way interior is snapped to the nearest segment, and a virtual node is added there. The split of option B turns it into a real node.
  - Access rules per mode are a small table, not a full profile. Starting points: `bicycle=no`, `foot=no`, `access=private` or `no`, `oneway` and `oneway:bicycle`, and the highway classes a bicycle or a walker may use. Inferred: the table needs review by Tobias.
- **Router.** Inferred: A* with the great-circle distance to the goal as the heuristic. The heuristic is admissible when the edge cost is the spherical length. Dijkstra is the fallback. A binary heap of about 60 lines plus tests.
- **Libraries checked** (npm registry metadata, read, not installed):
  - `flatqueue` 3.1.0, ISC, 13 kB unpacked. A heap only. Fits Maid's licence.
  - `mnemonist` 0.40.6, MIT, 385 kB unpacked. Many data structures. Too big for one heap.
  - `ngraph.path` 1.6.1, MIT, 2.9 MB unpacked. Includes more than the code; bundle size not measured.
  - `tiny-queue` 0.2.1, Apache-2.0. A queue, not a heap.
  - Recommendation: own A* with a small heap, no new dependency. Use `flatqueue` only if the heap gives trouble.
- **Licences.** Maid is ISC (`LICENSE.md`). MIT, ISC and Apache-2.0 libraries are compatible. AGPL (osm-relatify) and proprietary code (cycle.travel) cannot be used. BRouter and OSRM are servers, not used in v1.
- **Speed.** Not measured. Target: under 100 ms from a via-point change to a preview on the dense fixture, for a route of about 3 km. Inferred: the graph is built once per change and reused while the loaded graph's version (`graph.props.v`) does not change. If it is over budget, move the work to a worker; ADR 0007 already covers workers and batched updates.
- **Snapping.** Inferred: use `packages/model/src/spatial/SpatialIndex.ts`. The file exists; not read.
- **Span rewrite.**
  - Find the span. Each via point maps to the member nearest to it, in member order. A way that occurs twice in a route (out and back, or a loop) needs a rule: the first occurrence after the previous member, or ask the mapper. Inferred.
  - Replace the span in one new model action. Members outside the span keep their order and roles exactly. Inferred: the new action must not call `osmJoinWays`, because a join can reorder members (iD 8415, 8578).
  - Node members (stops, platforms) inside the span: keep them when they are still near the new path, otherwise list them and ask. Inferred.
  - Removing a member from a relation does not delete the way.
- **Tests.** Unit tests on small synthetic graphs. No fixture and no network needed, so automation stays clean. A browser check (`check-reroute`) on a fixture scene needs a case with a cycleway beside a road. Core rule 1 says a person cuts fixtures, so ask Tobias to find or approve one in `fixtures/dense`.
- **Dependencies.** Not checked: whether `actionSplit` returns the created way ids to the caller. `_createdWayIDs` exists in split.ts; the public return was not read.

### Module or own app

Recommendation: a standard module, with the headless part in a package. Switch it on in `apps/maid-bicycle` first. Do not build a separate app.

Reasons:
- Read: the app is a list of modules, presets and filters over one shell (`apps/maid-bicycle/src/maid.config.ts`). AGENTS.md says apps switch modules on. A separate relation-editor app would copy or fork the shell, and every shell fix would have to reach both.
- The reroute needs what the module system already gives: an inspector section, an edit operation, a map overlay, validation rules, and the relation code. A separate app would rebuild these.
- Precedent: `module-turn-restrictions` (1,266 lines) has a headless `junction.ts`, a lazy section, and a rule list that the app config adds. The reroute can follow that pattern.
- Limit: the closed `Mode` union. A map-click mode needs a renderer change, which no module or app can make on its own. A separate app would not avoid this.
- A separate app like `maid-parking` makes sense when the target user needs different fields and a different map. That is not the case here. The reroute edits the same route relations the bicycle editor already edits.

What it would take (inferred, in steps; AGENTS.md sets a step at about an hour):
- Headless: graph from loaded ways, access table, A*, span plan with tests. About 3 steps.
- Span rewrite action with tests. About 1 step.
- Module UI: section, the two via-point operations, map preview. About 3 steps.
- Split-only option B. About 1 step, after A works.
- `check-reroute` browser check with a fixture case. About 1 to 2 steps, needs a fixture case from Tobias.
- Optional map-click hook in the renderer. About 1 to 2 steps.
- Total: roughly 10 to 13 steps, not counting the fixture work.

### Risks and open questions for Tobias

1. **Route types first.** Only bicycle routes in `maid-bicycle`, or also hiking and foot? Access rules differ.
2. **Roles.** Empty role only, forward and backward on one-way ways, or ask per case? The wiki and the forums disagree.
3. **Gaps.** Confirm option A first, option B split-only in v2, and connect only as a separate, explicit tool.
4. **Picking via points.** An edit operation first, or a renderer change for map clicks now?
5. **Loaded data only.** The router sees only loaded tiles. Which margin around the via points? What message when the area is not loaded? Under automation it sees only the fixtures. A person tests against dev or OSM by panning. Maid does not use Overpass.
6. **Loops and out-and-back routes.** Which occurrence of a repeated way is the span? Ask, or use the member order?
7. **Stops and platforms in the span.** Keep, move with the path, or ask?
8. **Other relations.** A split adds the new way to every relation that holds the old one (route_master, superroute, other routes). Show them, refuse, or allow?
9. **Turn restrictions.** Respect `no_*` restrictions in v1? The data is in `module-turn-restrictions`.
10. **Order.** Keep the mapper's order outside the span and never sort. Agreed?
11. **Scope of v1.** One relation, one span, two via points, no connect. Agreed?
12. **Licence.** No code from osm-relatify or cycle.travel. BRouter and OSRM not used in v1. Agreed?

### Read and inferred, in short

- **Read:** the wiki pages (PT_Assistant routing helper, Relation:route, Relatify) and the osm-relatify README, as summaries; iD issues 1575 and 6465 as page summaries, iD issue 12363 and issues 8415, 8578, 4876 and 4864 as search snippets; JOSM ticket 20634; forum threads on osm-relatify, the relation editor suggestion, unordered bicycle routes and forward and backward roles; npm registry metadata for four libraries; the iD reference checkout (`data/core.yaml`, `modes/select.js`); the Maid code paths listed above; the fixture and budget files.
- **Inferred:** the closed `Mode` union needs a renderer change for map clicks; an `edit.operation` is the cheapest entry; the access table; the role rule; the span rewrite must bypass the join; the speed target; the step sizes.
- **Not checked:** whether `map.content` receives clicks; `SpatialIndex` in detail; `actionSplit`'s public return; a timing of A* on the dense fixture; the current state of the iD issues read from search summaries; the JOSM split behaviour (only a search snippet); Rapid beyond a grep; the osm-relatify code (not cloned); BRouter's profile model in detail.
