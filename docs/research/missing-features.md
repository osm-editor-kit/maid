# Maid: what is still missing

Date: 2026-10-13. Morning version at commit `db9b114`. Evening update checked at `42f5626` (HEAD at the time). The morning text is kept; the evening columns and sections are marked "evening".

Legend. **checked**: looked at in the code on this date (grep or read). **report**: taken from the report's state and not re-checked. **unverified**: could not tell. Feature ids (`F-…`) are the ids of the area reports in `docs/research/id-tests/`, `F-…` from the other documents are named in the row. Sizes: S about an hour, M half a day, L more.

Evening status (section 2 onwards): **DONE** = built and seen in the code or a test; **PARTLY** = some of it built, the rest named; **OPEN** = not built (or not checked, marked "not checked"); **NOT WANTED** = a decision or a "not planned" line says so. Evidence written as "per commit message" was not checked in the code.

## Where the comparison stands (2026-10-13, evening)

Recounted at `42f5626`. Sections 1 to 4 keep the morning's figures and add the evening's.

- **Code.** 322 `it.todo(` lines (morning 349; the same grep at `72bd175` gives 347). 98 test files are adopted from iD (`test/id/`, `id-*.test.ts`, `*.id.test.ts`), with 743 `it(`/`test(` lines. Every todo sits in one of those files.
- **Gap rows (section 2, themes A to J, 117 rows).** 21 done, 17 partly, 77 open, 2 not wanted. Per theme (done / partly / open / not wanted): A 4 / 4 / 6 / 0; B 4 / 2 / 15 / 0; C 0 / 0 / 8 / 0; D 6 / 4 / 12 / 0; E 2 / 1 / 3 / 0; F 1 / 0 / 12 / 0; G 2 / 4 / 5 / 1; H 0 / 0 / 3 / 1; I 2 / 1 / 8 / 0; J 0 / 1 / 5 / 0. The K group (31 tests) is in its own list in section 2.
- **Bugs and differences (section 3, 14 rows).** 4 done, 2 partly, 8 open. The morning's count of 14 is unchanged; four of the morning's rows were fixed (4, 6, 12, 15).
- **Decisions (section 4).** 25 items. 24 are answered. One is not: the trimming of `description`, `note` and `fixme` (item 5). Four are answered in the text of ADR 0009, not in its table (items 9, 10, 11, 25). Several are decided but not yet built (items 7, 13, 14, 16).

### The ten most important gaps

Ranked by how often a mapper needs them. The ranking is my judgement, not a count of use. Sizes are from the tables in section 2.

| # | Gap | Where | Size | Why it ranks here |
| --- | --- | --- | --- | --- |
| 1 | Recent presets and preset categories in the type picker | E4, E5 | M | Every new feature goes through the picker. Favourites by number cover only the few a person pinned. |
| 2 | Labels on the map: ref, route and network, with names only partly shown | I7 | M | Labels are how a mapper finds a feature in view. |
| 3 | Combo fields: inline completion, Escape and Enter | D1, D2 | M | Used whenever a tag takes a value from a list. |
| 4 | Deprecated tags are not flagged | B20, F9 | M | Mappers meet deprecated tags every day. The data is in the tagging schema package already in `node_modules`. |
| 5 | Search for a place | G11 | M | Needs a decision first: Nominatim is OSM infrastructure (AGENTS rule 1). |
| 6 | Wikipedia and Wikidata fields | D8, D9 | M | Named features get their article and Q id this way. Decision 13: build as iD. |
| 7 | Relations: a new relation, one missing member loaded alone, nearby relations first | C2, C3, C5 | M | Route mapping needs them. |
| 8 | Vertex and parent/child keys (`[` `]`, Ctrl+arrows) | A4 | M | Quick editing of long ways for keyboard users. |
| 9 | "Ignore this issue" on warnings | F7 | S | Decided (decision 16), not built. Every false warning stays on the list until then. |
| 10 | Turn restrictions field | D12 | L | Decided: build now (decision 14). Large. |

Lasso (A3), the Z and F keys (A5, A7) and a point nudged inwards (A9) are S or M and rank below these.

### Deliberately not planned

- The walkthrough (iD's tutorial): decided 2026-10-12.
- GPX and KML in general, keyboard shortcut help, measurement and history panels, MapRoulette tasks: "Not planned yet" in `docs/build-out/steps.md`. MapRoulette was left out on 2026-10-13 because its API is broken.
- MapCSS rules from the Map Rules service (decision 15), presets from an external URL (decision 24), Backspace closing a dialog (decision 18).
- The published npm packages: not now, but still possible later.
- Radnetz features decided no: live edits of others (11), labels under toolbar buttons (13), Mapillary image from the field (14), data index (16). See section 5.
- Not a decision, but a conflict to resolve: `steps.md` "Not planned yet" still names **translations** and **turn restrictions**. Later decisions put translations in work (`steps.md`, "Order after the parking editor", step 3) and turn restrictions in "build now" (ADR 0009, item 14). This document follows the later decisions. Tobias to strike them from the "Not planned yet" line, or say otherwise.

## 1. Summary numbers

### Morning of 2026-10-13

iD's unit tests: 2196 (`docs/research/id-tests/inventory.md`, iD commit `0194f3926`). Recomputed from the per-file rows of the area reports, with the corrections in the notes below.

| Area (iD files) | iD tests | covered | adopted | todo | n/a | Report |
| --- | --- | --- | --- | --- | --- | --- |
| actions (35) | 509 | 368 | 114 | 27 | 0 | actions-a, actions-b |
| core incl. lib (9) | 210 | 124 | 9 | 33 | 44 | core |
| geo (4) and util (10) | 283 | 9 | 166 | 82 | 26 | geo-util |
| operations (4), modes (3), behavior (4) | 80 | 4 | 46 | 27 | 3 | operations-modes-behavior |
| osm (10) | 406 | 356 | 12 | 36 | 2 | osm |
| presets (4) | 80 | 1 | 62 | 15 | 2 | presets |
| renderer (4), services (10), svg (11) | 301 | 10 | 60 | 139 | 92 | svg-renderer-services |
| ui (18) | 118 | 0 | 46 | 58 | 14 | ui |
| validations (14) | 209 | 6 | 142 | 61 | 0 | validations |
| **total** | **2196** | **878 (40%)** | **657 (30%)** | **478 (22%)** | **183 (8%)** | |

Covered or adopted: 1535 of 2196 (70%).

Notes on the numbers:
- `change_preset` (13 tests) is counted once, under actions. The actions-a report counted it as todo, but `packages/presets/src/id-change-preset.test.ts` now adopts all 13, so it moves to adopted in actions. The presets report counts it too; it is removed from the presets total here (93 becomes 80).
- Stale sum rows were replaced by the sums of their rows: actions-a (its sum row says 41 adopted and 20 todo, its rows say 44 and 17 before the move above), actions-b (its sum row says "14 of 18 files, 124 of 349 tests"; all 18 rows are written), core (sum row 7 adopted and 35 todo, rows 9 and 33), validations (sum row covers only 3 of 14 rows).
- The code had 349 `it.todo(` lines in the morning: `packages/model` 183, `packages/validation` 61, `packages/ui` 46, `apps/maid` 18, `packages/presets` 15, `packages/renderer` 14, `packages/filters` 9, `packages/operations` 2, `packages/core` 1. The reports say 478 todo. The difference runs both ways: iD tests that a report counts as todo but that have no `it.todo` line yet (svg-renderer-services: 139 in its table, 23 todo lines in its folders; operations-modes-behavior: 27 in its table, 7 in its run line), and loops that run more cases than their one `it(` line (node.js, radio.ts). The reports are the list; the line count is only a check.

### Evening recount (2026-10-13, `42f5626`)

The `it.todo(` lines in the code, by package. Counted with grep; no tests were run.

| Package | Morning | Evening | Change | Note |
| --- | --- | --- | --- | --- |
| model | 183 | 171 | -12 | |
| validation | 61 | 61 | 0 | |
| ui | 46 | 41 | -5 | |
| apps/maid | 18 | 0 | -18 | the shell moved out of `apps/maid` (a1eb73e) |
| shell | 0 | 15 | +15 | the same files as the 18 under `apps/maid`, three of them fewer |
| presets | 15 | 12 | -3 | |
| renderer | 14 | 11 | -3 | |
| filters | 9 | 8 | -1 | |
| operations | 2 | 2 | 0 | |
| core | 1 | 1 | 0 | |
| **total** | **349** | **322** | **-27** | |

Files that changed since `72bd175` (the first commit of the day's log), compared with `git grep`: model `circularize.test.ts` 2 to 0 and `changeset.test.ts` 2 to 0 (adopted); presets `id-preset.test.ts` 4 to 1; renderer `id-midpoints.test.ts` 5 to 2 (midpoint handles, 2a36487); ui `id-directional_combo.test.ts` 2 to 0, `id-access.test.ts` 2 to 1, `id-localized.test.ts` 7 to 6, `id-combobox.test.ts` 18 to 17; filters `id-features.test.ts` 9 to 8; shell `id-raw_tag_editor.test.ts` 4 to 1 (the tags sheet replaced the raw tag rows, 5da82cc). Model's total at `72bd175` was 181, so the model moved by 10 since that commit and by 12 since the morning.

The adopted test files, by package, counted with awk (no tests were run):

| Package | Adopted test files | `it(`/`test(` lines |
| --- | --- | --- |
| model | 44 | 334 |
| validation | 15 | 166 |
| presets | 5 | 75 |
| ui | 11 | 50 |
| renderer | 7 | 16 |
| operations | 4 | 42 |
| shell | 9 | 14 |
| filters | 1 | 20 |
| style | 1 | 26 |
| core | 1 | 0 |
| **total** | **98** | **743** |

The `it(` lines are not iD tests one to one: loops, extra cases and Maid's own cases in the same files are counted too.

Not recounted tonight: the morning's per-area table (covered, adopted, todo, n/a per iD area). That needs the per-test mapping of each report done again. The evening's recount of the gaps is in section 2 instead.

## 2. Still missing, by theme

Columns: what a mapper cannot do or what goes wrong · where it came from · iD tests waiting for it · size · needs · **evening: status and evidence**.

### A. Editing on the map

| Gap | From | iD tests | Size | Needs | Evening: status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| No midpoint handles on the selected way: no node can be added between two nodes by dragging a handle | F-svg-2; interactions gap 5 | 5 | M | renderer and engine | DONE | `packages/renderer/src/midpoints.ts`, layers.ts:489; commit 2a36487. Two of iD's midpoint tests are still todo (`id-midpoints.test.ts`). |
| A double click on a way adds no node (the double click only zooms in browse) | interactions gap 5 | 0 counted | S | MapView, `actionAddMidpoint` | DONE | `packages/shell/src/components/MapView.tsx:513-523` (`handleDblClick` calls `engine.insertNode`); B5b. |
| No lasso: Shift-drag does not select what a box covers | F-beh-3; interactions gap 9 | 1 | M | renderer and MapView | OPEN | No box selection in `useShortcuts.ts` or MapView (grep for lasso and box select: nothing). |
| No vertex and way navigation keys: `[` `]` `{` `}`, Ctrl+↑ parent, Ctrl+↓ child, `\` next parent | F-mode-1 (8); interactions 14 | 8 | M | parent and child lookup in the model | OPEN | The key list in `packages/shell/src/components/useShortcuts.ts` has none of them. |
| `Z` does not zoom to the selection | interactions 15 | 0 counted | S | map fit | OPEN | No `Z` in `useShortcuts.ts`. |
| Shift+arrows do not nudge, Shift+`+`/`-` do not scale | interactions 16 | 0 counted | M | the move operation (in the model) | OPEN | Shift+ArrowLeft and Shift+ArrowRight turn the map (be55541); no nudge, no scale key. |
| `F` does not follow a line while drawing | interactions 18 | 0 counted | M | draw mode | OPEN | No `F` key in `useShortcuts.ts`. |
| Alt does not suppress hover, and hover does not highlight all members of a relation | F-beh-1 (4), F-beh-2 (1) | 5 | S | renderer, shortcuts | PARTLY | Members of a relation get a glow (`layers.ts:313`, `engine.setRelated`). Alt does not switch hover off: no `altKey` in `packages/renderer/src/engine.ts`. |
| A point dragged to the edge of the map cannot be nudged inwards while drawing | F-geo-3 (9); snapping §1.4 "map nudge" | 9 | M | renderer or ui | OPEN | No nudge code (grep for nudge: nothing in packages). |
| Dragging a node onto its own way: no "nope" segment and no self-intersection check | snapping §1.4 (report) | 0 counted | M | model `hasInvalidGeometry` | PARTLY | A drop onto a node or a way connects it (`engine.ts` endDrag, around lines 2008 and 2022), and some joins are refused with a reason (`connectRefusal`, around line 1921). No "nope" and no self-intersection check seen. |
| One cursor for all features and modes (iD has nine) | F-renderer-5 (report) | 9 | S | MapView, engine pick | PARTLY | Two cursors: `grab` in browse, `crosshair` in other modes (`MapView.tsx:133, 549`). |
| Geometry helpers for drawing: nearest edge of a way, do lines cross | F-geo-1 (8), F-geo-2 (4) | 12 | M | `packages/model/src/geo` | PARTLY | Snapping onto a way's line works (B4). The helper tests are still todo: 22 in `packages/model/test/id/geo/geom.test.ts`. |
| Measuring tape for width fields | radnetz 21 (decided "build now") | 0 | M | field button and map tool | DONE | `f7d5431` (a "Measure on the map" button on every width field, `packages/ui/src/inspector/fields.tsx`); the magnifier lens is `packages/renderer/src/measure.ts` (6f2f871). |
| Rotate, scale and move bend the neighbouring ways: shared nodes are moved in place | snapping §2.3 item 2 | 0 counted | M | `actionMove` exists | DONE | `packages/renderer/src/transform.ts:173` calls `actionMove`; commit 194a5f8 ("neighbouring ways keep their shape"; the neighbour check per commit message, not re-measured). |

### B. Operations and actions (the edit menu)

| Gap | From | iD tests | Size | Needs | Evening: status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Circularize: vertex count by size (16 new nodes on a four-corner building at 10 to 100 m) | F-actions-a-2 (1); snapping §2.3 item 3 | 1 | M | blocked: Rapid's test expects 21 nodes; see D1 | PARTLY | Decision 1 built in b9dcaff (per commit message). The iD test "performs operation without creating superfluous entities" is still todo (`packages/operations/src/id-circularize.test.ts`). |
| Circularize at t = 0 leaves the way in place in Rapid, iD inserts vertices | F-actions-a-3 (1) | 1 | S | decision D1 | DONE | `packages/model/test/id/actions/circularize.test.ts:106` ("circularize at t = 0") is adopted and not todo; decision 1, b9dcaff. |
| Circularize: open ways are joined into a loop first (needs a temporary way) | F-ops-1 (2) | 2 | M | `osmJoinWays` plus a temporary way id | OPEN | `id-circularize.test.ts`: "is available for a multiselection of unclosed ways forming a ring" still todo. |
| Reverse: a direction with `;` values loses data (see §3) | F-actions-b-23 (2) | 2 | S | a fix in `reverse.ts`; D21 | DONE | `packages/model/src/actions/reverse.ts:166-181` splits on `;` and reverses each part (72bd175). |
| Reverse: side values on cyclist waiting aids and turnouts, and `red_turn:*` keys are renamed | F-actions-b-21 (2), -22 (1) | 3 | S | decision D21 | DONE | `reverse.ts:60-61, 125, 154-155` (72bd175). |
| Reverse: a directionless node gets its preset's direction key | F-actions-b-20 (4) | 4 | M | preset lookup passed in as an option | OPEN | Four titles still todo in `reverse.test.ts`; `reverse.ts` has no preset lookup. |
| Orthogonalize: keeps a vertex at the same place as its neighbour (see §3) | F-actions-b-12 (1) | 1 | S | `orthogonalize.ts`, around line 181 | DONE | `packages/model/src/actions/orthogonalize.ts:57` drops consecutive duplicates (72bd175). |
| Split: refuse when a parent relation is incomplete, and a roundabout in a route | F-actions-b-30 (1), -31 (1) | 2 | S | `split.ts` `disabled` | OPEN | No `parent_incomplete` or `simple_roundabout` in `split.ts`; both tests todo in `split.test.ts`. |
| Split: a closed way given two nodes is split at those nodes (Maid adds its own antipode) | F-actions-b-32 (1) | 1 | S | `split.ts` | OPEN | "splits a closed way at the given points" still todo (bug 9). |
| Split: line-only tags (`natural=coastline`) stay on the ways; the same for merge_polygon | F-actions-b-33 (1), F-actions-b-4 (1) | 2 | M | the way-only tag list from the tagging schema (unverified whether Maid ships it) | OPEN | "preserves coastline tag" todo in `split.test.ts` and `merge_polygon.test.ts`. |
| Split: the new way's place among route members (dual carriageway, 2 of 5 tests) | F-actions-b-36 (2); F-relations-3 | 2 | M | `add_member.ts` (unverified) | OPEN | Both dual-carriageway tests todo in `split.test.ts`. |
| Join: summable tags (`step_count`, parking capacity) are added up, not a conflict | F-actions-b-10 (1) | 1 | S | summable tag list next to `isInterestingTag` | OPEN | Only `step_count` is split, in `split.ts:196-199`; no summable list in `join.ts`. |
| Discard tags by value: `attribution=x` drops only that value | F-actions-a-1 (1) | 1 | S | `discard_tags.ts` (checked: any truthy entry drops the key) | OPEN | `discard_tags.ts:10`: values are ignored; the test is todo. |
| Extract without moving relation membership (iD's option off) | F-actions-a-6 (1) | 1 | S | `extract.ts` | OPEN | "does not extract relations by default" todo in `extract.test.ts` (bug 17). |
| Delete: not for a connected hidden way, not for a too large selection | F-ops-2 (report: `connected_to_hidden`, `too_large` left) | 0 counted | M | filters and visible extent in `OperationContext` | PARTLY | Too large: `packages/operations/src/extent.ts:190` and `too-large.test.ts` (5251d50; a new feature is never too large). Connected hidden way: not built. |
| Model: the side tag in `OsmNode.directions`; sidedness identifier; area of a way; `mergeTags` override | F-osm-6 (7), F-osm-8 (2), F-osm-9 (3), F-osm-5 (1) | 13 | S each | `packages/model/src/data` | OPEN | Still todo: `node.test.ts` (side), `way.test.ts` (sidedness, area), `entity.test.ts` (override tags). |
| Model: frozen entities in development builds | F-osm-4 (5) | 5 | S | `OsmEntity.ts` and subclasses | OPEN | "is frozen" and "freezes nodes" still todo (`entity.test.ts`, `way.test.ts`, `relation.test.ts`). |
| Graph: spatial index that follows parent ways and members loaded later | F-core-3 (12) | 12 | L | `packages/model/src/spatial`, `EditHistory._syncCacheFromDiff` | OPEN | The folder exists; the twelve tests in `tree.test.ts` are todo. |
| Graph: `Difference.extantIDs()`, transient cache per graph, animated edits | F-core-4 (5), F-core-5 (1), F-core-6 (1) | 7 | S to M | F-core-6 was cut from Rapid: decide before building | OPEN | `difference.test.ts` (five todo, "includes the ids of…"); "invalidates transients" in `graph.test.ts` todo. |
| Deprecated tags: no matching of iD's deprecated rules to an entity | F-osm-1 (9) | 9 | M | `deprecated.json` from the tagging schema (in `packages/presets/node_modules`), passed in | OPEN | All nine in `deprecated.test.ts` todo. |
| Debug flags on the editor (for example collision debugging) | F-core-7 (1) | 1 | S | `packages/core/src/editor.ts` | OPEN | "sets and gets debug flags" todo in `packages/core/src/id-context.test.ts`. |

### C. Relations

| Gap | From | iD tests | Size | Needs | Evening: status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Member and relation labels have no preset name (only name, ref or type) | relations-vs-id rows 6, 7 | 0 counted | M / S | `packages/presets` | OPEN | The label in `packages/shell/src/modules/relations-logic.ts` uses name, ref or type. |
| "New relation" is not offered in the membership picker | relations-vs-id row 19 | 0 | M | model action (exists) and the picker | OPEN | No "New relation" in `relations-sections.tsx`. |
| One missing member cannot be loaded alone (only the whole relation) | relations-vs-id row 2 | 0 | M | engine request per member | OPEN | Not in the code; only a relation loaded in full (b4208b4). |
| Members are highlighted with a halo, not iD's outline, and only one level of nesting | relations-vs-id rows 12, 13 | 0 | M | renderer | OPEN | Members get a calmer glow (`layers.ts:313`), still not iD's outline. |
| The picker does not show nearby relations first, nor the newest | relations-vs-id row 11 | 1 | M | `joinableRelations` | OPEN | `joinableRelations` (relations-logic.ts:144-150) sorts by label. |
| The parent way of a selected vertex is not highlighted as related | relations-vs-id "still behind" | 0 | S | engine | OPEN | Not checked. |
| A parent relation does not follow members that load later | relations-vs-id row 4; F-core-3 | 4 (+10 in F-core-3) | with F-core-3 | spatial index | OPEN | "includes intersecting relations after incomplete members are loaded" todo in `tree.test.ts`. |
| Route order after a split against the travel direction | F-relations-3 (1); F-actions-b-36 | 1 | M | see B | OPEN | Dual-carriageway split tests todo (see B). |

### D. Fields and the inspector

| Gap | From | iD tests | Size | Needs | Evening: status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Combo: the first matching option is completed inline in the typed text | F-ui-1 (14) | 14 | M | `combo-logic.ts`, `Combo.tsx` | OPEN | Still todo: "selects and autocompletes the next/prev suggestion" and related (`id-combobox.test.ts`). Steps U7: "no inline autocomplete in the combo". |
| Combo: Escape cancels with an event, Enter closes the list; the full list when opened untouched | F-ui-2 (2), F-ui-3 (1) | 3 | S | move key decisions into `combo-logic.ts` | OPEN | "emits cancel event on ⎋" and "hides on ↩" todo (`id-combobox.test.ts`). |
| Combo: order of the options when filtering | F-ui-4 (1) | 1 | S | decision D3 | DONE | Decision 3: iD's order, built in f56275f (ADR 0009; per commit message). |
| semiCombo: unique values unless the field allows duplicates (and then `addSemi` drops the repeats, see §3) | F-ui-5 (1) | 1 | S | `allowDuplicates` in the field type (`packages/presets`) | OPEN | No `allowDuplicates` in the code; "filters out duplicates by default" todo (`id-combo.test.ts`). |
| Multi-selection: fields and placeholders show "Multiple values" when the selected features differ (no such text in the code, checked) | F-ui-6 (3) | 3 | L | inspector for several features | DONE | "Multiple values" in `packages/ui/src/inspector/fields/Combo.tsx`, `Number.tsx`, `Access.tsx`; `mixed-logic.ts`; fc45983 and d0d7c6d. |
| Localized: language names ("Deutsch" becomes `de`) | F-ui-9 (4) | 4 | M | language data (licence to check) | OPEN | "changes an existing language" and three more todo (`id-localized.test.ts`). |
| Localized: the "Add a language" row, and `lang` on the value input | F-ui-8 (1), F-ui-20 (1) | 2 | S | `Localized.tsx` | PARTLY | The "Add a language" row is in `Localized.tsx`; "has a lang attribute" still todo. |
| Wikipedia field (text, language, title, Wikidata id, pasted URL) | F-ui-11 (10 plus one iD skip) | 10 | M | decision D13 (network) | OPEN | No Wikipedia field in `packages/ui/src/inspector/fields/`; eleven todo in `id-wikipedia.test.ts`. Decision 13: build as iD (ADR 0009, open). |
| Wikidata field: plain text today | fields-vs-id §1 | not counted | M | decision D13 (network) | OPEN | As above; decision 13. |
| Taginfo value suggestions for the combo fields | F-services-12 (20); fields-vs-id §5 | 20 | M | decision D11 | PARTLY | Key and value suggestions in the tags sheet (`packages/ui/src/sheet/tags/tag-suggest.ts`, 7a7d1cb). Not in the combo fields. |
| Info button (wiki page and Wikidata) | F-services-13 (11); fields-vs-id §5 | 11 | M | decision D12 | DONE | `packages/ui/src/InfoPopover.tsx` (c756bc9); decision 12. Asks the wiki only on a click. |
| Restrictions field (writes relations, not tags) | fields-vs-id §3.12, build step 18 | not counted | L | decision D14 | OPEN | Decision 14: build now, open (ADR 0009). The parking module's restriction field is for parking, not turn restrictions. |
| Locked fields (brand, network, operator, flag, name) | fields-vs-id build step 17 | not counted | S | unverified | OPEN | No locked-field handling in the code (`locked` only in comments). |
| Raw tag list: sort rules, "No tags", add form and blur commit live in the components | F-ui-18 (4) | 4 | S | move rules to a logic file | PARTLY | The tag rows are now the tags sheet (`packages/ui/src/sheet/`, b7535df, 5da82cc). `id-raw_tag_editor.test.ts` has one todo left. Sort rules in the sheet not checked. |
| Dialogs close by their close button, Escape and their action buttons | F-ui-12 (5, missing check) | 5 | S | browser check | OPEN | `id-confirm.test.ts` (3) and `id-modal.test.ts` (2) todo. |
| Shortcut labels for Shift-only and key-only shortcuts (`⇧A`, `F11`) | F-ui-13 (2) | 2 | S | `apps/maid/src/platform.ts` | OPEN | `id-cmd.test.ts`: three todo ("changes keys to linux versions", "handles multi-character keys"). |
| Inspector: "View on openstreetmap.org" link and the last modified child | F-ui-15 (1) | 1 | S | `Inspector.tsx` | OPEN | No link to openstreetmap.org for an element in `packages/shell` (grep); `id-view_on_osm.test.ts` todo. |
| Inspector follows the data when the graph changes under the selected entity | F-ui-16 (1, missing check) | 1 | S | unverified | OPEN | `id-entity_editor.test.ts`: "refreshes selected entity details when history merge fires" todo. |
| Account button shows the display name (today the user id) | F-ui-19 (1, missing check) | 1 | S | `UserButton.tsx` (unverified) | DONE | `packages/shell/src/auth.ts:91-92` stores `display_name`. The test "properly escapes user name" is still todo (`id-account.test.ts`). |
| Transient notices (flash), and the reason for a refused drop, which no UI shows | ui report (flash, n/a row); snapping §1.4 | 1 | M | decision D19 | PARTLY | Toasts built (`packages/ui/src/Toast.tsx`, bb71055, ebe1e95; decision 19). The engine returns the reason of a refused drop (`engine.ts` endDrag, `result.refused`); the display is not checked. |
| Custom imagery from a URL template (ELI listing only today) | F-ui-17 (3), F-renderer-6 (7) | 10 | M | `packages/module-imagery` | DONE | `packages/module-imagery/src/custom.ts` (05afc8b, 3bb1edd). |
| Favourites use fixed keys (4 to 9 and 0) | steps Part E, radnetz 3 | not counted | S | decision D8 | DONE | Decision 8: one modifier and a number of any length (`packages/shell/src/favourites-keys.ts`; two digits tested; 5251d50). |

### E. Presets

| Gap | From | iD tests | Size | Needs | Evening: status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `matchAllGeometry`: presets that fit every geometry of a multi-selection | F-presets-1 (2) | 2 | S | `packages/presets/src/presets.ts` | DONE | `packages/presets/src/presets.ts:1008-1010`. |
| Addable presets: a list of the presets that may be picked | F-presets-2 (5: 1 in preset, 4 in index) | 5 | M | index and app config | OPEN | `presets.ts:5`: "Not ported: … addable presets"; the index tests are todo. |
| `skipFieldDefaults` for `applyPreset` and `unsetTags` | F-presets-3 (1) | 1 | S | decision D7 | DONE | Option in `presets.ts:894, 917, 955`. Decision 7 (follow iD, verify function by function) is still "in work" in ADR 0009. |
| Preset categories (the tabs of the picker) | F-presets-4 (2) | 2 | M | category data is not in `PresetData` (report) | OPEN | `presets.ts:5`: "Not ported: categories"; `id-category.test.ts` todo. |
| Recent presets and location sets | F-presets-5 (1) | 1 | M | presets index and app storage | OPEN | `presets.ts:5`: "Not ported: … recents"; "fills all recent slots" todo. |
| Custom presets merged into a built index; presets from an external URL | F-presets-6 (2), F-presets-7 (2) | 4 | S; the URL case needs D24 | D24 for the URL case | PARTLY | Merge built: `withChanges` (c756bc9). External URL: NOT WANTED (decision 24). |

### F. Validation

| Gap | From | iD tests | Size | Needs | Evening: status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| crossing_ways: multipolygon members are checked as the relation | F-validations-1 (8) | 8 | M | `rules/crossing-ways.ts` | OPEN | `crossing-ways.ts:17`: "Cut: relations (multipolygon members are not checked)". |
| crossing_ways fixes: add bridge, add tunnel, change layer | F-validations-2 (1) | 1 | M | `Fix` in `types.ts` | OPEN | `crossing-ways.ts:17-18`: the bridge, tunnel and layer fixes are cut. |
| missing_role fixes: set outer or inner, remove the member from the multipolygon | F-validations-3 (no test counted) | 0 | M | membership actions in the model | OPEN | `missing-role.ts:34`: "Maid offers no fix yet". |
| osm_api_limits fix: split a way with too many nodes | F-validations-4 (3) | 3 | M | a split in `packages/operations` | OPEN | `osm-api-limits.ts` gives `fixes: []` (lines 55, 73). |
| impossible_oneway fixes "Continue drawing from start / end" | F-validations-20 (no test counted) | 0 | S to M | a draw mode, which is not a model action | OPEN | `impossible-oneway.ts:9`: the continue fix is not built. The reverse fix is (line 244). |
| almost_junction: searches the ways beyond a road's end only inside the road's box (see §3) | F-validations-21 (8) | 8 | M | a `RuleContext` query (checked: only `waysNear`, `types.ts:38`) | OPEN | `almost-junction.ts:23-25`: the box limit is still in the code (bug 7). |
| "Ignore this issue" on warnings | F-validations-22 (2) | 2 | S | decision D16 | OPEN | Decision 16: as iD, in Maid's own UI (ADR 0009, open). |
| mismatched_geometry (rule not built) | F-validations-23 (14) | 14 | L | preset lookup by geometry in `RuleContext` (no presets in `packages/validation`) | OPEN | No rule file in `packages/validation/src/rules/`. |
| outdated_tags: deprecated tags (rule not complete) | F-validations-24 (10) | 10 | M | deprecated list passed in (see B) | OPEN | No outdated-tags rule. |
| outdated_tags: brand suggestions (NSI) and preset upgrades | F-validations-25 (3) | 3 | L | NSI data, not shipped | OPEN | No rule, no NSI data. |
| suspicious_name (rule not built) | F-validations-26 (14) | 14 | M to L | NSI generic names, not shipped | OPEN | No rule file. |
| Incremental validation of the difference, and idle chunks for a validate-everything run | validation-performance "Open items" | 0 counted | M | none; the worker and WASM question is answered | DONE | Each edit checks only what it changed (a2ea2cf); `packages/validation/src/incremental.test.ts` exists. Idle chunks are not built (not checked). |
| Applicability by entity type: rules are called on every entity | validation-performance "Open items" | 0 counted | S | a `types` field on rules | OPEN | Not checked. |

### G. Saving, notes and services

| Gap | From | iD tests | Size | Needs | Evening: status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Rate limit: a 429 or 509 answer stops tile loading and is shown; today the tile is retried on each move (see §3) | F-services-1 (2) | 2 | S | `engine.ts` `loadTile`, a notice in `apps/maid` | DONE | `packages/renderer/src/tile-loading.ts:13` (a 429 or 509 puts the tile back to idle until the pause ends); `packages/core/src/fetching/gate.ts` and `remote-fetch.ts`; 278aae9, 5b30201. The two iD tests not checked. |
| Changeset generator says "Rapid" | F-osm-2 (2) | 2 | S | decision D2 | DONE | The app's name is `created_by` (`packages/shell/src/shell.ts:27`); decision 2 (b9dcaff). |
| Save flow: changeset comment and hashtags, review of the changes with map highlight, upload progress, conflicts shown in the app | steps C2 (unticked); commits 62d9183, 7472084 | 0 (the UI side is unverified) | M | how far C2 is done is unverified | PARTLY | Comment, hashtags and a flyout with the changes (`SaveButton.tsx`, `save/save.ts`). No upload progress, no highlight of the review list on the map, conflicts as the server's message only (steps C2, "Open"). |
| Notes are read-only: no add, comment, close or reopen | F-services-8 (3) | 3 | L | notes write path; only against the development server (AGENTS rule 1) | OPEN | No write function in `packages/module-notes` (grep for create, add comment, close: nothing). |
| Notes: one note by id, cells already loaded are not asked again, note as a model object | F-services-7 (1), F-services-9 (1, missing check), F-osm-3 (5) | 7 | S to M | `packages/module-notes` | OPEN | Not checked. |
| The user's own changesets, with comments | F-services-5 (3) | 3 | M | a new view, `osm-api` | OPEN | No view in `packages/shell` or `osm-api` code. |
| The API's capabilities and status (and the imagery blocklists from them) | F-services-10 (2) | 2 | S | `apps/maid/src/auth.ts` or save | OPEN | The query key `osmCapabilities` is defined (`packages/core/src/fetching/query-client.ts:106`); no caller found. |
| Web links to an element, its history, its changeset, a user, the changesets page | F-services-6 (9) | 9 | S | next to `noteWebUrl` | PARTLY | Note link only: `noteWebUrl` (`packages/module-notes/src/model.ts:142`). No element, history, changeset or user link. |
| Load one element that is not in view (relation members, parents); older versions of an element | F-services-3 (3), F-services-4 (3) | 6 | M | engine method; a history view for versions | PARTLY | A relation is loaded in full (b4208b4, `query-client.ts:63`). Single elements and versions: not built. |
| Tile loading rules have no test: only the missing tiles, centre first, no load below the minimum zoom | F-services-2 (3, missing check) | 3 | S | `engine.ts`; the tile maths in a function | PARTLY | Nearest-first test exists (`packages/renderer/src/tile-loading.test.ts:268`). The other two rules not checked. |
| Place search and the country of a position (Nominatim) | F-services-11 (5) | 5 | M | Nominatim is OSM infrastructure (AGENTS rule 1): a fixture or a decision first | OPEN | No Nominatim code. Needs a decision. |
| MapCSS rules from the Map Rules service | F-services-14 (29) | 29 | L | decision D15 | NOT WANTED | Decision 15: not built; rules worth having go into Maid's own validation (ADR 0009). |

### H. Data layers and imagery

| Gap | From | iD tests | Size | Needs | Evening: status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| GPX and KML files as data layers (GeoJSON only) | F-svg-3 (2) | 2 | M | `packages/module-data-layers` | NOT WANTED | "Not planned yet" in `steps.md` (GPX in general). Two todo in `id-data.test.ts`. |
| Labels for the features of a data layer, with a switch | F-svg-4 (2) | 2 | S | `module-data-layers`, `layers.ts` | OPEN | "shows labels by default" and "hides labels" todo (`id-data.test.ts`). |
| Street photos: the open photo is not kept in the URL | street-imagery-vs-mapillary (table row, "not done") | not counted | M | `apps/maid/src/url/params.ts` (unverified) | OPEN | Not checked: `packages/shell/src/url/id-url.ts:32-35` lists the photo keys; whether the open photo is written is not checked. |
| Street photo layer: age colours, own users, the selected way's images (radnetz 18) | radnetz 18 | not counted | M | unverified | OPEN | Still in the Radnetz list of `steps.md`. |

### I. Display

| Gap | From | iD tests | Size | Needs | Evening: status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Areas are not stacked by size, smaller above larger | F-svg-1 (4) | 4 | M | `renderer/src/layers.ts`, `build.ts` | OPEN | Four todo in `id-areas.test.ts`. |
| A closed barrier way keeps its fill in Maid, iD outlines it only | F-svg-5 (1) | 1 | S | `build.ts` `areaFeature` | OPEN | "renders areas with barriers as lines" todo (`id-tag-classes.test.ts`). |
| Per-category counts of the features in view (the filter panel shows none) | F-features-1 (1) | 1 | M | `packages/filters`, `packages/renderer` | OPEN | The filter panel shows the number hidden, not per category (steps B7). |
| Auto-hide of a category with too many features in view, the threshold doubles with the view | F-features-2 (2) | 2 | M | filters state and renderer count | OPEN | "auto-hides features" and "doubles auto-hide threshold" todo (`id-features.test.ts`). |
| Features that are selected or edited stay visible while their category is hidden | F-features-3 (1) | 1 | S to M | renderer, engine | OPEN | Steps B7: "the selected feature is not kept when its filter hides it". |
| Untagged members of a multipolygon take the category of the relation | F-features-5 (4) | 4 | M | the relation in the filter input | OPEN | Steps B7 and the todo titles in `id-features.test.ts`. |
| Labels: a feature's name, ref, route and address, not only the house number | F-util-9 (24) | 24 | M | `packages/model/src/util`; the label in `renderer/src/build.ts` | PARTLY | Names are label properties (`build.ts:52, 77, 81`); the house-number plaques are built. The iD display-name rules (ref, route, network) are todo in `util.test.ts`. |
| Minimum camera zoom (Maid lets the camera go to 0 and shows "Zoom in to load data") | F-renderer-1 (2) | 2 | S | decision D10 | DONE | Decision 10: the camera stops at the world view, 56a497f (ADR 0009 "Later the same day"). |
| Overlay imagery is never hidden above its maximum zoom | svg-renderer-services differences | 0 | S | a difference by design (ELI's maximum zoom is not a limit); no decision recorded | OPEN | Not changed; not checked. |
| Missing checks on the map view: move reported, zoom in and out steps, bounds and animated move | F-renderer-2 (2), -3 (2), -4 (2) | 6 | S | `tools/bench` or a unit test | OPEN | No such checks found in the renderer tests. |
| Points: pins and house numbers, view cones of points | steps Part E (commits 7a5e7f9, 1a46967, 229963b, 99cdfb9) | 0 | S | unverified | DONE | Pins and house-number plaques (`build.ts:80-81`, 7a5e7f9, 1a46967). View cones: built (229963b, 99cdfb9), not checked. |

### J. Localisation and formats

| Gap | From | iD tests | Size | Needs | Evening: status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `t()` lookup with fallback, localised text in the DOM (no translations) | F-core-1 (5 incl. `localesToUse`) | 5 | L | a localisation package; not planned | PARTLY | `packages/i18n` (Paraglide, four languages, a4957a4) covers the top bar and the empty sidebar. The rest of the editor is English. Translations are in work (steps, order step 3). |
| Number formatting and parsing per locale | F-core-2 (8) | 8 | M | same as F-core-1 | OPEN | No locale number formatting in the code (not checked further). |
| Locale fallbacks (`zh-CN` to `zh-Hans-CN`, `zh-Hans`, `zh`) | F-util-13 (12) | 12 | S | `localized-logic.ts` | OPEN | Twelve todo in `packages/model/test/id/util/localizer.test.ts`. |
| Coordinates as D M SS, z/x/y and x/y; parsing with localised numbers | F-util-3 (13) | 13 | M | `packages/model/src/util` | OPEN | Thirteen todo in `units.test.ts`. |
| Small utilities: powerset (1), dictionary lookup (2), GeoJSON properties as tags (1), tag diff with context (1), combined tag values (2), edit distance inside a name (6), diacritics as a utility (1), `+` in query strings (2, upstream) | F-util-1, -4, -5, -6, -7, -8, -11, -14 | 16 | S each | `packages/model/src/util`; the upstream one is `@rapid-sdk/util` | OPEN | Todo: `array.test.ts` (powerset), `object.test.ts` (three), `util.test.ts` (edit distance, names, diacritics). |
| Geometry: extent split (1), winding order of the polygon and of the smallest rectangle (2, upstream) | F-geo-4 (1), F-geo-5 (2) | 3 | S; upstream | `@rapid-sdk/math` or a wrapper | OPEN | "splits into four parts" todo in `extent.test.ts`. |

### K. Tests that are checks, not features

These are "missing checks" in the reports: the code may already do the thing, but no check or test asserts it. One group, 31 iD tests in all. Evening status per group:

- Hash and selection (`F-beh-4` to `-7`): OPEN. Five todo in `packages/shell/src/url/id-hash.test.ts` (centre on a hash change, the stored last position, the throttled change event). Maid's `interactions-check` covers shift-click on the last selected only in part (not checked).
- Add point (`F-mode-2`, 2): unverified. `check-edit` adds points; whether a click on a point selects it is not checked.
- Map view (`F-renderer-2` to `-4`, 6): OPEN. See I.
- Tile loading (`F-services-2`, 3) and notes cells (`F-services-9`, 1): PARTLY. The nearest-first test exists; the rest is OPEN.
- UI (13): access rows (`F-ui-7`, OPEN, one todo), localized rows (`F-ui-8`, OPEN), dialogs (`F-ui-12`, 5, OPEN), inspector follows the data (`F-ui-16`, OPEN), raw tag list (`F-ui-18`, 4, PARTLY), account button (`F-ui-19`, DONE in code; its test is todo).

Gap rows in this section: none with a table; the status counts in "Where the comparison stands" cover A to J only.

## 3. Bugs and differences found and not fixed

These are wrong today, not only absent. Evidence and the report that found them. The evening status is in the last two columns; the rows fixed since the morning are listed below the table.

| # | What is wrong | Evidence | Report | Evening: status | Evidence (evening) |
| --- | --- | --- | --- | --- | --- |
| 4 | Rotate, scale and move bend the neighbouring ways (their shared nodes move in place, the way gets no new node) | checked: `transform.ts:110`; measured `w2` bends | snapping §2.3 item 2 | DONE | `transform.ts:173` now uses `actionMove` (194a5f8, "neighbouring ways keep their shape"; per commit message, not re-measured). |
| 5 | A favourite's tags are not applied when the favourite is added on an existing node; on a line the new vertex is untagged | snapping §1.4 table (report) | snapping §1.4 | OPEN | Not checked. `favourites.ts:156-169` gives a selected feature the favourite's type; whether the tags follow to an existing node was not tested. |
| 6 | A failed tile (429 or 509) is retried on every move, which repeats the requests that caused the limit | checked: no 429 handling in `packages/renderer` | svg-renderer-services, F-services-1 | DONE | `packages/renderer/src/tile-loading.ts:13`: a 429 or 509 puts the tile back to idle until the pause ends. |
| 7 | almost_junction misses a crossing beyond a road's end when it lies outside the road's box | checked: `waysNear` only (`types.ts:38`); the rule's own comment says so | validations, F-validations-21 | OPEN | `almost-junction.ts:23-25`: the box limit is still in the code. |
| 8 | Route order after a split: the new way is placed in the wrong position in 2 to 5 cases (dual carriageway) | actions-b, `split.js` route tests | actions-b, F-actions-b-36; relations F-relations-3 | OPEN | Both dual-carriageway tests todo in `split.test.ts`. |
| 9 | A closed way split at two given nodes is split at its own antipode as well | actions-b, F-actions-b-32 (todo) | actions-b | OPEN | "splits a closed way at the given points" todo. |
| 11 | semiCombo on a field that allows duplicates: `addSemi` drops existing repeats on each write | ui differences (F-ui-5) | ui | OPEN | No `allowDuplicates` in the code (see D4). |
| 12 | A feature gets only its first matching filter category: a station is hidden with `rail` while `points` is on (iD keeps it) | svg-renderer-services differences; `default.ts` documents the rule on purpose | svg-renderer-services; D6 | DONE | Decision 6 built in 6e7a2ee: `packages/filters/src/filters.ts:138-142`, "the more permissive of two states". |
| 13 | A new (unsaved) feature can be hidden by a filter; iD hides only saved features | report: the builder has no such check (not reproduced) | svg-renderer-services, F-features-4 | OPEN | Not reproduced; no exemption for new features found in `packages/filters/src/filters.ts`. |
| 14 | Circularize adds 16 new nodes to a four-corner building at 10 to 100 m | snapping §2.3 item 3 (measured) | snapping; F-actions-a-2 | PARTLY | Decision 1 built (b9dcaff, per commit message). The iD count test is todo (see B1). |
| 15 | Moving a straight way uniformly inserts a vertex into it (`n-1` in `w1`) | snapping §2.3 item 4 (measured; cause not traced) | snapping; unverified | DONE | 194a5f8, "a straight way gets no extra node" (per commit message, not re-measured). |
| 16 | The editor's `cleanValue` trims `description`, `note` and `fixme`, which iD leaves alone; the upload now keeps them | ui/geo-util differences (F-util-2); `packages/ui/src/inspector/logic.ts` | geo-util; D5 | OPEN | `inspector/logic.ts:19` still trims every value. The trimming is not decided (see §4, item 5). |
| 17 | Extract always moves relation membership to the new node; iD does it only when asked | actions-a, F-actions-a-6 | actions-a | OPEN | "does not extract relations by default" todo (see B14). |
| 18 | crossing_ways: the "Connect the features" fix adds an untagged node; iD adds connection tags | validations differences | validations | PARTLY | `crossing-ways.ts` uses `connectionTagsFor` (`connection-tags.ts`). Not re-tested, so the claim is not confirmed either way. |

Fixed since the reports, so not in this table: the join that deleted a collapsed multipolygon's `type=site` parent (F-actions-b-11, now adopted and passing); the survivor rules for connect and merge (F-actions-a-5, F-actions-b-1 to -3); the summary of a point that becomes a vertex (F-core-8); the neighbours not re-validated after a deletion (F-core-9); reverse keeping every part of a direction and leaving `side` of a waiting aid, `railway:turnout_side` and `red_turn:*` alone, orthogonalize keeping a duplicate vertex, and `toOSM` on a string that is not an id (rows 1, 2, 3 and 10 of this table before, fixed in 72bd175).

## 4. Decisions waiting for Tobias

Replaced on 2026-10-13 (evening) by the answers in [ADR 0009](../adr/0009-decisions-of-2026-10-13.md) and the "Later the same day" part of `docs/build-out/steps.md`. Each item below is one line: the answer and where it is.

Answered (24 of 25): items 1, 2, 3, 4, 6, 7, 8, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24 are in the ADR table. Items 9 (restore the last map position), 10 (minimum camera zoom), 11 (taginfo suggestions) and 25 (the Radnetz proposals, confirmed for `apps/maid-bicycle`) are answered in the ADR's text. Answered items are not repeated here; the ADR is the record.

Still unanswered:

5. **Trimming of `description`, `note` and `fixme`** in the editor (F-util-2, bug 16). ADR 0009 item 5 decides a different question: long values are never cut silently. The trimming the editor does today (`packages/ui/src/inspector/logic.ts:19`) is not decided. Options as before: keep as typed, as iD and the upload do, or trim as the editor does today.

Decided, not built yet (the decision is recorded, the work is open): item 7 (field defaults: follow iD, in work), item 13 (Wikidata and Wikipedia fields, open), item 14 (restrictions field, open), item 16 ("ignore this issue", open). These are in section 2, not here.

## 5. From the fork (Radnetz Berlin)

From `docs/build-out/radnetz-features.md`, the 36 numbered features by state. "Checked" marks a state confirmed by grep or read on this date; the others come from the commit subjects.

Evening change: feature 21 (measuring tape for width fields) is built in `f7d5431` and checked in `packages/ui/src/inspector/fields.tsx`. Feature 3 (favourite presets with keys) changed too: the keys are one modifier and a number of any length (decision 8). The other rows are unchanged.

| State | Features (fork numbers) |
| --- | --- |
| Done in Maid | 1 backgrounds (D1); 3 favourite presets with keys (decided yes); 4 data layers (D3); 5 lenses (D5); 12 read-only categories; 15 preset changes from the config (commit c756bc9, the fork's own changes are D6); 19 and 20 photo field and "Use this photo" (0ef2a8b; several images unverified); 22 access field (c50db0c); 23 compact sidebar; 25 related tags under the field (decided yes); 31 no bottom bar |
| Built, not switched on | 2 traffic sign field (c9f7fa2, "not switched on yet"); 24 surface and smoothness by photo (4c9f6b8, a module not switched on); 7 side indicator and 10 width band (commit 1f5cb67; not seen in a browser) |
| Partly | 30 one pane per job (only the filters flyout); 34 URL parameters (`map`, `id`, `filters`) |
| Done since the morning | 21 measuring tape for width fields (f7d5431; the magnifier in 6f2f871) |
| Proposal yes, not built | 8 TILDA bike infrastructure section and 32 TILDA checklist (together); 17 extract a side into its own way; 18 Mapillary layer with age colours (unverified); 27 traffic sign fields for ways (after 2); 28 merge cycleway and footway; 36 infra3D links (checked: nothing in the code) |
| Later | 6 way as a table; 9 QA rules from TILDA and infraVelo; 26 Mapillary traffic signs; 29 internal notes (needs the TILDA login); 33 "I checked this" (needs the account); 35 progress tracking for data layer lines; 5b Radnetz QA lens (yes, with D5) |
| Decided no | 11 live edits of others (Tobias, 2026-10-13); 13 labels under toolbar buttons (Tobias, 2026-10-13); 14 Mapillary image from the field (replaced by 19); 16 data index (stays a document) |

## 6. Not applicable, and why

Counts from the reports. Total 183.

| Reason | Count | Covers |
| --- | --- | --- |
| SVG and DOM: elements, classes, removing a DOM path, the toggle of a panel's class | 24 | svg (areas 3, lines 5, points 1, icon 2, osm 2, layers 3, svg 2, tag classes 4, removal 1, toggle 1) |
| Street imagery services (tests of the `@osm-editor-kit/street-imagery*` packages, not Maid's) | 46 | kartaview 9, mapillary 11, panoramax 11, streetside 7, vegbilder 8. Maid has Panoramax and Mapillary only (product choice) |
| iD's service object and caches | 11 | services (7 and 4) |
| Tile maths and URL templates (ELI builds the raster source), overzoom switch, D3 tile layer, MapLibre canvas, D3 event dispatch | 11 | renderer and services (5, 1, 2, 1, 2) |
| Core: copy-on-write graph API; undo stack replaced by staging and commit; iD's saved-history formats; localStorage migration; asset paths; file fetcher; validator promise | 44 | core: 9, 9, 11, 2, 7, 5, 1 |
| Keybinding mechanics, encrypted values, D3 rebind, localStorage session mutex, extent length | 26 | geo-util: 10, 5, 1, 9, 1 (the journal's Web Lock covers the mutex case) |
| D3 widget mechanics (constructor, sections, class names, DOM placement) | 11 | ui (the rest of its 14) |
| Backspace dismisses a dialog (a choice; see D18); flash messages (open, see D19) | 3 | ui |
| SVG hover classes | 3 | operations-modes-behavior |
| The `v` change stamp (session-wide counter, not per entity) | 2 | osm |
| A preset collection object with positions (searches return arrays) | 2 | presets |

Also: the walkthrough (iD's tutorial): not doing, decided 2026-10-12.

Note on item "Backspace dismisses a dialog": decision 18 is answered (no, Backspace deletes text). The "flash messages" item is answered too: toasts are built (decision 19).

## 7. Stale documents

Worked through on 2026-10-13 (not yet committed). The rows that were fully corrected were removed; what is still open:

| Document | What is still stale |
| --- | --- |
| `docs/research/id-tests/inventory.md` | The `core/localizer.ts` row says 10 tests. A grep finds 9 `it(` lines (unverified, 2026-10-13). Evening: not re-checked. The localizer file in `packages/model/test/id/util/localizer.test.ts` has twelve todo titles. |
| `packages/presets/README.md` (outside `docs/`, not edited) | Still does not mention field defaults or the field-key rules of `applyPreset`. Its "search is not ported" line is gone. Evening: `presets.ts:5` still says recents, categories and addable presets are not ported. |
| `docs/research/id-tests/ui.md` | The tsc error at `packages/validation/src/id-validator.test.ts:79` is unverified (2026-10-13): that file has no `it.todo` now. Evening: not re-checked. |

## 8. Beyond iD

What the day added that iD does not have. Each line names a file or a commit that exists; checked on 2026-10-13 (evening).

- **Turning the map:** Alt or Control with a drag on open map, Shift with the arrows in 2.5-degree steps, two fingers on a touch screen, and a compass key N (be55541; `packages/shell/src/url/bearing.ts`). Tilting is not built.
- **Tags sheet with paste:** a grid of key and value rows; paste of `key=value` lines, copying rows, typing a value for several features at once (b7535df, 8d69cd8, d0d7c6d; `packages/ui/src/sheet/clipboard.ts`).
- **Measuring tool with its magnifier:** a "Measure on the map" button on each width field; two clicks on the map; a lens beside the pointer shows the aerial image at the click point (f7d5431, 6f2f871; `packages/renderer/src/measure.ts`).
- **Favourites by number:** one modifier key and a number of any length, 39 or 888 (5251d50; `packages/shell/src/favourites-keys.ts`).
- **Three states of filters:** editable, read-only or hidden; the URL keeps what differs (B7; `packages/filters/`).
- **Custom backgrounds list:** add, name, edit and delete from a z/x/y template; a background from a link holds for one visit (05afc8b, 3bb1edd; `packages/module-imagery/src/custom.ts`).
- **Imagery series as date buttons:** one row per series, its dates as buttons (69647e2; `packages/module-imagery/src/ImageryPanel.tsx`).
- **Parking editor:** quick buttons, side lines, the restriction field, nine validation rules, three operations (f488630, 8b2a72d; `packages/module-parking/src/`, `apps/maid-parking`).
- **Apps from one repo:** `apps/maid` (5173), `apps/maid-bicycle` (5176), `apps/maid-parking` (5177); one shell package (a1eb73e, a383355, f488630).
- **Edit journal:** unsaved edits kept in the browser (IndexedDB), restored after a reload with a dialog that says what it restores (C1; `packages/journal/`).

## 9. Rapid

There is no test-by-test comparison with Rapid. What was compared with Rapid during the day, in five lines:

1. **Data model base:** `packages/model` is ported from Rapid 3 (its README). Maid departs from Rapid where it is faster: geometry is computed on first access, not on load (A1). The performance numbers against Rapid are in `docs/research/performance-2026-10-13.md`.
2. **Zoom behaviour:** load from zoom 16, loaded data drawn down to zoom 12, the camera stops at the world view, editing below the load zoom allowed (`docs/research/zoom-study.md`; 56a497f).
3. **Turning the map:** Alt or Control with a drag, Shift with the arrows in 2.5-degree steps, as Rapid (`docs/research/rotate-and-tilt.md`; be55541).
4. **"Too large" exemptions:** a feature refused when less than 80 % is in view, and features created in this session and not yet saved are exempt, as in Rapid, with no power-user switch (`docs/build-out/steps.md`, Part F, and ADR 0009 "Later the same day"; 5251d50, 15a52b6).
5. **Save flow:** after an upload the map loads again after 2.5 seconds, the wait copied from iD and Rapid (`docs/build-out/steps.md`, Part F; dce9e86). The wait may be too short for the server (open).

