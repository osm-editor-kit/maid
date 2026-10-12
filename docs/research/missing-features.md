# Maid: what is still missing

Date: 2026-10-13. Commit: `db9b114` (HEAD). The working tree had uncommitted changes when this list was written (`packages/ui/src/inspector/fields.tsx` at the start, `tools/bench/interactions-check.ts` later). They were not read; a row that depends on them is marked "unverified".

Legend. **checked**: looked at in the code on this date (grep or read). **report**: taken from the report's state and not re-checked. **unverified**: could not tell. Feature ids (`F-…`) are the ids of the area reports in `docs/research/id-tests/`, `F-…` from the other documents are named in the row. Sizes: S about an hour, M half a day, L more.

## 1. Summary numbers

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
- The code has 349 `it.todo(` lines: `packages/model` 183, `packages/validation` 61, `packages/ui` 46, `apps/maid` 18, `packages/presets` 15, `packages/renderer` 14, `packages/filters` 9, `packages/operations` 2, `packages/core` 1. The reports say 478 todo. The difference runs both ways: iD tests that a report counts as todo but that have no `it.todo` line yet (svg-renderer-services: 139 in its table, 23 todo lines in its folders; operations-modes-behavior: 27 in its table, 7 in its run line), and loops that run more cases than their one `it(` line (node.js, radio.ts). The reports are the list; the line count is only a check.

## 2. Still missing, by theme

Columns: what a mapper cannot do or what goes wrong · where it came from · iD tests waiting for it · size · needs.

### A. Editing on the map

| Gap | From | iD tests | Size | Needs |
| --- | --- | --- | --- | --- |
| No midpoint handles on the selected way: no node can be added between two nodes by dragging a handle | F-svg-2; interactions gap 5 (checked: no handle is drawn; `id-midpoints.test.ts` todo) | 5 | M | renderer and engine |
| A double click on a way adds no node (the double click only zooms in browse) | interactions gap 5 (checked: `doubleClickZoom` only, `MapView.tsx:372`) | 0 counted | S | MapView, `actionAddMidpoint` |
| No lasso: Shift-drag does not select what a box covers | F-beh-3; interactions gap 9 (checked: no lasso code) | 1 | M | renderer and MapView |
| No vertex and way navigation keys: `[` `]` `{` `}`, Ctrl+↑ parent, Ctrl+↓ child, `\` next parent | F-mode-1 (8); interactions 14 (checked: not in `useShortcuts.ts`) | 8 | M | parent and child lookup in the model |
| `Z` does not zoom to the selection | interactions 15 (checked) | 0 counted | S | map fit |
| Shift+arrows do not nudge, Shift+`+`/`-` do not scale | interactions 16 (checked) | 0 counted | M | the move operation (in the model) |
| `F` does not follow a line while drawing | interactions 18 (checked) | 0 counted | M | draw mode |
| Alt does not suppress hover, and hover does not highlight all members of a relation | F-beh-1 (4), F-beh-2 (1) | 5 | S | renderer, shortcuts |
| A point dragged to the edge of the map cannot be nudged inwards while drawing | F-geo-3 (9); snapping §1.4 "map nudge" | 9 | M | renderer or ui |
| Dragging a node onto its own way: no "nope" segment and no self-intersection check | snapping §1.4 (report) | 0 counted | M | model `hasInvalidGeometry` |
| One cursor for all features and modes (iD has nine) | F-renderer-5 (report) | 9 | S | MapView, engine pick |
| Geometry helpers for drawing: nearest edge of a way, do lines cross | F-geo-1 (8), F-geo-2 (4) | 12 | M | `packages/model/src/geo` |
| Measuring tape for width fields | radnetz 21 (decided "build now"); steps Part E (checked: no measuring tool in the field code) | 0 | M | field button and map tool |
| Rotate, scale and move bend the neighbouring ways: shared nodes are moved in place | snapping §2.3 item 2 (checked: `transform.ts:110` uses `actionMoveNode`) | 0 counted | M | `actionMove` exists |

### B. Operations and actions (the edit menu)

| Gap | From | iD tests | Size | Needs |
| --- | --- | --- | --- | --- |
| Circularize: vertex count by size (16 new nodes on a four-corner building at 10 to 100 m) | F-actions-a-2 (1); snapping §2.3 item 3 (measured) | 1 | M | blocked: Rapid's test expects 21 nodes; see D1 |
| Circularize at t = 0 leaves the way in place in Rapid, iD inserts vertices | F-actions-a-3 (1) | 1 | S | decision D1 |
| Circularize: open ways are joined into a loop first (needs a temporary way) | F-ops-1 (2) | 2 | M | `osmJoinWays` plus a temporary way id |
| Reverse: a direction with `;` values loses data (see §3) | F-actions-b-23 (2) | 2 | S | a fix in `reverse.ts`; D21 |
| Reverse: side values on cyclist waiting aids and turnouts, and `red_turn:*` keys are renamed | F-actions-b-21 (2), -22 (1) | 3 | S | decision D21 |
| Reverse: a directionless node gets its preset's direction key | F-actions-b-20 (4) | 4 | M | preset lookup passed in as an option |
| Orthogonalize: keeps a vertex at the same place as its neighbour (see §3) | F-actions-b-12 (1) | 1 | S | `orthogonalize.ts`, around line 181 |
| Split: refuse when a parent relation is incomplete, and a roundabout in a route | F-actions-b-30 (1), -31 (1) | 2 | S | `split.ts` `disabled` |
| Split: a closed way given two nodes is split at those nodes (Maid adds its own antipode) | F-actions-b-32 (1) | 1 | S | `split.ts` |
| Split: line-only tags (`natural=coastline`) stay on the ways; the same for merge_polygon | F-actions-b-33 (1), F-actions-b-4 (1) | 2 | M | the way-only tag list from the tagging schema (unverified whether Maid ships it) |
| Split: the new way's place among route members (dual carriageway, 2 of 5 tests) | F-actions-b-36 (2); F-relations-3 | 2 | M | `add_member.ts` (unverified) |
| Join: summable tags (`step_count`, parking capacity) are added up, not a conflict | F-actions-b-10 (1) | 1 | S | summable tag list next to `isInterestingTag` |
| Discard tags by value: `attribution=x` drops only that value | F-actions-a-1 (1) | 1 | S | `discard_tags.ts` (checked: any truthy entry drops the key) |
| Extract without moving relation membership (iD's option off) | F-actions-a-6 (1) | 1 | S | `extract.ts` |
| Delete: not for a connected hidden way, not for a too large selection | F-ops-2 (report: `connected_to_hidden`, `too_large` left) | 0 counted | M | filters and visible extent in `OperationContext` |
| Model: the side tag in `OsmNode.directions`; sidedness identifier; area of a way; `mergeTags` override | F-osm-6 (7), F-osm-8 (2), F-osm-9 (3), F-osm-5 (1) | 13 | S each | `packages/model/src/data` |
| Model: frozen entities in development builds | F-osm-4 (5) | 5 | S | `OsmEntity.ts` and subclasses |
| Graph: spatial index that follows parent ways and members loaded later | F-core-3 (12) | 12 | L | `packages/model/src/spatial`, `EditHistory._syncCacheFromDiff` |
| Graph: `Difference.extantIDs()`, transient cache per graph, animated edits | F-core-4 (5), F-core-5 (1), F-core-6 (1) | 7 | S to M | F-core-6 was cut from Rapid: decide before building |
| Deprecated tags: no matching of iD's deprecated rules to an entity | F-osm-1 (9) | 9 | M | `deprecated.json` from the tagging schema (in `packages/presets/node_modules`), passed in |
| Debug flags on the editor (for example collision debugging) | F-core-7 (1) | 1 | S | `packages/core/src/editor.ts` |

### C. Relations

| Gap | From | iD tests | Size | Needs |
| --- | --- | --- | --- | --- |
| Member and relation labels have no preset name (only name, ref or type) | relations-vs-id rows 6, 7 | 0 counted | M / S | `packages/presets` |
| "New relation" is not offered in the membership picker | relations-vs-id row 19 | 0 | M | model action (exists) and the picker |
| One missing member cannot be loaded alone (only the whole relation) | relations-vs-id row 2 | 0 | M | engine request per member |
| Members are highlighted with a halo, not iD's outline, and only one level of nesting | relations-vs-id rows 12, 13 | 0 | M | renderer |
| The picker does not show nearby relations first, nor the newest | relations-vs-id row 11 | 1 | M | `joinableRelations` |
| The parent way of a selected vertex is not highlighted as related | relations-vs-id "still behind" | 0 | S | engine |
| A parent relation does not follow members that load later | relations-vs-id row 4; F-core-3 | 4 (+10 in F-core-3) | with F-core-3 | spatial index |
| Route order after a split against the travel direction | F-relations-3 (1); F-actions-b-36 | 1 | M | see B |

### D. Fields and the inspector

| Gap | From | iD tests | Size | Needs |
| --- | --- | --- | --- | --- |
| Combo: the first matching option is completed inline in the typed text | F-ui-1 (14) | 14 | M | `combo-logic.ts`, `Combo.tsx` |
| Combo: Escape cancels with an event, Enter closes the list; the full list when opened untouched | F-ui-2 (2), F-ui-3 (1) | 3 | S | move key decisions into `combo-logic.ts` |
| Combo: order of the options when filtering | F-ui-4 (1) | 1 | S | decision D3 |
| semiCombo: unique values unless the field allows duplicates (and then `addSemi` drops the repeats, see §3) | F-ui-5 (1) | 1 | S | `allowDuplicates` in the field type (`packages/presets`) |
| Multi-selection: fields and placeholders show "Multiple values" when the selected features differ (no such text in the code, checked) | F-ui-6 (3) | 3 | L | inspector for several features |
| Localized: language names ("Deutsch" becomes `de`) | F-ui-9 (4) | 4 | M | language data (licence to check) |
| Localized: the "Add a language" row, and `lang` on the value input | F-ui-8 (1), F-ui-20 (1) | 2 | S | `Localized.tsx` |
| Wikipedia field (text, language, title, Wikidata id, pasted URL) | F-ui-11 (10 plus one iD skip) | 10 | M | decision D13 (network) |
| Wikidata field: plain text today | fields-vs-id §1 | not counted | M | decision D13 (network) |
| Taginfo value suggestions for the combo fields | F-services-12 (20); fields-vs-id §5 | 20 | M | decision D11 |
| Info button (wiki page and Wikidata) | F-services-13 (11); fields-vs-id §5 | 11 | M | decision D12 |
| Restrictions field (writes relations, not tags) | fields-vs-id §3.12, build step 18 | not counted | L | decision D14 |
| Locked fields (brand, network, operator, flag, name) | fields-vs-id build step 17 | not counted | S | unverified |
| Raw tag list: sort rules, "No tags", add form and blur commit live in the components | F-ui-18 (4) | 4 | S | move rules to a logic file |
| Dialogs close by their close button, Escape and their action buttons | F-ui-12 (5, missing check) | 5 | S | browser check |
| Shortcut labels for Shift-only and key-only shortcuts (`⇧A`, `F11`) | F-ui-13 (2) | 2 | S | `apps/maid/src/platform.ts` |
| Inspector: "View on openstreetmap.org" link and the last modified child | F-ui-15 (1) | 1 | S | `Inspector.tsx` |
| Inspector follows the data when the graph changes under the selected entity | F-ui-16 (1, missing check) | 1 | S | unverified |
| Account button shows the display name (today the user id) | F-ui-19 (1, missing check) | 1 | S | `UserButton.tsx` (unverified) |
| Transient notices (flash), and the reason for a refused drop, which no UI shows | ui report (flash, n/a row); snapping §1.4 | 1 | M | decision D19 |
| Custom imagery from a URL template (ELI listing only today) | F-ui-17 (3), F-renderer-6 (7) | 10 | M | `packages/module-imagery` |
| Favourites use fixed keys (4 to 9 and 0) | steps Part E, radnetz 3 | not counted | S | decision D8 |

### E. Presets

| Gap | From | iD tests | Size | Needs |
| --- | --- | --- | --- | --- |
| `matchAllGeometry`: presets that fit every geometry of a multi-selection | F-presets-1 (2) | 2 | S | `packages/presets/src/presets.ts` |
| Addable presets: a list of the presets that may be picked | F-presets-2 (5: 1 in preset, 4 in index) | 5 | M | index and app config |
| `skipFieldDefaults` for `applyPreset` and `unsetTags` | F-presets-3 (1) | 1 | S | decision D7 |
| Preset categories (the tabs of the picker) | F-presets-4 (2) | 2 | M | category data is not in `PresetData` (report) |
| Recent presets and location sets | F-presets-5 (1) | 1 | M | presets index and app storage |
| Custom presets merged into a built index; presets from an external URL | F-presets-6 (2), F-presets-7 (2) | 4 | S; the URL case needs D24 | D24 for the URL case |

### F. Validation

| Gap | From | iD tests | Size | Needs |
| --- | --- | --- | --- | --- |
| crossing_ways: multipolygon members are checked as the relation | F-validations-1 (8) | 8 | M | `rules/crossing-ways.ts` |
| crossing_ways fixes: add bridge, add tunnel, change layer | F-validations-2 (1) | 1 | M | `Fix` in `types.ts` |
| missing_role fixes: set outer or inner, remove the member from the multipolygon | F-validations-3 (no test counted) | 0 | M | membership actions in the model |
| osm_api_limits fix: split a way with too many nodes | F-validations-4 (3) | 3 | M | a split in `packages/operations` |
| impossible_oneway fixes "Continue drawing from start / end" | F-validations-20 (no test counted) | 0 | S to M | a draw mode, which is not a model action |
| almost_junction: searches the ways beyond a road's end only inside the road's box (see §3) | F-validations-21 (8) | 8 | M | a `RuleContext` query (checked: only `waysNear`, `types.ts:38`) |
| "Ignore this issue" on warnings | F-validations-22 (2) | 2 | S | decision D16 |
| mismatched_geometry (rule not built) | F-validations-23 (14) | 14 | L | preset lookup by geometry in `RuleContext` (no presets in `packages/validation`) |
| outdated_tags: deprecated tags (rule not complete) | F-validations-24 (10) | 10 | M | deprecated list passed in (see B) |
| outdated_tags: brand suggestions (NSI) and preset upgrades | F-validations-25 (3) | 3 | L | NSI data, not shipped |
| suspicious_name (rule not built) | F-validations-26 (14) | 14 | M to L | NSI generic names, not shipped |
| Incremental validation of the difference, and idle chunks for a validate-everything run | validation-performance "Open items" | 0 counted | M | none; the worker and WASM question is answered |
| Applicability by entity type: rules are called on every entity | validation-performance "Open items" | 0 counted | S | a `types` field on rules |

### G. Saving, notes and services

| Gap | From | iD tests | Size | Needs |
| --- | --- | --- | --- | --- |
| Rate limit: a 429 or 509 answer stops tile loading and is shown; today the tile is retried on each move (see §3) | F-services-1 (2) (checked: no 429 handling in `packages/renderer`) | 2 | S | `engine.ts` `loadTile`, a notice in `apps/maid` |
| Changeset generator says "Rapid" | F-osm-2 (2) (checked: `OsmChangeset.ts:81`, `:191`) | 2 | S | decision D2 |
| Save flow: changeset comment and hashtags, review of the changes with map highlight, upload progress, conflicts shown in the app | steps C2 (unticked); commits 62d9183, 7472084 (partly built); the model's conflict rules are adopted and passing (merge_remote_changes) | 0 (the UI side is unverified) | M | how far C2 is done is unverified |
| Notes are read-only: no add, comment, close or reopen | F-services-8 (3) | 3 | L | notes write path; only against the development server (AGENTS rule 1) |
| Notes: one note by id, cells already loaded are not asked again, note as a model object | F-services-7 (1), F-services-9 (1, missing check), F-osm-3 (5) | 7 | S to M | `packages/module-notes` |
| The user's own changesets, with comments | F-services-5 (3) | 3 | M | a new view, `osm-api` |
| The API's capabilities and status (and the imagery blocklists from them) | F-services-10 (2) | 2 | S | `apps/maid/src/auth.ts` or save |
| Web links to an element, its history, its changeset, a user, the changesets page | F-services-6 (9) | 9 | S | next to `noteWebUrl` |
| Load one element that is not in view (relation members, parents); older versions of an element | F-services-3 (3), F-services-4 (3) | 6 | M | engine method; a history view for versions |
| Tile loading rules have no test: only the missing tiles, centre first, no load below the minimum zoom | F-services-2 (3, missing check) | 3 | S | `engine.ts`; the tile maths in a function |
| Place search and the country of a position (Nominatim) | F-services-11 (5) | 5 | M | Nominatim is OSM infrastructure (AGENTS rule 1): a fixture or a decision first |
| MapCSS rules from the Map Rules service | F-services-14 (29) | 29 | L | decision D15 |

### H. Data layers and imagery

| Gap | From | iD tests | Size | Needs |
| --- | --- | --- | --- | --- |
| GPX and KML files as data layers (GeoJSON only) | F-svg-3 (2) | 2 | M | `packages/module-data-layers` |
| Labels for the features of a data layer, with a switch | F-svg-4 (2) | 2 | S | `module-data-layers`, `layers.ts` |
| Street photos: the open photo is not kept in the URL | street-imagery-vs-mapillary (table row, "not done") | not counted | M | `apps/maid/src/url/params.ts` (unverified) |
| Street photo layer: age colours, own users, the selected way's images (radnetz 18) | radnetz 18 | not counted | M | unverified |

Not planned (steps "Not planned yet"): translations of the editor, turn restrictions, GPX in general, measurement and history panels, keyboard shortcut help, the published npm packages. Not doing: the walkthrough (decided 2026-10-12).

### I. Display

| Gap | From | iD tests | Size | Needs |
| --- | --- | --- | --- | --- |
| Areas are not stacked by size, smaller above larger | F-svg-1 (4) | 4 | M | `renderer/src/layers.ts`, `build.ts` |
| A closed barrier way keeps its fill in Maid, iD outlines it only | F-svg-5 (1) | 1 | S | `build.ts` `areaFeature` |
| Per-category counts of the features in view (the filter panel shows none) | F-features-1 (1) | 1 | M | `packages/filters`, `packages/renderer` |
| Auto-hide of a category with too many features in view, the threshold doubles with the view | F-features-2 (2) | 2 | M | filters state and renderer count |
| Features that are selected or edited stay visible while their category is hidden | F-features-3 (1) | 1 | S to M | renderer, engine |
| Untagged members of a multipolygon take the category of the relation | F-features-5 (4) | 4 | M | the relation in the filter input |
| Labels: a feature's name, ref, route and address, not only the house number | F-util-9 (24) | 24 | M | `packages/model/src/util`; the label in `renderer/src/build.ts` |
| Minimum camera zoom (Maid lets the camera go to 0 and shows "Zoom in to load data") | F-renderer-1 (2) | 2 | S | decision D10 |
| Overlay imagery is never hidden above its maximum zoom | svg-renderer-services differences | 0 | S | a difference by design (ELI's maximum zoom is not a limit); no decision recorded |
| Missing checks on the map view: move reported, zoom in and out steps, bounds and animated move | F-renderer-2 (2), -3 (2), -4 (2) | 6 | S | `tools/bench` or a unit test |
| Points: pins and house numbers, view cones of points | steps Part E (pin and house numbers built, commits 7a5e7f9, 1a46967; view cones unverified) | 0 | S | unverified |

### J. Localisation and formats

| Gap | From | iD tests | Size | Needs |
| --- | --- | --- | --- | --- |
| `t()` lookup with fallback, localised text in the DOM (no translations) | F-core-1 (5 incl. `localesToUse`) | 5 | L | a localisation package; not planned |
| Number formatting and parsing per locale | F-core-2 (8) | 8 | M | same as F-core-1 |
| Locale fallbacks (`zh-CN` to `zh-Hans-CN`, `zh-Hans`, `zh`) | F-util-13 (12) | 12 | S | `localized-logic.ts` |
| Coordinates as D M SS, z/x/y and x/y; parsing with localised numbers | F-util-3 (13) | 13 | M | `packages/model/src/util` |
| Small utilities: powerset (1), dictionary lookup (2), GeoJSON properties as tags (1), tag diff with context (1), combined tag values (2), edit distance inside a name (6), diacritics as a utility (1), `+` in query strings (2, upstream) | F-util-1, -4, -5, -6, -7, -8, -11, -14 | 16 | S each | `packages/model/src/util`; the upstream one is `@rapid-sdk/util` |
| Geometry: extent split (1), winding order of the polygon and of the smallest rectangle (2, upstream) | F-geo-4 (1), F-geo-5 (2) | 3 | S; upstream | `@rapid-sdk/math` or a wrapper |

### K. Tests that are checks, not features

These are "missing checks" in the reports: the code may already do the thing, but no check or test asserts it. One group, 31 iD tests in all.

- Hash and selection (`F-beh-4` to `-7`): the address bar moves the map (1), the URL follows the map (1), an empty or unknown `id=` selects nothing (2), shift-click on the last selected clears it (2). Maid's `interactions-check` covers the last one only in part.
- Add point (`F-mode-2`, 2): a click adds a point and a click on a point selects it.
- Map view (`F-renderer-2` to `-4`, 6): see the table in I.
- Tile loading (`F-services-2`, 3) and notes cells (`F-services-9`, 1).
- UI (13): access rows (`F-ui-7`), localized rows (`F-ui-8`), dialogs (`F-ui-12`, 5), inspector follows the data (`F-ui-16`), raw tag list (`F-ui-18`, 4), account button (`F-ui-19`).

## 3. Bugs and differences found and not fixed

These are wrong today, not only absent. Evidence and the report that found them.

| # | What is wrong | Evidence | Report |
| --- | --- | --- | --- |
| 1 | Reverse loses data in a direction with `;`: `direction=0;error` becomes `180`, the `;error` is dropped; `N;90` stays unchanged (iD gives `180;error` and `S;270`) | checked: `reverse.ts` ~158 to 170, `parseFloat` of `0;error` is 0, the compass table has no `;` case | actions-b, F-actions-b-23 |
| 2 | Reverse changes `side=right` to `left` on `highway=cyclist_waiting_aid` and on `railway:turnout_side`, and renames `red_turn:right` to `red_turn:left` | actions-b tests (2 and 1, todo) | actions-b, F-actions-b-21, -22; D21 |
| 3 | Orthogonalize deletes a vertex that sits at the same place as its neighbour: a six-node closed way becomes four nodes; measured: an untagged node is deleted | snapping §2.3 item 5 (measured); test `preserves a way's duplicate vertices` (todo) | actions-b, F-actions-b-12; snapping |
| 4 | Rotate, scale and move bend the neighbouring ways (their shared nodes move in place, the way gets no new node) | checked: `transform.ts:110`; measured `w2` bends | snapping §2.3 item 2 |
| 5 | A favourite's tags are not applied when the favourite is added on an existing node; on a line the new vertex is untagged | snapping §1.4 table (report) | snapping §1.4 |
| 6 | A failed tile (429 or 509) is retried on every move, which repeats the requests that caused the limit | checked: no 429 handling in `packages/renderer` | svg-renderer-services, F-services-1 |
| 7 | almost_junction misses a crossing beyond a road's end when it lies outside the road's box | checked: `waysNear` only (`types.ts:38`); the rule's own comment says so | validations, F-validations-21 |
| 8 | Route order after a split: the new way is placed in the wrong position in 2 to 5 cases (dual carriageway) | actions-b, `split.js` route tests | actions-b, F-actions-b-36; relations F-relations-3 |
| 9 | A closed way split at two given nodes is split at its own antipode as well | actions-b, F-actions-b-32 (todo) | actions-b |
| 10 | `OsmEntity.toOSM` drops the first character whatever it is: `toOSM('x5')` gives `5`; iD gives `''` | checked: `OsmEntity.ts:305-307` (`id.slice(1)`); test "returns the empty string for other strings" passes only because of its input | osm, entity.js row |
| 11 | semiCombo on a field that allows duplicates: `addSemi` drops existing repeats on each write | ui differences (F-ui-5) | ui |
| 12 | A feature gets only its first matching filter category: a station is hidden with `rail` while `points` is on (iD keeps it) | svg-renderer-services differences; `default.ts` documents the rule on purpose | svg-renderer-services; D6 |
| 13 | A new (unsaved) feature can be hidden by a filter; iD hides only saved features | report: the builder has no such check (not reproduced) | svg-renderer-services, F-features-4 |
| 14 | Circularize adds 16 new nodes to a four-corner building at 10 to 100 m | snapping §2.3 item 3 (measured) | snapping; F-actions-a-2 |
| 15 | Moving a straight way uniformly inserts a vertex into it (`n-1` in `w1`) | snapping §2.3 item 4 (measured; cause not traced) | snapping; unverified |
| 16 | The editor's `cleanValue` trims `description`, `note` and `fixme`, which iD leaves alone; the upload now keeps them | ui/geo-util differences (F-util-2); `packages/ui/src/inspector/logic.ts` | geo-util; D5 |
| 17 | Extract always moves relation membership to the new node; iD does it only when asked | actions-a, F-actions-a-6 | actions-a |
| 18 | crossing_ways: the "Connect the features" fix adds an untagged node; iD adds connection tags | validations differences | validations |

Fixed since the reports, so not in this table: the join that deleted a collapsed multipolygon's `type=site` parent (F-actions-b-11, now adopted and passing); the survivor rules for connect and merge (F-actions-a-5, F-actions-b-1 to -3); the summary of a point that becomes a vertex (F-core-8); the neighbours not re-validated after a deletion (F-core-9).

## 4. Decisions waiting for Tobias

Each has its options in one line. Where a report gives a recommendation it is marked "rec.".

1. **Circularize at t = 0** (F-actions-a-3). Options: keep Rapid (the way is unchanged at t = 0; Maid today), or iD (vertices inserted at t = 0). Rapid's and iD's tests contradict each other.
2. **Changeset generator name** (F-osm-2). Options: Maid's own name, or keep "Rapid". Rec.: name the editor (Maid).
3. **Order of options in a combo when filtering** (F-ui-4). Options: iD's order, or label-prefix matches first (today).
4. **Emptying a translation's language code** (F-ui-10). Options: remove the translation as iD does, or refuse with a message (today). The report notes the refusal avoids a silent loss.
5. **Trimming of `description`, `note`, `fixme`** in the editor. Options: keep as typed, as iD and the upload do, or trim as the editor does today.
6. **Several categories per feature** (svg differences). Options: first matching category (today), or iD's rule: hidden only when every matching category is hidden. The report calls it a decision, not a test fix.
7. **Field defaults when a preset is picked.** Since `applyPreset` applies them, a picked preset also adds its fields' defaults. Options: keep, or skip them (F-presets-3). The presets report asks Tobias to check this is wanted.
8. **Favourite keys.** Options: keep the seven fixed keys (4 to 9 and 0), or let the person choose.
9. **Restore the last map position on the next visit** (F-beh-8). Options: yes (stored where?), or no. The report asks Tobias. (The background choice was decided in commit 0464be6; it is not this.)
10. **Minimum camera zoom** (F-renderer-1). Options: iD's rule (the camera cannot go below the minimum zoom), or today's (zoom to 0 and "Zoom in to load data").
11. **Taginfo value suggestions** (F-services-12; fields §5). Options: a snapshot of the top values per key, committed and generated once from a bulk extract; no suggestions for the fields without a list; no suggestions at all. Pick one.
12. **Info button** (F-services-13; fields §5). Options: leave it out, or link to the wiki page without fetching it.
13. **Wikidata and Wikipedia fields** (F-ui-11; fields §5). Options: read-only, or only the Q id typed, with no fetch.
14. **Restrictions field scope** (fields §5). Options: decide the scope before the step (relations and the intersection view).
15. **MapCSS rules from the Map Rules service** (F-services-14). Options: skip (Maid's rules are TypeScript), or port selected rules.
16. **"Ignore this issue" on warnings** (F-validations-22). Options: add an ignore list as iD has, or no. The report does not recommend.
17. **Redo label on Windows and Linux** (F-ui-14). Options: show `Ctrl+Y` as iD does, or `Ctrl+Shift+Z` (today; both keys work).
18. **Dismissing dialogs with Backspace** (ui, not applicable). Options: keep the omission, or add it. Rec.: keep (Backspace edits text in fields).
19. **Transient notices (flash)**, also for the reason of a refused drop. Options: build them, or not.
20. **Order of entity ids** (F-util-12). Options: iD's (oldest first, new ones after) or Maid's (newest first, as Rapid's tests assert). The report says a decision is needed first.
21. **Reverse: values and keys that change data** (bugs 1 and 2 in §3). Options: fix in Maid, which departs from Rapid's code, or keep Rapid's behaviour. Rec.: iD's behaviour, as the report judges it.
22. **Writing `it.todo` in this repo.** Bun's types need a body, so each todo is `it.todo(title, () => {})`. Options: adopt that as the convention, or change the test setup. Three reports ask for a convention.
23. **Rate limit** (F-services-1). Options: stop loading and show a notice (the report's view: the right behaviour), or retry on each move (today).
24. **Presets from an external URL** (F-presets-7). Options: not supported, or supported outside automated runs.
25. **Confirm the radnetz proposals** before D6 starts (`radnetz-features.md`: "To be confirmed by Tobias before D6 starts"). The rows still marked "Proposal" are listed in §5.

Not counted as open (decided or answered): the walkthrough (2026-10-12), the survivor rule and the relation fixes in the model, validation speed (the validation-performance report answers it: main thread, no worker, no WASM), the background restore (0464be6), the radnetz rows marked "Tobias, 2026-10-13".

## 5. From the fork (Radnetz Berlin)

From `docs/build-out/radnetz-features.md`, the 36 numbered features by state. "Checked" marks a state confirmed by grep or read on this date; the others come from the commit subjects.

| State | Features (fork numbers) |
| --- | --- |
| Done in Maid | 1 backgrounds (D1); 3 favourite presets with keys (decided yes); 4 data layers (D3); 5 lenses (D5); 12 read-only categories; 15 preset changes from the config (commit c756bc9, the fork's own changes are D6); 19 and 20 photo field and "Use this photo" (0ef2a8b; several images unverified); 22 access field (c50db0c); 23 compact sidebar; 25 related tags under the field (decided yes); 31 no bottom bar |
| Built, not switched on | 2 traffic sign field (c9f7fa2, "not switched on yet"); 24 surface and smoothness by photo (4c9f6b8, a module not switched on); 7 side indicator and 10 width band (commit 1f5cb67; not seen in a browser) |
| Partly | 30 one pane per job (only the filters flyout); 34 URL parameters (`map`, `id`, `filters`) |
| Decided yes, not built | 21 measuring tape for width fields ("build now", checked: none in the code) |
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

## 7. Stale documents

Not corrected here. What is stale, with the evidence.

| Document | What is stale |
| --- | --- |
| `docs/research/id-tests/inventory.md` | Counts `it(` calls only: `localizer.ts` has a 12-row `it.each` that is not counted (the core and util reports say so); the ui `wikipedia.js` `it.skip` and the radio `it.each` are not counted; the osm folder runs more cases than its 406 (node.js runs 61, and its loop of six invalid pairs is one `it`). The core file total is 207 plus 3 from `lib/locale.js` (210 in the core report). |
| `docs/research/id-tests/actions-a.md` | Sum row (41 adopted, 20 todo) does not match its rows (44 and 17). The `change_preset` row (13 todo) is stale: the presets report adopts them. F-actions-a-4 is built. |
| `docs/research/id-tests/actions-b.md` | Sum row says "14 of 18 files, 124 of 349 tests": all 18 rows are written, sum 269 covered, 57 adopted, 23 todo. |
| `docs/research/id-tests/core.md` | Sum row (7 adopted, 35 todo) does not match its rows (9 and 33). F-core-8 and F-core-9 are "built now" in its table, and listed as open bugs in `steps.md`. |
| `docs/research/id-tests/presets.md` | Counts `change_preset` again (93 instead of 80). Its own `packages/presets/README.md` note is out of date: it says search is not ported (it is, with the fuzzy tiers) and does not mention field defaults or the field-key rules of `applyPreset`. |
| `docs/research/id-tests/operations-modes-behavior.md` | "Not finished: the app switch" for Delete (F-ops-2). Unverified now: `apps/maid/src/commands.ts` has no `delete` command of its own any more (only the key label). |
| `docs/research/id-tests/validations.md` | Sum row covers only the first 3 of 14 rows (the table sums to 209: 6, 142, 61, 0). "Not finished" says the new rules are not in `defaultRules`: all 11 are (`packages/validation/src/index.ts:31-44`, commit d8193a8). |
| `docs/research/id-tests/ui.md` | "Maid has no multi-selection yet" (F-ui-6): selecting several features exists (commit 94d1f1b, Shift-click in `MapView.tsx`); the missing part is the inspector's "Multiple values". Also the `tsc` error at `packages/validation/src/id-validator.test.ts:79` is unverified. |
| `docs/research/relations-vs-id.md` | Summary counts predate the map side (commits b4208b4, e9e688c, 0cddca7, 52a3502). Row 27 (merge keeps the first relation) is built (F-actions-b-3). Row 30 (missing role, outdated tags) is partly built (missing_role, commit d8193a8). Row 19 and row 2 are unchanged. |
| `docs/research/interactions-vs-id.md` | Most of the keyboard table says "missing" for things now built: move, rotate, reflect, copy, paste (075ec35); Space, Backspace and Delete while drawing; Escape finishes a drawn way; the arrow keys and `+`/`-` (`useShortcuts.ts`); the `A` continue key; Alt turns snapping off (`MapView.tsx:193`); long press opens the menu (`MapView.tsx` 242 to 259); the right-click menu (`MapContextMenu.tsx`). Ranked gaps 1, 2, 3, 4, 6, 7, 8, 12, 13 and 18 are built. Still open: 5, 9, 14, 15, 16, 17 (partly), and the follow mode. |
| `docs/research/fields-vs-id.md` | Section 1 "Maid today" is stale for most types (check, number, semiCombo, radio, multiCombo, access, address, localized, date, colour now have field components in `packages/ui/src/inspector/fields/`). Section 4 build steps 1 to 15 are largely built. Section 7 bugs: the 255-character cut (`logic.ts:5`), the default check (`logic.ts:193`) and the `default` values (presets report) are fixed or changed; the `multiCombo` key bug is not visible in `fields.tsx` any more (unverified). Section 5 (decisions) is still open. |
| `docs/research/snapping-and-node-preservation.md` | §2.3 item 1 (connect survivor, commit 21b2a90) and item 6 (drop connects, commit b33374f) are built. §1 rows for Alt and for the drop onto a node are built. Items 2 to 5 are still open. |
| `docs/research/validation-performance.md` | Not stale in its answer. Its "Open items" are still open. The steps list asks for the same decision and it is answered here. |
| `docs/research/street-imagery-vs-mapillary.md` | Written from the code, not from a browser; the "not done" for the open photo in the URL is unverified. |
| `docs/build-out/radnetz-features.md` | The "In Maid today" column is stale for: 1, 4, 5 (D1, D3, D5 done per `steps.md`); 15 (preset changes from config, c756bc9); 19 and 20 (0ef2a8b); 22 (c50db0c); 7 and 10 (1f5cb67); 2 and 24 (modules built, not switched on). |
| `docs/build-out/steps.md` (Part E, Part C) | Ticked as open but built: "Times shown local and relative" (bfe6595); "Bugs: point summarised as deleted, neighbours not validated" (F-core-8 and -9 built); "Address field" (c756bc9); "Preset changes from config" (c756bc9); "Direction markers" (229963b, 99cdfb9); "Points: the pin" (7a5e7f9) and "house numbers" (1a46967); "Things on top of each other" (bbda5ba); "Side indicator and width band" (1f5cb67); "Image fields" (0ef2a8b); "Surface and smoothness" (4c9f6b8, not switched on); "Traffic sign field" (c9f7fa2, not switched on); "Relations" (b4208b4 and later). "Validation speed" is answered by its report. Part C "C2 login and upload" is unticked but partly built (62d9183, 7472084). Part E "Waiting for a decision" still lists the join bug, which is fixed. |
