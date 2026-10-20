# Indoor and level support in iD and MapComplete

Research for a Maid variant on indoor mapping and building levels. Written 2026-10-20.

Marking used below: **[read]** = I read the source (PR diff, issue text, file, or grep result) myself. **[inferred]** = my reading of what the code or discussion implies, not verified by running it. Nothing was built, tested or run: no bun, no installs. Every `gh` call was read-only (view, search, api GET). Nothing was posted or commented.

## Summary

- **iD has no level support on main.** Its only indoor code is an `indoor`/`indoormark` feature rule and style class (merged 2019, PR #6352 by tordans), level-aware crossing and close-node validations, and an extract action that keeps `level` on both parts. The big requests (#4780 indoor mode buttons, #12006 level/layer support) stayed open or were closed as duplicates, and the 2016 indoor-mode PR #3097 was closed unmerged.
- **Open PR #12605 "Focus the selected indoor level" (opened 2026-07-23, still open) is the live candidate.** It dims everything not on the selected level or layer, shows a status line, and is opt-in via Map Data → Style Options, stored in the URL and preferences. The author says it has been running on map.osm.asia/id for some time; the code also lives in the author's BetteriD fork. Review is active: a collaborator asked for a screenshot and proof that it works with other features on the same level, and for the follow-up commits to be pushed; the author says they were pushed and rebased.
- **id-tagging-schema has the indoor presets today:** `indoor=room/area/corridor/door/wall`, stairs, and elevator presets, plus the `level` (combo) and `level_semi` (multi) fields. It has no `repeat_on`, `min_level` or `max_level` support. Issue #563 is only about a building relation preset, and its 2026 comments show IndoorOSM is almost unused (about 0.10% of `type=building` relations have a `level_0` role).
- **MapComplete has the most complete level UI of the three.** A vertical floor picker (`FloorSelector`) appears when more than one level is in view at zoom 16 or higher. It filters the map by a `_level` value derived from the data (`level` and `repeat_on`, with ranges like `0-5`). New points inherit the selected level behind a confirmation. The indoors theme is a small preset that shows only indoor features.
- **For Maid the transferable parts are:** the level value parser and derived `_level` field (MapComplete), the floor list built from features in view (MapComplete), the level-filter and new-point-inherits-level flow (MapComplete), the dim-instead-of-hide focus mode and status line (iD PR #12605), and the indoor preset set from the schema. Caveat: the MapComplete source I read is a `develop` snapshot dated 2025-02-28, so it may be behind its current state.

## Findings per project

### 1. iD (openstreetmap/iD)

#### 1a. Pull requests and issues

Searches run: `gh search prs --repo openstreetmap/iD <term>` and `gh search issues ...` for "indoor", "level", "floor" (`--state` takes only open or closed, so I left it out). [read]

Relevant PRs and issues (number, state, date, title; from the search and `gh pr view`/`gh issue view`):

| Item                                                                           | State                              | Dates                                | What it is                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR #12605 "Focus the selected indoor level"                                    | open, not draft, 9 files, +549 −10 | opened 2026-07-23                    | Opt-in dim-other-levels mode with status line. Detailed in the section "iD PR #12605 in detail". [read]                                                                                                                                                                                              |
| PR #3097 "Indoor mode" (zbycz)                                                 | CLOSED, not merged                 | opened 2016-05-03, closed 2017-02-08 | Early indoor mode: an "Indoor" control, level filtering, `indoor=*` area styles, `indoor_levels` field, ranges, `repeat_on`, `min/max_level`. Author asked how to handle "modes" terminology and whether to squash commits. [read]                                                                   |
| Issue #4780 "Indoor mode buttons" (zbycz)                                      | open                               | opened 2018-02-07                    | Where the entry button and level switcher should go. Thread: right-click on buildings, inspector panel, top toolbar. Never settled. [read]                                                                                                                                                           |
| Issue #12006 "Add level/layer support" (Dimitar5555)                           | CLOSED, reason DUPLICATE           | opened 2022-02-26, closed 2026-04-14 | Asks for a level context: show what is on the current level, add new features with `level`/`layer` set automatically, mock-up based on iD-indoor. The duplicate target is not in the timeline; #4780 was cross-referenced on 2026-03-11 by valerio-bozzolan, who linked the mock-up to #4780. [read] |
| Issue #2660 "Indoor editing"                                                   | closed, completed                  | 2015                                 | IndoorOSM-style floor relations proposal. [read]                                                                                                                                                                                                                                                     |
| Issue #2218 "Level field for features likely to be within buildings"           | closed, completed                  | 2014-2015                            | Asks for a `level` button next to the `ele` field. [read]                                                                                                                                                                                                                                            |
| PR #6352 "Add filter building:part and indoor" (tordans, i.e. Tobias)          | MERGED 2019-05-22                  |                                      | Added the `indoor` feature filter that exists in iD today. [read]                                                                                                                                                                                                                                    |
| PR #6863 "Add support for switching levels (indoor) presets" (danielsjf)       | MERGED 2019-09-25                  |                                      | Escalator, stairs and elevator presets following Simple Indoor Tagging. [read]                                                                                                                                                                                                                       |
| PR #10325 "Filter underground"                                                 | CLOSED, not merged                 | 2024-07-13 to 2025-02-25             | Not read in detail. Lead for a "hide underground" feature. [read: title and state only]                                                                                                                                                                                                              |
| Issue #7261 "Hide underground features"                                        | open                               | 2020-01-17                           | Same topic. [read: title and state only]                                                                                                                                                                                                                                                             |
| Issue #7809 "Don't mark crossing paths of different layers as a problem"       | closed                             | 2020-07-19 to 2026-01-10             | Possibly related to PR #10999 (merged 2026-01-10 per the search output, "Warn on same layer crossing regardless of bridge / tunnel"); the link was not checked. [read: titles and dates only]                                                                                                        |
| Issue #10790 "consider location and/or level in crossings highways validation" | closed                             | 2025-02-20 to 2025-02-24             | Validation topic, state only. [read]                                                                                                                                                                                                                                                                 |
| PR #11300 "fix: allow 0 as input value in layer tag"                           | MERGED 2025-08-12                  |                                      | `layer` input fix. [read]                                                                                                                                                                                                                                                                            |
| Issue #10808 "Show `indoormark=beacon` features with indoor features"          | closed                             | 2025-02-23 to 2025-02-24             | Indoor mark features. Outcome not read. [read: title and state only]                                                                                                                                                                                                                                 |

Issue #4780 comments [read, from `gh api repos/openstreetmap/iD/issues/4780/comments`]:

- 2018-02: the indoor-mode fork by zbycz and PanierAvide's iD-indoor fork are both mentioned. Milestone 2.8 for the taskbar (#3123) was discussed.
- 2018-04-23: bhousel (iD maintainer): "I really don't have a place for this to go just yet."
- 2018-08: proposals to move it to a building right-click or the object editor.
- 2019-09-12: danielsjf asks if it is still on the roadmap. bhousel: the focus is on rethinking iD's architecture, "we probably won't be merging any big new features into main iD for a while." PanierAvide starts a separate editor (osminedit).
- 2026-03-11: valerio-bozzolan links the 2022 mock-up from #12006.

Why the earlier work stalled [inferred from the threads above]: no agreed UI location for the entry button, the maintainers' focus on architecture in 2019, and PR #3097 leaving open design questions (naming, squashing, the modes model in iD) without a decision. The 2026 PR #12605 avoids a mode entirely: it is a checkbox in the style options, not an exclusive mode.

#### 1b. Current iD code (checkout `.reference/id`, commit 0194f3926a59d8db8993892880f2a25d366c7099) [read]

`grep -rn -i "level" modules` (JS and TS, excluding "loglevel" and zoom-level hits) finds no level switcher, no level filter and no level-based styling. The level hits are:

- `modules/renderer/features.js` lines 135-141: rule `indoor` is true when `indoor` is set and not `no`, or `indoormark` is set and not `no`. `landuse` excludes indoor features.
- `data/core.yaml` lines 940-942: feature filter "Indoor Features", tooltip "Rooms, Corridors, Stairwells, etc."
- `modules/svg/tag_classes.ts` lines 12 and 19: `indoor` is a primary and secondary tag class (used for CSS classes).
- `css/70_fills.css` lines 47-49: `.fill-partial path.area.fill.tag-indoor` has stroke width 20px.
- `modules/validations/crossing_ways.js` lines 40-43 and 84-90: `taggedAsIndoor` is true for `indoor`, `level` or `highway=corridor`. Two features that are indoor on different levels (default level "0") are not flagged as crossing.
- `modules/validations/close_nodes.js` lines 34, 46, 122 and 156: indoor ways give a close-node tolerance of 0.01. `zAxisKeys` `{layer, level, addr:housenumber, addr:unit}` allow very close nodes when these differ.
- `modules/validations/almost_junction.js` lines 263-270: a `level` mismatch (default "0") stops an almost-junction warning.
- `modules/actions/extract.ts` lines 65-122: extracting a point from an indoor area keeps `indoor` on the area and copies `level` to both parts.
- `modules/osm/way.ts` line 90 `layer()` is used for line z-order (not level).

Grep of `css/` for `indoor` finds only `tag-indoor`; no level-related CSS was searched for separately.

#### 1c. Presets and fields in iD

iD takes presets and fields from id-tagging-schema (`^7.0.0` in `.reference/id/package.json`). The schema is covered in section 2.

### 2. id-tagging-schema

#### 2a. Issue #563 "Add Building relation preset" [read]

URL: https://github.com/openstreetmap/id-tagging-schema/issues/563

- Opened 2022-08-07 by 1ec5. State OPEN. Labels `waitfor-documentation`, `new-preset`.
- Request: a Building preset for `type=building` relations, used in the Simple 3D Buildings scheme.

Comments, in order:

- 2026-07-05, matkoniecz: the wiki page (https://wiki.openstreetmap.org/wiki/Relation:building#For_3D_modelling) is confusing on "was" vs "is" for indoor mapping and does not say clearly that the relation is an extra addition to the area.
- 2026-07-09, 1ec5: the wiki calls the IndoorOSM usage deprecated (crossed out) but it still fits Simple Indoor Tagging, which needs no special members. The open question is whether the identifying tags (`name`, `wikidata`) should be on the relation or only on the outline. This decides whether the preset has any fields.
- 2026-07-10, matkoniecz: asks whether IndoorOSM is still used at all. Suggests making it far less prominent if not. Says tags should not be duplicated, and asks for that to be documented.
- 2026-10-19, bryceco (comment 4886673871 → 6275644413 thread): the Japan PLATEAU import is about half of all `type=building` relations, and it duplicates tags on outline and relation. Table excluding that import: `building=*` exists on 88.4% of relations, on the outline in 97.1%; `addr:*` exists 47.5%, on the outline 95.9%; `name` exists 34.9%, on the outline 75.2%, only on the relation 24.8%. Conclusion: `name` is reasonable on type=relation, other fields are not needed.
- 2026-10-19, bryceco (comment 6276017763): IndoorOSM requires at least one `role=level_0` member. Of 106,606 `type=building` relations, only 110 have it (about 0.10%).

Conclusion from the thread [read + inferred]: IndoorOSM relations are nearly absent; the relation preset is mainly a question of which tags belong on it, not of indoor editing.

#### 2b. What the schema has for indoor today [read, from `gh api repos/openstreetmap/id-tagging-schema/contents/data/presets/indoor` and `data/fields`, default branch]

Preset folder `data/presets/indoor/`: `_corridor_line.json`, `area.json`, `corridor.json`, `door.json`, `elevator.json`, `room.json`, `stairs.json`, `wall.json`. Template `data/presets/_indoor.json`.

| Preset (file)                                                                 | Tags                           | Geometry                  | Fields                                                                |
| ----------------------------------------------------------------------------- | ------------------------------ | ------------------------- | --------------------------------------------------------------------- |
| Indoor Feature (`_indoor.json`, template, not searchable)                     | `indoor=*`                     | point, vertex, line, area | level, indoor_type                                                    |
| Indoor Area (`area.json`)                                                     | `indoor=area`                  | area                      | level, name, ref_room_number, height                                  |
| Indoor Corridor (`corridor.json`)                                             | `indoor=corridor`              | area                      | level, name, ref, height                                              |
| Indoor Corridor line (`_corridor_line.json`, replacement to highway/corridor) | `indoor=corridor`              | line                      | level, name                                                           |
| Indoor Door (`door.json`)                                                     | `indoor=door`, adds `door=yes` | vertex                    | level, ref, door_type, access_simple, width, height; more: wheelchair |
| Room (`room.json`)                                                            | `indoor=room`                  | area                      | level, name, ref_room_number, room, height                            |
| Indoor Elevator Shaft (`elevator.json`)                                       | `indoor=room`, `elevator=yes`  | area                      | ref, level_semi                                                       |
| Indoor Stairwell (`stairs.json`)                                              | `indoor=room`, `stairs=yes`    | area                      | ref, level_semi, conveying_escalator                                  |
| Indoor Wall (`wall.json`)                                                     | `indoor=wall`                  | line                      | level, height                                                         |

Fields (`data/fields/`):

- `level.json`: type `combo`, label "Level", terms "building floor", "deck", "storey", "story". `prerequisiteTag: keyNot building`, so it is hidden on buildings.
- `level_semi.json`: type `semiCombo`, label "Levels" (multiple values with `;`).
- `indoor.json`: type `check`, label "Indoor" (key `indoor`).
- `indoor_type.json`: type `typeCombo` for key `indoor`.
- `room.json`: combo for key `room`. `ref_room_number.json`: text for key `ref`.
- `layer.json`: integer, placeholder 0. `building_part.json` preset has `layer` as a more-field.

Not present in the schema [read via `gh search code --repo openstreetmap/id-tagging-schema`, which does index this repo]: no `repeat_on`, no `min_level` / `max_level`, no building-relation preset (issue #563 still open). Other `indoor=*` uses are on unrelated presets: `highway/corridor.json` (`indoor=yes`), `highway/steps.json`, `leisure/playground/indoor.json` and several `indoor_seating` fields.

### 3. MapComplete (pietervdvn/MapComplete)

Source: shallow clone of `develop` into the session scratchpad, commit `cf368606d31fdc7542de44f1231ec2f25212f87d`, committed 2025-02-28. Code search (`gh search code`) does not index this repo, so I used the git tree API for file paths and the clone for reading. [read]

The GitHub API reports `pushed_at` 2025-02-28 for the repo, so this snapshot may be old. I did not check whether the feature changed later.

#### 3a. The level selector UI

- `src/UI/BigComponents/LevelSelector.svelte` (32 lines): holds a `selectedFloor` store, stabilized over 5 ms. When `floors` has more than one entry and the zoom is at least `maxZoom = 16`, it calls `layerState.setLevelFilter(floor)`. Otherwise it calls `setLevelFilter(undefined)` (all levels shown). The `FloorSelector` is only rendered at zoom 16 or higher.
- `src/UI/InputElement/Helpers/FloorSelector.svelte` (about 120 lines): an elevator-like vertical picker. Each floor is a 40 px button, the column is `40 px × number of floors` high, and the user drags it or taps a floor. It snaps to the nearest floor with momentum (`Stores.Chronic(50)`). Touch is handled through `ontouchstart`/`ontouchmove`. The file header says the logic that filters is in `LevelSelector`.
- `src/UI/ThemeViewGUI.svelte` lines 266-274: the `LevelSelector` is rendered inside an `If` on `state.floors.map(f => f.length > 1)`, in the bottom-right control column next to the zoom buttons.

#### 3b. How the floor list is derived

`src/Models/ThemeViewState/WithLayoutSourceState.ts`, `initFloors` (about lines 80-110) [read]:

- Takes the features in view (`features.features.stabilized(500)`).
- For each feature reads `properties["_level"]`. Each `;`-separated value is added to a set. A feature without `_level` adds `"0"`, which is therefore always present.
- Sorts alphabetically first, then numerically with `parseInt` (so `1A` works); non-numeric pairs compare as equal.

So the floor list is the union of levels of the features currently in view. There is no separate level model and no building-level metadata.

#### 3c. Parsing and the derived `_level` tag

- `src/Logic/Tags/TagUtils.ts` `LevelsParser` (about lines 726-770) [read]: splits on `;`, trims, expands ranges `a-b` to every integer from a to b (negative numbers such as `-1` are kept as single values), and drops empty or NaN entries. Examples in the doc comment: `"0-5"` gives 0 to 5, `"0;-1"` gives both, `undefined` gives `[]`.
- `src/Logic/SimpleMetaTagger.ts`, the `levels` tagger (about lines 439-470) [read]: normalises `level` and `repeat_on` through `LevelsParser`, then writes `_level` as the sorted-as-given join of `repeat_on` and `level`. So `repeat_on` features show on the other floors too. The `_level` key is a derived, `_`-prefixed property used for filtering and the floor list.
- MapComplete's `repeat_on` is the same idea as Simple Indoor Tagging's `repeat_on` (see iD PR #3097 body, which also used ranges and `repeat_on`). id-tagging-schema does not have it (section 2b).

#### 3d. Filtering

`src/Logic/State/LayerState.ts` `setLevelFilter(level?)` (about lines 124-162) [read]:

- Removes any previous global filter with id `level`. If `level` is empty, it stops (all levels shown).
- Otherwise it adds a global filter `id: "level"` whose `osmTags` is an OR of `_level = <level>` and a regex `(.*;)?<level>(;.*)?`. For level `"0"` it also matches an empty `_level` (no level tag counts as level 0).
- The filter is a hide filter on the layers (features not matching are not shown), not a dim. Layers are not dimmed.
- Caveat [inferred]: `<level>` is put into the RegExp without escaping. Levels like `1.5` would match any character for the dot. Negative values are fine.

#### 3e. Creating new features on a level

`setLevelFilter` attaches an `onNewPoint` object to the global filter [read]: `tags: [level=<level>]`, an `icon` (`./assets/svg/elevator.svg`), `confirmAddNew` and `safetyCheck` translations (`levelSelection.addNewOnLevel`, `confirmLevel`).

`src/UI/Popup/AddNewPoint/AddNewPoint.svelte` [read, lines about 60-110 and 300-325]: when the add-point popup opens, it collects the global filters that have `onNewPoint`. On confirm, their tags are appended to the preset tags. The popup shows the `safetyCheck` text and a checkbox per filter (`checkedOfGlobalFilters`) before adding. So a new point gets the active level as a tag only when the user keeps that option checked [inferred from the variable names and the `Tr` for `safetyCheck` at line 309; I did not run the popup].

#### 3f. Indoors theme and layer

- `assets/themes/indoors/indoors.json` (61 lines) [read]: id `indoors`, title "Indoors", description "On this map, publicly accessible indoor places are shown", start zoom 14, start coordinates 51.17181, 4.144383. Layers: builtin `indoors` (override `passAllFeatures: true`), builtin `walls_and_buildings` (shown by default), `pedestrian_path`, `elevator`, `entrance`. `widenFactor: 2`.
- `assets/layers/indoors/indoors.json` [read]: source is `indoor=room`, `indoor=area`, `indoor=wall`, `indoor=door`, `indoor=level`; minzoom 13; titles per indoor type (Indoor Room, Indoor Area, Indoor Wall, Indoor Corridor, ...). Its `level` tag is only used for the title/question side.
- `assets/layers/indoors/room_*.svg`: 22 icons by room type (administration, auditorium, bedroom, chapel, class, computer, conference, crypt, kitchen, laboratory, library, locker, nursery, office, prison_cell, restaurant, security_check, sport, storage, technical, toilets, waiting) [read: file listing].
- `Docs/Layers/indoors.md` and `Docs/Themes/indoors.md` (generated from the JSON) [read]. The layer doc has a `single_level` question "On what level is this feature located?" that writes `level` (for example `level=-1` gives "first basement level").
- `Docs/TagInfo/mapcomplete_indoors.json` exists (not read).

## iD PR #12605 "Focus the selected indoor level" in detail

Read-only: `gh pr view 12605 --repo openstreetmap/iD --comments`, and `gh pr diff 12605` (719 lines, read in ranges). I did not run the branch or its tests. [read]

**What it builds**

- An opt-in "Focus Indoor Level" checkbox in Map Data → Style Options (`modules/ui/sections/map_style_options.ts`, `data/core.yaml` lines 889-901). Off by default.
- While the setting is on and the selection is an indoor feature, every feature not on the same `level` (or `layer`) is dimmed (`.indoor-dim`, opacity 0.18 in `css/20_map.css`, plus grayscale on the background and overlays). Selected feature, its parents and the building outlines that contain it stay visible. Focused areas are sorted above the others.
- A top-left status line (`modules/ui/indoor_focus_status.js`, new file, CSS in `css/80_app.css`) reads for example "Focused on levels 1; 2; 3; 4; 5; 6". Strings in `data/core.yaml` under `indoor_focus`.
- The setting is kept in the URL hash (`indoor_focus=true`) and in `prefs('indoor-focus')`. Changing it calls `map.pan([0,0])` to redraw.

**Modes and level handling** [read]

- No new mode. It is a view option, which avoids the exclusive-mode problem that PR #3097 raised.
- Trigger: the selection (or its parent ways and relations) has `indoor` or `indoormark` set, or has any `level` tag. A `layer`-only feature (a bridge) does not trigger it. The author's reason: "that way has neither indoor nor level, so there is nothing to focus on."
- Values: `level` and `layer` are split on `;` or `,`. A selected node collects the values of all its parent ways, so a staircase node connecting corridors on several levels focuses all of them.
- Matching: an entity is kept if it, a parent way or a parent relation has a matching `level` or `layer` value. Buildings containing the selection's centre are kept (`geoPointInPolygon`).
- It does not change the data: no tags are added and no new point gets a level. Unlike MapComplete, nothing is hidden and nothing is written.

**Key files** (`modules/renderer/map.js`, the rest small) [read]

- `updateIndoorFocus(data, graph)` (new, about 150 lines): runs in both the partial redraw (`drawVectorItems`, in both the partial and full redraw paths of `map.js`) and the full redraw. Restyles every `.layer-osm *` element and re-sorts area paths.
- `map.init`: reads the setting from the hash, else from prefs.
- `map.indoorFocus`, `map.toggleIndoorFocus`, `map.indoorFocusStatus`: public API; new dispatch event `changeIndoorFocus`.
- `modules/ui/init.js`: adds `uiIndoorFocusStatus` to the map overlay; `modules/ui/index.ts` exports it.
- `test/spec/renderer/indoor_focus.js` (253 lines, new): covers dim and sort, the setting (hash and prefs), the status line, and the `layer`-only case. Not run here.

**State** [read]

- Opened 2026-07-23 by koharachan (contributor, not a maintainer). Open, not a draft, no review decision recorded, no labels. 9 files, +549 −10.
- Disclosure in the PR: prepared with LLM help (ChatGPT for the first version, Claude Code for the follow-up), and in use on https://map.osm.asia/id "for a while" (the author's words).

**Review discussion** [read, from the comments; timestamps not captured]

1. matkoniecz (collaborator): asks for a screenshot of it working. Then: "Is it actually working if other features are on the same level? Screenshot seems to show a case where no other objects are undimmed." The author replies with a video (uploaded after compression) and a test location, 21.43/24.79560/113.62701 in OSM.
2. tordans (Tobias, collaborator): test link on map.osm.asia with the setting on. Three observations, which became the to-do list:
   - a UI line at the top left explaining the focus, e.g. "Current focus is level 1;2;3;4;5;6";
   - the setting belongs in the URL, maybe also local storage;
   - it is unclear why a way with no `level`/`indoor` does nothing, and whether node vs. line highlighting (all connected arms vs. only the way) is understandable.
3. koharachan: says the status line is done; says Tobias's reported case on w1507653226 cannot be reproduced; suspects local storage is not merged in; points to the BetteriD fork as the full implementation.
4. The author raises a design point: a node-based approach in a mountain road with a tunnel could light up unrelated lines. Not resolved in the thread.
5. matkoniecz: "is checkbox there because it is done? If yes, can you push these new commits?" The author pushes new commits rebased on `develop`, with the status line (listing the exact levels), the setting (off by default, "happy to flip the default"), the `layer`-only exclusion, and tests. Updated PR description.
6. A later comment from the author pings four maintainers. matkoniecz replies that there is no need to ping him, he monitors PRs, and that he has 201 PRs waiting for review.

**Where it stands** [inferred]

- Functionally discussed and close to a merge candidate, but it still needs a maintainer review and a decision on the default value. The thread does not show an approval.
- The open risks are the performance of restyling all elements on each redraw (not measured), the node-based grouping on long ways, and whether a checkbox is enough discoverability.

**What it means for Maid** [inferred]

- The status-line wording, the URL-plus-prefs setting, and the dim-with-opacity approach are reusable as product decisions. The code is iD-specific (it depends on iD's `surface` classes), so Maid should copy the behaviour, not the diff.

## Features and editing modes worth copying

Each item says where it comes from. Priority is my judgement [inferred].

1. **Level focus that dims instead of hiding** (iD PR #12605, `modules/renderer/map.js` `updateIndoorFocus`) [read]. Selecting an indoor feature dims all features whose `level`/`layer` differ (opacity 0.18 via `.indoor-dim`, the map layers greyed by CSS), keeps the containing building outlines and the selected feature's own parents visible, and sorts focused areas above the others. Opt-in. High priority: it is the fastest way to edit one floor without losing context.
2. **A status line that says what is focused** (iD PR #12605, `modules/ui/indoor_focus_status.js`) [read]. For example "Focused on levels 1; 2; 3". The reviewer asked for it, so the wording and placement are already agreed in the thread.
3. **Floor picker, only at high zoom and only with several floors** (MapComplete `LevelSelector.svelte` and `FloorSelector.svelte`) [read]. The vertical elevator control is a good model for a mobile-friendly picker. The zoom gate (16) avoids showing a picker when the map is zoomed out.
4. **Floor list from features in view** (MapComplete `WithLayoutSourceState.initFloors`) [read]. No separate building model needed for a first version; `0` is always present.
5. **Level value parser with ranges, negatives and `repeat_on`** (MapComplete `TagUtils.LevelsParser` and the `levels` meta tagger) [read]. Copy the grammar: `;` lists, `a-b` ranges, negative levels, and a derived `_level` property for filtering.
6. **New feature inherits the selected level, behind a confirmation** (MapComplete `LayerState.setLevelFilter` `onNewPoint`, `AddNewPoint.svelte`) [read]. Important for avoiding wrong-level features (the problem described in iD issue #12006).
7. **Preset set** (id-tagging-schema `data/presets/indoor/*`) [read]. Room, area, corridor, door, wall, stairwell, elevator, and `level`/`level_semi` fields. Stairs and elevators use `indoor=room` plus `stairs=yes` / `elevator=yes`, which an editor must keep distinct.
8. **Validations that ignore cross-level features** (iD `crossing_ways.js` and `almost_junction.js`) [read]. Two indoor features on different levels are not a crossing. The close-node check also allows nodes that differ in `level`, `layer` or `addr:unit`. Copy these rules, not just the presets.
9. **Extract keeps `level` on both parts** (iD `modules/actions/extract.ts`) [read]. Useful when an indoor area is split off a point.
10. **Setting in the URL and preferences** (iD PR #12605: `indoor_focus=true` in the hash, `prefs('indoor-focus')`) [read]. Matches Maid's URL-state approach; the reviewer asked for it.
11. **Selection gathers levels of parent ways and relations** (iD PR #12605 `collect`, `parentWays`, `parentRelations`) [read]. A staircase node connecting corridors on several levels focuses all of them. The reviewer raised the node-vs-line confusion, and the author's answer was the status line.

What not to copy as-is:

- iD PR #12605 runs its dimming and sorting on every redraw and touches every `.layer-osm *` element (`surface.selectAll('.layer-osm *').classed(...)`) [read]. For large indoor buildings this could be slow. I did not measure it [inferred].
- MapComplete hides other levels; iD PR dims them. Pick one per use case [inferred].
- MapComplete's regex for level matching is not escaped (section 3d) [inferred].

## Open questions

1. Does PR #12605's test suite pass (`test/spec/renderer/indoor_focus.js`)? Not run: no bun, no installs. The reviewer also asked for the commits to be pushed, which the author says was done, but I did not verify the branch.
2. What is the duplicate target of iD issue #12006 (closed 2026-04-14)? The timeline did not show it. Likely #4780, given the 2026-03-11 cross-reference, but not confirmed.
3. Does iD's review process take the dim-instead-of-hide approach, or the maintainer's position from 2019 that big features are deferred? A collaborator (matkoniecz) noted a backlog of 201 PRs waiting for review, and tordans (Tobias) asked for UI and URL state, so the blockers are visible in the thread.
4. Does id-tagging-schema want `repeat_on`, `min_level` and `max_level` as fields? PR #3097 used them in 2016; the schema has none of them today.
5. Is the MapComplete repo still active? Its `develop` snapshot is from 2025-02-28. Check the current state before copying code; the snapshot is good for design and tests, not for current behaviour.
6. Level semantics for Maid: whether the level set is per building (as `building:levels` / `min_level`/`max_level` in the 2016 PR suggest) or only per feature. MapComplete derives floors only from features in view, which fails when a floor has no features on screen.
7. Whether the `level` field should be hidden on buildings (id-tagging-schema's `prerequisiteTag keyNot building`) or shown, since `building:levels` is a different key.

## Sources

Read yourself, via `gh` (read-only):

- https://github.com/openstreetmap/iD/pull/12605 (view, comments, diff; diff saved in a temp file, 719 lines)
- https://github.com/openstreetmap/iD/pull/3097 (view, body)
- https://github.com/openstreetmap/iD/pull/6352 (view, body)
- https://github.com/openstreetmap/iD/pull/6863 (view, body)
- https://github.com/openstreetmap/iD/issues/4780 (comments via `gh api repos/openstreetmap/iD/issues/4780/comments`)
- https://github.com/openstreetmap/iD/issues/12006 (view and timeline via `gh api repos/openstreetmap/iD/issues/12006/timeline`)
- https://github.com/openstreetmap/iD/issues/2660 and #2218 (view)
- https://github.com/openstreetmap/id-tagging-schema/issues/563 (view and all comments)
- id-tagging-schema `data/presets/indoor/*`, `data/presets/_indoor.json`, `data/presets/building_part.json`, `data/fields/level.json`, `level_semi.json`, `indoor.json`, `indoor_type.json`, `room.json`, `ref_room_number.json`, `layer.json` (via `gh api .../contents/...`)
- Code search of id-tagging-schema for `repeat_on`, `min_level`, `indoor` (`gh search code`)

Read in the local iD checkout (read-only), `.reference/id`, commit 0194f3926a59d8db8993892880f2a25d366c7099:

- `modules/renderer/features.js` (lines 125-160), `modules/validations/crossing_ways.js`, `modules/validations/close_nodes.js`, `modules/validations/almost_junction.js`, `modules/actions/extract.ts`, `modules/svg/tag_classes.ts`, `modules/osm/way.ts`, `data/core.yaml`, `css/70_fills.css`, grep of `modules/` for `level`.

Read in MapComplete `develop`, commit `cf368606d31fdc7542de44f1231ec2f25212f87d` (2025-02-28), in the session scratchpad, not in the repo:

- `src/UI/BigComponents/LevelSelector.svelte`, `src/UI/InputElement/Helpers/FloorSelector.svelte`, `src/UI/ThemeViewGUI.svelte` (lines 262-280)
- `src/Models/ThemeViewState/WithLayoutSourceState.ts` (lines 80-110)
- `src/Logic/State/LayerState.ts` (lines 120-162), `src/Logic/SimpleMetaTagger.ts` (lines 436-470), `src/Logic/Tags/TagUtils.ts` (lines 722-770)
- `src/Models/GlobalFilter.ts`, `src/UI/Popup/AddNewPoint/AddNewPoint.svelte` (lines 60-110, 300-325)
- `assets/themes/indoors/indoors.json`, `assets/layers/indoors/indoors.json`, file list of `assets/layers/indoors/`
- `Docs/Themes/indoors.md`, `Docs/Layers/indoors.md` (lines 1-42, 58-112)
- Repo metadata: `gh api repos/pietervdvn/MapComplete` (default branch `develop`, `pushed_at` 2025-02-28)

Inferred, not verified by running: the stated performance risk of PR #12605, the regex-escaping issue in MapComplete, the AddNewPoint checkbox behaviour, the duplicate target of #12006.

Other URLs in the PR and issue text (not opened): http://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging (cited in PR #3097), https://wiki.openstreetmap.org/wiki/Relation:building#For_3D_modelling (cited in #563), https://map.osm.asia/id (the fork where PR #12605 has been running, per the PR author).

Not read: iD PR #10325 and issue #7261 (underground), PR #10999 and issue #7809 (crossing layers), issue #10808 (indoormark beacon) beyond title and state; MapComplete `Docs/TagInfo`, `src/Logic/Tags/TagUtils.ts` `levels` filter tests.
