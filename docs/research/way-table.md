# Way table: two existing versions and a proposal for Maid

Date: 2026-10-15. Status: research and proposal. Nothing is built. No code, no tests, no builds, no browser and no network were used. The two source repositories were read only.

Sources, read in code:

- Radnetz Berlin iD fork (branch `radnetz-berlin`): `modules/way_table/chain.ts`, `modules/way_table/tag_rows.ts`, `modules/ui/way_table_panel.ts`, `css/86_way_table_panel.css`, and `WORKDOC.md` (feature 6 and the dated entries).
- Street space editor (monorepo, formerly "parking lanes"): `app/src/modes/table/` (all domain files, `TableModePanel.tsx`, `components/TagDiffTable.tsx`, `components/PropagateSuggestions.tsx`, `use-table-mode-handlers.ts`, `map/table-group-ui-store.ts`), `packages/osm-way-chain/src/` (chain walk, neighbour matching, direction, mirror tags, highway filter, tests listed), `app/src/shell/map/use-way-chain-builder.ts`, `app/src/modes/lanes/domain/find-dual-carriageway-sibling.ts` (first 140 lines), `app/messages/en.json` (table strings).
- osm-way-as-table-ui: `package.json` and `NOTE.md` only. Its source was not read.
- Maid: the files named in section 3.

Marks: a claim without a mark was read in code. "(inferred)" marks my conclusion or a proposal that was not run or measured.

Repository paths in this file are relative to each repository. No disk paths are used.

## 1. Summary

- Two versions exist. The Radnetz iD fork has a read-only table in a bottom dock: up to 2 ways per side, colour per cell (changed, added, removed).
- The street space editor has an editable table: up to 5 ways per side, groups that fold, a "use from left / right" button per centre cell, and a "propagate from centre" list.
- Neither compares buildings (inferred from the table's code, which works on highway chains only). Neither handles a multi-selection (both read one selected way). Neither has a conflict state.
- The street space editor walks only road-like highways. The iD fork walks any way of the same kind, so it also works for paths, rivers and railways. Maid should walk any kind, with a filter per app.
- The street space editor has a write bug for direction-dependent values on reversed neighbours (section 2.6, item 1). Maid must not copy that part.
- Proposal: a module `module-way-table` with a dock tab "Way table". Columns are the chain, or the selection for several features. Rows are tags, in groups. Cells have six states, two marks and a legend. Edits go through the editor history, one undo step per gesture. "Carry to the next N ways" shows a preview first.
- Twelve steps of about one hour each, with a test for Tobias after each (section 7). Step 0 is a set of decisions (section 6).

## 2. The two versions

### 2.1 How the chain is found

| Topic | Radnetz iD fork | Street space editor |
| --- | --- | --- |
| Source | `modules/way_table/chain.ts` (216 lines) | `packages/osm-way-chain/src/traversal/buildChain.ts`, `neighborMatch.ts`, `direction.ts`; used by `use-way-chain-builder.ts` |
| Walk | From the centre: backward from its first node, forward from its last node | Same |
| Candidates at an end node | Ways that have this node as one of their two end nodes, not yet in the chain. A node in the middle of a way does not count | Same |
| Same kind | Kind keys: `highway`, `cycleway`, `footway`, `path`, `railway`, `waterway`. Key and value must match. If any candidate has the same kind, only those count | Same kind keys. Same rule |
| One candidate | Taken | Taken |
| Several candidates | Score: +100 same kind, +50 same `name`, +30 same `ref`. The best score wins | Same score |
| Tie | Any tie is a junction | A tie is a junction only if the top score is below 100. Two same-kind ways with no name match score 100 each: the first in the list is taken. This is arbitrary (read; inferred from the code) |
| Junction handling | A chooser: one button per candidate, with name and id. The choice is kept per node until the selection leaves the chain | `pendingJunctions` and a navigator; the user picks, and the chain is extended from there |
| Limit per side | 2 (`DEFAULT_MAX_PER_SIDE`). The panel passes no value, so 2 | 5 (`DEFAULT_MAX_PER_SIDE` in the package; `TABLE_CHAIN_MAX_PER_SIDE` in the table). The display window is 5 on each side |
| Ways considered | Any way (no kind filter) | Only ways that pass the street space editor's road selection (`matchesStreetSpaceWaySegment`, passed as `candidateFilter`) |
| Orientation of a neighbour | Reversed when both ways end at the shared node on the same side. Then the node order is flipped and `:left`/`:right` keys are swapped | Same rule. Then `mirrorTags` runs: directional keys, oneway values, bare `sidewalk`/`cycleway`/`busway` values, lanes and turn-lane pipes, placement values (see 2.2) |
| Loop guard | A `seen` set of ways (the centre and each added way) | Same |
| Data used | The iD graph (`parentWays`) | A session graph adapter over the loaded data |
| Column order | The direction of the selected way: earlier ways left, later ways right. A map-order variant was tried on 2026-10-03 and removed on 2026-10-12 (WORKDOC). The reason is not written there | The chain order |
| Dual carriageway | None | The opposite branch is shown beside its pair. The centre needs `dual_carriageway=yes` and `oneway` (tag-gated). A candidate qualifies if it is also dual oneway or has the same name. Antiparallel within 30 degrees, 2 to 30 m apart, overlap of at least 5 m. WORKDOC says "found by geometry": the code also needs the tag |

Other facts:

- WORKDOC names `mirrorChain` and `runsAgainstReadingOrder` in `chain.ts`. Neither exists in the file. The 2026-10-12 entry removed the map order, so the WORKDOC text is stale.
- Both walks stop at the first unclear junction or the limit. Neither checks the angle at a junction. A T-junction with two roads of the same kind is a tie.

### 2.2 Tags, rows and groups

| Topic | Radnetz iD fork | Street space editor |
| --- | --- | --- |
| Rows | Union of keys over the chain (`tag_rows.ts`) | Union of keys over the window, plus dual siblings |
| Order | Preset keys first (the centre's preset fields and more-fields), then A to Z | Groups in a fixed order, then A to Z inside a group |
| Groups | None | `centerline`; `bikelane` (`cycleway*`, `bicycle*`, `source:cycleway`, `note:cycleway`); `sidewalk` (`sidewalk*`, `foot*`, and the source and note forms). Everything else is `centerline`. All open by default. Open state is kept across ways |
| Key label | Raw key, monospace | Raw key, monospace. Long keys are shortened in the middle when the column is narrow; a `:conditional` suffix is kept; the full key is the tooltip |
| Direction marks | A `⇄` after the name of a reversed way in its column header. Keys swapped for display | A small info mark on a flipped key shows the original key |
| Keys removed in this session | Keep their row (`removedKeys`) | Not seen |
| Changes in this session | A cell that differs from the downloaded base gets the `edited` class (`history.base()`) | Not seen |

### 2.3 Colour states

| Meaning | Radnetz iD fork (CSS) | Street space editor (TSX) |
| --- | --- | --- |
| The selected way (reference) | Accent tint on the column and the header | Blue-50 column; blue-100 header |
| Same value | No class | `unchanged`: no fill |
| Both have the key, values differ | Yellow tint (`#ffc400` at 30 %) | `changed`: amber-100 |
| Only this way has the key | Green tint (`#3fc41e` at 26 %) | `added`: green-100 |
| The reference has the key, this way lacks it | Red tint (`#ff503c` at 28 %) | `removed`: red-100, on the neighbour's cell |
| The reference lacks the key | Empty (no fill) | `missing`: zinc-50 fill, zinc-400 text, on the centre cell only |
| Neither has the key | Empty | Blank cell, no fill |
| Changed in this session | Violet tint on the row and the cell | Not seen |
| Conflict | None | None |
| Legend | Not seen | Three chips: changed, added, removed |
| Side marker | None | A round marker on the column boundary, showing left or right of the centre |

Neither version uses a second cue (icon or shape) besides colour and the value text. Both show the value text, so a colour-blind reader can still read the values.

### 2.4 Suggestions and editing

| Topic | Radnetz iD fork | Street space editor |
| --- | --- | --- |
| Editing | Read-only in v1. Raw tag editing is listed as v2 in WORKDOC | Only the centre column is editable. Neighbour columns are read-only |
| Edit path | None | `applyTableTagToWay` swaps the key back for a reversed way, then writes the value as shown. The result goes to `useOsmChangeHandler('table')` |
| Yes/no values | None | A radio group for yes/no values |
| Copy from a neighbour | None | On each centre cell, two buttons: "use value from left" and "use value from right". Disabled when the value is already the same |
| Clear | None | A trash button on hover. Clearing removes the key |
| Propagate | None | "Propagate from center": one line per key the centre has. It sets the centre's value on every other column whose value differs, including missing values, and (inferred) the dual siblings too. One Apply button per line. No preview, no confirmation |
| Login | None | Editing is off until the user is logged in (`LoginCallout`) |
| Walking the chain | Click a column header; previous and next buttons | Chevron buttons and a horizontal chain-walk hook (keys not read) |

### 2.5 Map link and dock

| Topic | Radnetz iD fork | Street space editor |
| --- | --- | --- |
| Place | Bottom dock, a child of the main content. Fixed height, stored. Minimum 80 px, at most 70 % of the editor height. Toggle with `K` or a button in the map corner | Its own mode, not a dock. Map click clears the table |
| Column hover to map | Pointer enter highlights the way (`utilHighlightEntities`) | None |
| Column click | Selects the way and moves the map so the way is centred above the dock (`flyTo`) | Selects the way and recentres the chain |
| Map colours | Not seen | Previous and next neighbours have their own line colours (`lanesPrevNeighborColor`, `lanesNextNeighborColor`) |
| Empty state | A hint while the dock is open and nothing is selected | A prompt to click a way |

### 2.6 Gaps and bugs found

1. Street space editor, write bug (read in code; not run). The display values of a reversed neighbour are mirrored by `mirrorTags` in `orientNeighbor`. `applyTableTagToWay` and `applySuggestion` swap only the key, not the value. So editing or propagating `oneway`, `placement`, a turn-lane or lanes value, or a bare `cycleway=left` on a reversed neighbour writes the mirrored value to the way. A test with a reversed neighbour would show it.
2. The two tie rules differ (section 2.1). The street space editor takes an arbitrary way when two same-kind ways score 100.
3. The street space editor's propagate writes over different values in one click, with no preview.
4. The WORKDOC names functions that the code does not have (section 2.1).
5. The WORKDOC describes the dual-carriageway rule as geometry only. The code also needs the tag on the centre.
6. The iD fork's `chain.ts` says it is ported from osm-way-as-table-ui. That repository has no licence file and no licence field in `package.json` (section 5.3).

### 2.7 Comparison

| Topic | Radnetz iD fork | Street space editor | Maid proposal |
| --- | --- | --- | --- |
| Where | Bottom dock tab | Own mode | Dock tab |
| Edit | No | Centre column only | Every column (not read-only ones) |
| Ways per side | 2 | 5 | 3 (to be decided) |
| Which ways continue | Any kind | Road-like only | Same kind; filter per app |
| Ties | Ask | First in list (score 100) | Ask |
| Groups | None | Three | Nine, with empty ones hidden |
| Colour states | 5 | 5 (plus one centre state) | 8 plus 2 optional |
| Suggestions | None | Propagate (no preview) | Set on all; carry to next N (with preview) |
| Buildings | No | No | Yes, by shared edge |
| Several features | No | No | Yes |
| Map link | Hover and click | None | Hover both ways |
| Tests in source | Not seen | Yes (`osm-way-chain` tests) | Yes, with ported cases |

### 2.8 What to take and what to leave

Take (ideas and code; licences in section 5.3):

- Chain rules that both versions share: endpoints only, same kind first, score for name and ref, a `seen` set, the orientation rule.
- Column order by the selected way's direction, with the `⇄` mark.
- The tests of `osm-way-chain` (`buildChain`, `neighborMatch`, `direction`) as the start of Maid's chain tests.
- The directional key mirror (`:left`/`:right`, `:forward`/`:backward`, `:start`/`:end`) from `mirror-tags.ts`.
- Groups by key prefix, and preset keys first (iD fork).
- Keys removed in this session keep their row (iD fork).
- Column header as the click and hover target (iD fork). For the centring, use Maid's `engine.fitTo` instead of porting the `flyTo` maths.
- Yes/no values as a radio group (street space editor; an idea, not code).
- Dual siblings: a later version (v2).

Leave:

- One-click overwrite of different values without a preview.
- The login gate on editing. Maid edits are local; login is for saving (inferred from `steps.md`, which puts login in step C2).
- The arbitrary choice on a tie.
- A road-only filter as the default.
- Showing mirrored values without a write-back mirror.

## 3. Maid pieces to build on

Read in code unless marked.

- Dock: `packages/shell/src/components/BottomDock.tsx` builds one tab per `dock.view`, in registration order, then "Data". Each view gets `editor` and `select` (`DockViewProps` in `packages/ui/src/extension-points.ts`).
- The dock renders only the selected tab's content (`packages/ui/src/Dock.tsx`, around line 116). It is closed at first (`defaultOpen = false`). Its height is resizable and stored under `dock-height` (initial 224 px, minimum 120 px).
- `BottomDock` calls `useSelection()`, so it re-renders on each selection change. A dock view does not get the selection itself.
- Validation registers a dock view (`packages/shell/src/modules/validation.tsx`). Notes register one too (`packages/module-notes/src/notes.tsx`), and the notes dock reads the chosen note through its own point `note.selection`.
- Sheet: `packages/ui/src/sheet/`. `types.ts` is the contract. Columns (`SheetColumn`): id, header text, width, `role: 'rowheader'`, `readOnly`, `validate`, `suggest`. Rows (`SheetRow`): id, label, cells by column id, `readOnly`. `onChange` gets one `SheetBatch` per gesture (`cause`, `changes`). `rowActions` puts buttons at a row's end; the comment names "fill row" as an example. `onUndo` and `onRedo` are props. `showHeader` hides the header visually.
- Sheet tones are a fixed set: `default | muted | differs | changed`. In `cell-look.ts`, `differs` is amber text and `changed` is an emerald wash. These names do not match the states in section 4.4.
- Sheet header: text only (`header: string`).
- Sheet design: one `<input>` per cell; keys inside the grid, so the map shortcuts do not reach it (`docs/research/sheet-design.md`).
- Cell length: 255 characters (`MAX_VALUE_LENGTH`, with a counter in `cell-look.ts`).
- Tags sheet for several features: `TagSheet` with `combined`, `changeCombinedModel`, and `TagSheetChange { set, remove, rename }`. `MultiInspector.tsx` writes through `engine.changeTags` (one undo step) or `engine.changeTagsEach` (each feature's own values).
- Engine (`packages/renderer/src/engine.ts`): `combinedTagsOf(ids)`, `changeTags(ids, {set, remove}, label)`, `changeTagsEach(changes, label)`, `setTags(id, tags)`, `setHover(id)`, `setRelated(ids)` (a calmer halo, used by the inspector's relation rows), `hovered()`, `subscribe`, `fitTo(ids)`, `nearby(id, metres)` (memoised, bounding-box index).
- `planChangeTagsEach` (`packages/renderer/src/change-tags.ts`): refuses the whole batch if an id is missing or any feature is read-only. One action per feature that changes. Empty `set` values are dropped, so clearing a key needs `remove`.
- History: a module writes with `editor.history.perform(...actions)` and then `editor.history.commit({ annotation, selectedIDs })`. The turn-restrictions module does this (`packages/module-turn-restrictions/src/TurnRestrictionsSection.tsx`). The engine listens to `stagingchange` (`engine.ts`, the constructor). So one undo step needs no engine handle.
- Graph: `graph.parentWays(node)` is used in `packages/model/src/actions/sync_crossing_tags.ts`.
- Presets: `Field` has `label` (English, resolved), `key`, `keys`, and `type` (`packages/presets/src/types.ts`). Preset fields and more-fields are listed near line 169 of the same file.
- Validation: an `Issue` has `entityIds`, `loc`, `fixes` and a free-form `data`. It has no tag key field (`packages/validation/src/types.ts`).
- Multi-selection: built on 2026-10-13 (`docs/research/multi-selection.md`). Several features: one undo step, read-only refusal, combined tags.
- Radnetz features: row 6 "Way-as-table" is "a dock view | nothing | later" (`docs/build-out/radnetz-features.md`). The way table is not in `docs/build-out/steps.md`.

## 4. Proposed UX

Terms: the reference is the selected way (or the first selected feature). A state is what one cell shows compared with the reference.

### 4.1 Opening and following the selection

- A tab "Way table" in the bottom dock, after the module views. The dock stays closed at first.
- The tab shows the table of the selected way. A change of selection rebuilds it.
- Nothing is computed while the dock is closed or another tab is open (the dock renders only the selected tab).
- Opening the tab does not change the selection or the map.
- No selection, a node, or a relation: a hint. "Select a way to compare it with its neighbours."
- Height: the dock's shared resize. The default of 224 px shows about six rows (inferred). The table scrolls inside its groups.

### 4.2 Columns

- The chain runs left to right: earlier ways on the left, later ways on the right, in the direction of the selected way.
- The reference column is blue. It is always in the middle.
- Each header shows the name (or the highway value when there is no name), the way id in small monospace, and `⇄` when the way is reversed.
- A click on a header selects that way. Enter selects it when the header has focus.
- Previous and next buttons sit in the corner cell, as in the iD fork.
- Limit per side: see section 6, question 2. The user can show more (up to 9 per side) with a button.
- A junction chooser sits above the grid (4.11).

### 4.3 Rows and groups

Groups, in this order. A group with no key present is hidden. Each group folds, and shows how many rows differ.

| Group | Keys (prefix, or exact) |
| --- | --- |
| Name | `name`, `ref`, `alt_name`, `official_name`, `old_name`, `int_name`, `source:name` |
| Road | `highway`, `surface`, `smoothness`, `maxspeed*`, `lit`, `oneway*`, `access*`, `bridge`, `tunnel`, `layer`, `width`, `incline`, `junction` |
| Lanes | `lanes*`, `*:lanes*`, `turn:lanes*`, `change:lanes*`, `placement*` |
| Parking | `parking*` |
| Cycling | `cycleway*`, `bicycle*`, `*:cycleway`, `cyclestreet`, `bicycle_road` |
| Footway | `sidewalk*`, `foot*`, `footway` |
| Water and rail | `waterway*`, `intermittent`, `railway*`, `electrified`, `gauge`, `usage`, `tracks` |
| Building | `building*`, `roof:*`, `height`, `min_height`, `addr:*` (areas only) |
| Other | Everything else |

(inferred: the groups follow the street space editor's three groups, split further for rivers, rails and buildings.)

- Inside a group: the reference's preset keys first, then A to Z.
- Key cell: the OSM key in monospace. The preset field label is the tooltip.
- A row with any difference has a dot in its header.
- A toggle "Only rows that differ" at the top. Default off (section 6, question 13).

### 4.4 Colour states

Each state has a fill for light and dark mode, and a second cue. The cue keeps the state readable without colour. Values are compared in chain direction (section 4.8).

| State | Exact meaning | Light | Dark | Second cue | Accessible name |
| --- | --- | --- | --- | --- | --- |
| Reference | The selected way's column | Column `bg-blue-50`; header `bg-blue-100` | `dark:bg-blue-950/40`; header `dark:bg-blue-900/50` | "Selected" in the header | "Selected way" |
| Same | Both have the key and the value is equal | No fill | No fill | None | The value |
| Different | Both have the key; values differ | `bg-amber-100`, text `text-amber-900` | `dark:bg-amber-950/40`, `dark:text-amber-200` | "≠" at the top left | "Different: X; reference Y" |
| Added | This way has the key; the reference lacks it | `bg-emerald-100` | `dark:bg-emerald-950/40` | "+" at the top left | "Only here: X" |
| Missing | The reference has the key; this way lacks it | `bg-red-50`, dashed inset border `border-red-400` | `dark:bg-red-950/30`, `dark:border-red-700` | "−" and no value text | "Missing here; reference has Y" |
| Empty | Neither has the key | No fill | No fill | Grey "—" | "Not set" |
| Conflict (optional, question 6) | A rule says this value does not fit the others | Inset 2 px ring `ring-red-500` | `dark:ring-red-400` | "!" | "Conflict: reason" |
| Edited | Changed in this session, against the saved base | 3 px bar at the bottom, `bg-violet-500` | `dark:bg-violet-400` | Bar | "Changed in this session" |
| Preview | A carry or fill would write here | Dashed outline `outline-amber-500` | Same colour | Dashed line | "Would change" |
| Direction-dependent | The key or value depends on the way's direction | None | None | "⇄" after the value | "Depends on direction" |

Legend: one row of chips under the table, with the same classes: Reference, Different, Added, Missing, Empty. Conflict and Edited appear only when they are in use.

Notes:

- The Sheet's tones do not match these names (section 3). The shared set must grow (section 5.4, item 3).
- Contrast is not checked. The browser check should check the contrast of each state (section 7, step 4).

### 4.5 Editing in place

- Every cell of a way is an input of the sheet, including the neighbours. Read-only ways are read-only.
- Typing replaces the text. Enter, Tab and the arrow keys commit. Escape drops the draft (Sheet behaviour).
- A cleared cell removes the key on that way (explicit `remove`, because empty values are dropped in `set`).
- One committed cell is one action on one way, and one undo step. The step label names the key and the way, as the tags sheet does ("Changed surface on Mill Road").
- A batch that touches a read-only way is refused as a whole, with the sheet's status line saying why. This is `planChangeTagsEach`'s rule.
- Keys are read-only in v1. No rename.
- A typed value in a flipped cell is written to the raw key (4.8).
- Undo and redo: the top bar buttons, and Cmd or Ctrl plus Z, through the sheet's `onUndo` and `onRedo`.
- No login gate. Saving needs login; editing does not.

### 4.6 Row actions

- A button at the end of each row (the sheet's `rowActions`): "Set on all". It writes the reference's value on every other way of the chain where the value differs or is missing. One undo step. The button shows the count ("Set on 4").
- Hovering the button shows the preview outline on the cells it would change.
- Read-only ways refuse the whole batch (4.5).

### 4.7 Carry to the next N ways

- The row action "Carry…" opens a small popover with:
  - the value (default: the reference's value; or the value of a column the user picked);
  - the direction: forward, backward, or both;
  - N, from 1 up to the limit;
  - the mode: "fill empty" (default) or "overwrite different" (explicit);
  - the preview (dashed outlines), then Apply (one undo step), or Cancel.
- The targets go nearest first. The walk stops at the end of the chain, and at a junction (no guessing).
- A read-only way in the targets refuses the whole batch (one rule for all batches).
- Direction-dependent keys and values are not carried to a reversed target in v1. The popover says why: "Depends on the direction of the way". Question 7 decides more.
- Dual siblings are not targets in v1.

### 4.8 Flipped keys and compared values

- Display: for a reversed way, the display key is the mirror of the stored key: `:left` and `:right` swap, and `:forward` and `:backward` swap. `:start` and `:end` swap in the street space editor (question 7 covers whether Maid does too).
- The column header shows `⇄`. The key tooltip shows the stored key: "Stored as cycleway:left on this way".
- Writing: the same mirror function applied to the display key gives the stored key. Test: mirror(mirror(key)) equals key.
- Values: the text shows the stored value, unchanged. The state compares values as seen from the chain direction. Then `oneway=yes` on a reversed way equals `oneway=-1` on the centre's direction, and "Same" means the same thing on the street. The cue `⇄` marks these cells.
- This keeps the text honest and avoids the write bug in 2.6, item 1 (a write goes to the stored value, never to a mirrored one).
- Source: `mirror-tags.ts` in the street space editor's `osm-way-chain` (MIT). The key part first; the value part with step 7.

### 4.9 Buildings

- A closed way with a `building` tag uses the area rule. An open way uses the line rule.
- A closed way with a linear tag (for example a roundabout) uses the line rule. Its start node gets the junction chooser (inferred).
- Neighbours are areas that share an edge with the centre: two consecutive nodes shared. A shared corner (one node) does not count in v1.
- The walk goes along the shared edges from the centre, up to the limit. "Left" is the neighbour across the centre's first shared edge in node order. "Right" is the other side (inferred).
- Terraced houses that share no node are not found in v1 (inferred). A near-miss search (edges within about 0.3 m) is a v2 question, to decide after checking the fixtures for terraces.
- Rows: groups Building, Name, Other. No flipped keys.

### 4.10 Several features

- The selected ways and areas become the columns. The reference is the first selected feature (question 11).
- Order: if the features form one chain (shared end nodes, by the chain rules), the chain order. If not, the order along the main axis of their centres (projection onto the principal direction, inferred). Ties: the selection order. The header shows the order used: "Order: along the line" or "Order: selection".
- Columns: up to 24, with horizontal scroll and a sticky key column. Beyond 24: the first 24, and "Showing 24 of N".
- Edits, carry and set-on-all work as for one way. A read-only feature refuses the batch.
- Nodes and relations in the selection are not columns. The table says how many were left out.

### 4.11 Junctions

- When two or more candidates tie at a node, a row above the grid asks: "Which way continues at the north end?". Each candidate is a button with name and id. Hovering a button highlights that way on the map.
- The choice is kept for that node until the selection leaves the chain.
- Ties always ask (question 3).

### 4.12 Empty, limit and too-long states

| State | What the table shows | Writes? |
| --- | --- | --- |
| No selection, node or relation | Hint | No |
| Way not loaded (zoomed out) | "Zoom in to load the ways." No request is made | No |
| Lone way | The reference column only, with "No connected ways of the same kind" | No |
| Chain ends at the loaded data's edge | A note at that side: "The loaded data ends here" | No |
| Many keys (over 120) | Groups fold by default; the "Only rows that differ" toggle is shown | Not changed |
| Limit reached on a side | "Show 3 more" on that side, up to 9 | Not changed |
| Several features over 24 | First 24, and "Showing 24 of N" | Not changed |
| Value over 255 characters | The sheet's red state and counter | Refused by the sheet |
| Read-only way | Its cells are read-only; a note in its header | Refused |

### 4.13 Keyboard

- Inside the grid, the sheet's keys: arrows move; Tab and Shift+Tab move; Enter and F2 edit; Escape drops the draft; Delete clears the cell; Cmd or Ctrl plus Z undoes.
- A column header: Enter selects that way.
- Previous and next way: Alt+Left and Alt+Right (proposal; check `useShortcuts.ts` for conflicts first, not read).
- Toggle the dock: a free key. The iD fork uses `K` (question 15).
- Focus stays in the table. Map shortcuts do not reach the grid (sheet design).

### 4.14 Map link

- A column header hover gives the way the calm related halo (`engine.setRelated([wayId])`), and clears it on leave.
- The map's hovered way (`engine.hovered()`) marks its column while the pointer is on it. This needs a way for the dock view to read the map (section 5.4, item 2).
- A click on a map feature selects it (as now). The table follows.
- The table moves the map only when the user clicks a column header and the way is outside the view. Then `engine.fitTo` (inferred; the iD fork always centres the way).

### 4.15 Performance budget (proposal; not measured)

- Chain: at most two times the limit of lookups per side on the staging graph. Target: under 1 ms at limit 3.
- Rows and states: keys times columns. Target: under 10 ms for 60 keys and 9 columns. Under 50 ms for 200 keys and 24 columns.
- Recompute: on a selection change, and on a history change, debounced by 100 ms (the iD fork's value). Only while the tab is open.
- No requests. The table reads the staging graph only. A way outside the loaded tiles is not searched, and the note in 4.12 says so (core rule 1).
- A headless bench, `bun run bench-table`, over the dense fixture: chain and rows for every way, printed as JSON (like `bench-validation`). Not built.

### 4.16 Text mock

```
Way table                                   Only rows that differ [ ]     Undo
 < >   Mill Rd ⇄ w101 | Mill Rd w102 | [Mill Rd w103 selected] | Mill Rd w104 | Mill Rd ⇄ w105
-----------------------------------------------------------------------------------------------
v Road (3 differ)
  highway        residential | residential | residential | residential | residential
  surface        ≠ paving    | asphalt     | asphalt     | −           | asphalt
  lit            +yes        | —           | —           | —           | ≠ no ⇄
v Cycling (1)
  cycleway:left  −           | lane        | lane        | −           | ⇄ lane
legend: [Reference] [≠ Different] [+ Added] [− Missing] [— Empty]
```

## 5. Module shape

### 5.1 Package and switch-on

- Package `packages/module-way-table/` (`@osm-editor-kit/maid-module-way-table`), private, ISC like the other modules (`packages/module-notes/package.json`).
- A factory `wayTable(options?)` in `src/index.ts`, switched on with one line in an app's `maid.config.ts`.
- Options: `maxPerSide` (default 3); `candidateFilter` (default: same kind as the centre); `groups` (default: section 4.3).
- Extension points: `dock.view` (existing). `map.highlight` (new, section 5.4).
- Apps: `apps/maid-bicycle` first (Radnetz feature 6). `apps/maid` after its browser check. `apps/maid-parking` later, with a road-only filter (question 1).

### 5.2 Files

Pure files (no React), each with a test file:

| File | Does | Tests |
| --- | --- | --- |
| `src/chain.ts` | Walk, candidates, same kind, score, tie as junction, pinned choices, limit, orientation | Ported from `osm-way-chain` tests (`buildChain`, `neighborMatch`, `direction`), plus cases for ties, loops, closed ways and the limit |
| `src/area-chain.ts` | Neighbours by shared edge, walk order | New |
| `src/mirror.ts` | Mirror of directional keys (inverse is itself); mirror of values (step 7) | Round trip; each key kind; oneway; lanes pipes |
| `src/rows.ts` | Keys to groups to rows; preset keys first; hidden empty groups; key labels | New |
| `src/cell-state.ts` | State of one cell (reference, same, different, added, missing, empty, edited), compared in chain direction | One table test for every state |
| `src/carry.ts` | Targets, refusals and direction rules of a carry or fill | New |
| `src/order.ts` | Order of several features (chain, axis, selection) | New |
| `src/plan.ts` | Cell or row to a batch: display key to stored key; calls `planChangeTagsEach`; labels | New |
| `src/WayTable.tsx` | The dock view: header, junction row, one Sheet per group, legend, toggle | Browser check (step 11) |
| `src/WayTableHeader.tsx`, `CarryPopover.tsx`, `Legend.tsx` | Parts of the view | Through the browser check |
| `src/store.ts` | UI state: groups open, "only differences", carry popover (Zustand, atomic selectors) | Small unit test |

### 5.3 Ports and licences

| Source | Licence (read) | Use in Maid |
| --- | --- | --- |
| Radnetz iD fork: `modules/way_table/chain.ts`, `tag_rows.ts`, `way_table_panel.ts` | ISC (the fork's `LICENSE.md`, iD's licence). The `chain.ts` header says "ported from osm-way-as-table-ui" | Logic may be ported with the ISC notice. The origin is the unlicensed repository below (question 16) |
| osm-way-as-table-ui | No licence file. No licence field in `package.json` | Reference only. No code until Tobias confirms the licence |
| Street space editor, `app/src/modes/table/` | MIT (root `LICENSE`). The copyright line says "zlant" (question 16) | Port with the MIT notice kept |
| Street space editor, `packages/osm-way-chain/` | MIT (`package.json`). No licence file inside the package. Author in `package.json`: Tobias Jordans | Port with the MIT notice kept; tests too |
| Maid | ISC (`package.json`; `LICENSE`: "Maid contributors") | Target licence of the new code |
| Everything written new | Maid's ISC | New code |

### 5.4 Changes outside the module

1. The dock view does not get the selection. Proposal: add `selected: readonly string[]` to `DockViewProps`. `BottomDock` already calls `useSelection()`, so the prop costs no extra render (read).
2. The dock view cannot reach the engine. For highlights, add a `map.highlight` extension point, implemented by the renderer (it calls `setRelated` and exposes `hovered()` with subscription). For edits, no engine is needed: the module writes with `editor.history.perform` and `commit`, as the turn restrictions do.
3. The sheet's tones are a fixed set. Add `reference`, `different`, `added`, `missing`, `conflict`, `edited` and `preview` to `cell-look.ts` in one place. The alternative is to pass cell classes per cell.
4. The sheet header is text only. The table draws its own header row with the same grid tracks, and passes `showHeader={false}`.
5. The sheet has no section rows. One `Sheet` per group, with the group heading above it. Tab moves between groups; arrows move inside a group.
6. The sheet's key cell is one line. v1: the OSM key in monospace; the label as tooltip. v2: a two-line header (needs a slot in the sheet).
7. `planChangeTagsEach` is in the renderer. The module imports it from `maid-renderer` (`module-notes` already imports the renderer).

## 6. Open questions

Each question lists the options and my recommendation. Step 0 is the set of answers that blocks step 1: questions 1 to 5, 7, 8 and 16.

1. Which apps get the table first?
   - Options: `maid-bicycle` only; `maid` and `maid-bicycle`; all three.
   - Recommendation: `maid-bicycle` first (Radnetz feature 6), then `maid`. `maid-parking` after the road-only filter is decided.
2. How many ways per side?
   - Options: 2 (iD fork), 3, 5 (street space editor).
   - Recommendation: 3, with "Show 3 more" up to 9. Decide again after the first browser check.
3. What happens at a tie?
   - Options: always ask (iD fork); take the first when the score is 100 (street space editor).
   - Recommendation: always ask.
4. Which ways can continue a chain?
   - Options: same kind as the centre, any kind (iD fork); road-like highways only (street space editor).
   - Recommendation: same kind by default. A filter per app (road-only for `maid-parking`).
5. Column order?
   - Options: direction of the selected way (iD fork, final since 2026-10-12); map order (iD fork, removed); selection order for several features.
   - Recommendation: direction for chains; along the line for several features.
6. What is a conflict?
   - Options: (a) a validator issue mapped to a key (needs a key field in the rules); (b) a short list of module rules, for example lanes count, `cycleway` against `highway`, `sidewalk` against `highway`; (c) nothing in v1.
   - Recommendation: (c) in v1, (b) in v2.
7. Are values compared as seen from the chain direction?
   - Options: (a) stored values, flipped keys only; (b) chain-direction values for the state, stored values in the text (recommended); (c) (b) plus mirrored values in the text.
   - Recommendation: (b). Port the value part of `mirror-tags.ts`. Mark the cells with `⇄`. Decide whether `:start` and `:end` flip too (the street space editor does).
8. Carry and fill rules?
   - Options: fill empty only (default), with an explicit "overwrite different" switch; a read-only way refuses the whole batch, or is skipped.
   - Recommendation: fill empty by default with the switch; refuse the whole batch (one rule for all batches).
9. Dual carriageway siblings?
   - Options: skip (v1); a column beside the pair, tag-gated as the street space editor does it.
   - Recommendation: v2.
10. Adjoining buildings?
    - Options: shared edge only (v1); also near-miss edges within about 0.3 m (v2).
    - Recommendation: shared edge in v1. Check the fixtures for terraces before v2.
11. Reference for several features?
    - Options: the first selected; the last clicked; a column the user picks.
    - Recommendation: the first selected, and a "use as reference" item in a header menu later.
12. Rename keys in the table?
    - Recommendation: no, not in v1.
13. "Only rows that differ": on or off by default?
    - Recommendation: off, with the toggle kept for the session.
14. Tab label and position?
    - Options: "Way table" or "Ways"; after the module views (default) or first.
    - Recommendation: "Way table", after the module views.
15. Shortcuts?
    - Options: Alt+Left and Alt+Right for previous and next way; a dock key (the iD fork uses `K`).
    - Recommendation: check `useShortcuts.ts` for conflicts first. Use `K` if free.
16. Licence and copyright?
    - The osm-way-as-table-ui repository has no licence file. The street space editor's root `LICENSE` is MIT with the copyright line "zlant". Its packages name Tobias.
    - Recommendation: Tobias confirms that he may port the MIT code, and which copyright line to keep.
17. Map link halo?
    - Options: the calm related halo (`setRelated`); the hover halo (`setHover`).
    - Recommendation: related, so that the pointer's own hover stays with the map.
18. One sheet for all groups, or one per group?
    - Recommendation: one per group (5.4, item 5).
19. Sheet tones: extend the fixed set, or pass classes per cell?
    - Recommendation: extend the set once in `cell-look.ts` (5.4, item 3).
20. Key label: OSM key only in v1, or a two-line label?
    - Recommendation: OSM key in v1, label as tooltip. Two lines in v2 (needs the sheet slot).
21. Performance budget?
    - Recommendation: accept the proposal in 4.15 and measure in step 11.
22. Radnetz feature 6?
    - WORKDOC says "done, v1, read-only". `radnetz-features.md` says "later" for Maid.
    - Recommendation: treat the Maid table as new work. The fork is the reference for reading, not for editing.

## 7. Steps

About one hour each. Each step ends with one thing for Tobias to test. Browser checks are run by the orchestrator, not by parallel agents (AGENTS.md). Steps 4 to 7 may need splitting.

| # | Step | Done when | Test for Tobias |
| --- | --- | --- | --- |
| 0 | Decide | Questions 1 to 5, 7, 8 and 16 are answered | Read section 6 and answer in chat |
| 1 | Chain and rows, no view | Chain and row tests pass, ported from `osm-way-chain` and new; `bun run check` passes | None on screen. Read the chain test cases against the rules in section 2.1 |
| 2 | Dock tab, one column | Tab "Way table" in the dock; follows the selection; the reference's rows in groups; hint without a selection | Select a road, open "Way table", compare with the tags sheet |
| 3 | Neighbours, headers, map link | Chain columns in order; `⇄`; header click selects; previous and next; hover halo on the map | Select a middle way of a chain; hover each column; check the halo; click a header |
| 4 | Colour states and legend | All states in light and dark; legend; "only differences" toggle; accessible names; contrast checked | Compare each colour with the legend on a known chain in the dense fixture |
| 5 | Edit in place | Any column editable; clear removes; one undo step per cell; read-only way refused | Change a neighbour's surface, then undo once |
| 6 | Row action and carry | "Set on all"; carry with preview and fill-empty default; one undo step each | Carry surface to the next two ways, then undo |
| 7 | Flipped keys and compared values | Reversed ways show flipped keys with `⇄`; writes go to stored keys; comparison in chain direction; round-trip tests | Find a reversed neighbour with `cycleway:left`; the row shows `right`; an edit writes `left` |
| 8 | Buildings | Area rule by shared edge; Building group | Select a terraced house (if a fixture has one); its neighbours are the columns |
| 9 | Several features | Columns are the selection; order rule; up to 24; reference rule | Select three ways with Shift; check the order; edit one cell |
| 10 | Junctions, limits, empty states | Chooser at ties; "Show 3 more"; the notes in section 4.12 | Find a T-junction with two same-kind ways; choose one |
| 11 | Browser check and budget | `tools/checks/check-table.ts` in `check-all`; `bun run bench-table` writes JSON; accessibility pass | `bun run check-table --app maid-bicycle` exits 0 and prints its `ok` lines |
| 12 | Switch on | One config line in `maid-bicycle`; `bun run check-config` passes; `steps.md` and `radnetz-features.md` row 6 updated | Open `maid-bicycle`, select a road, open "Way table" |

## 8. Not checked

- No test and no browser run in any repository.
- No fixture was checked for terraced houses.
- No measurement: the performance numbers are proposals.
- Contrast of the colours was not measured.
- The iD fork's CSS after line 216 was not read in full.
- `matchesStreetSpaceWaySegment` was not read (its exact road list).
- The street space editor's table keyboard hook (`useChainWalk`) was not read.
- Maid's `useShortcuts.ts` was not read, so no shortcut conflicts are known.
- The export path of `planChangeTagsEach` in the renderer's index was not checked.
- The dual-carriageway finder was read for its first 140 lines only.
- The osm-way-as-table-ui source was not read.
- No network was used.
