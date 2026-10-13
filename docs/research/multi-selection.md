# Multi-selection: iD, Maid and the gaps

Audit of 2026-10-13. Read-only: no code changed, no servers, no network, no browser. Paths are repo-relative. iD is read from `.reference/id/` at commit `0194f3926`: iD source paths in the tables are relative to `.reference/id/modules/`, iD data to `.reference/id/data/`, and test titles are from `.reference/id/test/spec/`. "Passing" and "todo" are read from the test files, not from a run.

## Summary

- iD shows several features in one inspector: a selection list, the feature types, the fields shared by all, the raw tags with "Multiple Values", shared issues, and one undo step per edit.
- Maid shows several features as a count, the id list and the edit bar. Nothing else: no fields, tags, type picker, issues or relations.
- Tests: 29 iD tests concern multi-selection. Maid has 9 passing, 6 `it.todo`, 3 covered only by a browser check (not run here) and 11 missing. See 1.5.
- iD has no spec for the inspector's multi sections (selection list, feature type, preset fields, entity issues, membership, preset list, measurement, history). Maid must write its own tests there; copying iD's specs cannot cover them.
- The brief assumed a "3 features" header. iD's header says "Edit features" with no count (`ui/entity_editor.js` 68-70). The count is in the selection list label, "Features (3)" (`ui/sections/selection_list.js` 19-21).

## Built on 2026-10-13

The summary and the gap table above describe the state before fc45983 and d0d7c6d. The following is what was built after them. The base (one write to all features) is 49fe526.

Built:

- The inspector for several (fc45983): a list (click selects one, x takes one out), the type or "Multiple types", the fields all of them have, the tags all of them share, "Multiple values" where they differ. A change is one undo step; a read-only feature in the selection refuses the change, with a toast.
- The tags of several (d0d7c6d): a typed value goes to all; renaming a key keeps each feature's own value; removing a row removes it everywhere; a paste adds or overrides.
- The type of several (d0d7c6d): each feature keeps its own other tags, one undo step; the list offers only types that fit every geometry in the selection.
- The issues of all selected features (d0d7c6d), in iD's order.
- `bun run check-multi` (d0d7c6d): 11 steps in a browser.

Open:

- Relation membership for several: one row per relation, add to all (iD). Not built (D8 above).
- The type picker's empty search shows the first 50 types by name; iD shows its defaults.
- The issue list for several is ordered by type, as iD; the single list is ordered by severity.
- `check-multi` does not cover the type change and the issues yet.
- A pasted `key=*` on a mixed tag is refused with a message; iD skips it silently.
- Shift-click on open ground keeps the selection, and lasso: as in 3.5 above, not covered by these commits.

Not checked here: this section was written from the commit messages and their stats. No test or browser check was run for it.

## Part 1: iD

### 1.1 The inspector for several features

| What | iD | Where |
| --- | --- | --- |
| Header | "Edit feature" for one, "Edit features" for more | `ui/entity_editor.js` `entityEditor` (68-70) |
| Sections, in order | selection list, feature type, entity issues, preset fields, raw tags, member editor, membership editor | `ui/entity_editor.js` (91-101) |
| Selection list | only for more than one (`shouldDisplay`); label "Features (N)"; one row per feature: geometry icon, type name, name; hover highlights it on the map | `ui/sections/selection_list.js` `uiSectionSelectionList` (16-22, 50-127, 76-81) |
| Click a row | selects that feature only | `selectEntity` (37-39) |
| Remove one from the selection | the row's close button re-enters select mode without that id | `deselectEntity` (41-48) |
| Sidebar hands ids over | all selected ids go to the inspector | `ui/sidebar.js` `sidebar.select` (276-300); `modes/select.js` (293) |
| Feature type | always shown; one preset: name and icon; several: "Multiple Types", class `mixed-types`, generic point icon, tag reference hidden | `ui/sections/feature_type.js` `renderDisclosureContent` (29-31, 70-99) |
| Which presets | each feature's match; the distinct presets, most frequent first | `ui/entity_editor.js` `loadActivePresets` (311-343) |
| Raw tags | always there, collapsed by default; read from the combined tags | `ui/sections/raw_tag_editor.js` (26); `ui/entity_editor.js` (35, 112) |
| Member editor | one feature only | `ui/sections/raw_member_editor.js` (26-29) |
| Membership editor | one row per relation, roles combined, add to all selected | `ui/sections/raw_membership_editor.js` (107, 126-146, 251-262) |
| Entity issues | shown when any shared issue exists | `ui/sections/entity_issues.js` (24-26, 43); `core/validator.js` `getSharedEntityIssues` (349-380) |
| Operations | commands for the selection; availability depends on the geometry mix (other report) | `modes/select.js` (203-209) |

One line each: the measurement panel totals the selection (`ui/panels/measurement.js` 51-107); the history panel says "N features" (`ui/panels/history.js` 106-128). iD has no tests for either.

### 1.2 Tags of several features

`utilCombinedTags` in `util/util.ts` (408-475) builds the combined tags:

- Keys: the union over all features.
- Value: the first feature's value is kept. A different value makes an array. An equal value is not added twice.
- A key absent on some features enters the array as `undefined`: a key on 2 of 3 features gives `['x', undefined]`. A key on all with one value stays a plain string.
- Array values are sorted by count, then alphabetically; `undefined` sorts last.
- The per-feature tag lists are attached as the non-enumerable `Symbol.for('allTags')` (line 473). `ui/fields/access.js` (305) reads them.

Raw tag editor, `ui/sections/raw_tag_editor.js`:

| Case | iD | Where |
| --- | --- | --- |
| Key with several values | value input empty; title lists the non-empty values, one per line; class `mixed`; placeholder "Multiple Values" | 259-279 (title 261-263, class 264-266, placeholder 267-268) |
| Suggestions for a mixed value | the key's distinct values; "(empty)" for an absent feature. No taginfo | `bindTypeahead` (388-414) |
| Suggestions for a key | taginfo keys for the geometry of the first feature, keys in use removed | 416-434 |
| Text view | a mixed value is written as `*`; an unchanged `*` is skipped on save | `rowsToText` (337-338); `textChanged` (369-370) |
| Typed value | written to every feature | `ui/entity_editor.js` `changeTags` (159-215) |
| Blank in a mixed value | ignored, so a blank does not override | `valueChange` (545-546) |
| Key rename | each feature keeps its own value (`{oldKey}`) | `keyChange` (518-522); `changeTags` (176-177) |
| Add a key | the value is written to every feature, replacing theirs | `keyChange` (523-529) |
| Remove a key | removed from every feature that has it; deletes only where present | `removeTag` (562-571); `changeTags` (178) |
| Read-only rows | regex list `readOnlyTags`; set by the data and commit panes only, not by the selection | `raw_tag_editor.js` (291-298); `ui/data_editor.js` (13); `ui/commit.js` (47) |
| Undo label | "Changed tags." for one and for many, no count | `ui/entity_editor.js` (201, 258); `data/core.yaml` (89-90) |
| One undo step | all actions of an edit in one `perform`; while typing, `replace` coalesces | `changeTags` (193-209) |
| Revert | per key, over all features, to each feature's base tags | `ui/entity_editor.js` `revertTags` (217-268) |

### 1.3 Preset and fields

- Each feature gets its preset from `presetManager.match` (`presets/index.js` 195-206). With no match the fallback is `_this.fallback(geometry)` (`presets/index.js` 268). iD has no `presetManager.defaultPreset`.
- `matchAllGeometry`: `presets/collection.ts` (35-37), `presets/preset.ts` (111). The preset list uses it for the selection (`ui/preset_list.js` 27, 147). Choosing a preset runs `actionChangePreset` for each feature in one undo step (`ui/preset_list.js` 405-423).
- Fields shared: a field is shown when every preset has it and it matches every geometry in the selection (`ui/sections/preset_fields.js` 47-68, 72-78, 93-99). The restrictions field only for one node at a highway intersection (80-85). Universal fields go to "more fields" (87-99).
- Field gating: `ui/field.js` `isAllowed` (342-347) drops a type with `supportsMultiselection === false`: wikipedia (`ui/fields/wikipedia.js` 332), restrictions (`ui/fields/restrictions.js` 661). `radio.isAllowed` (`ui/fields/radio.js` 425-427) says "one feature", but nothing calls it.
- Revert and remove (`ui/field.js` `revert` 117-140, `remove` 142-155) work on all keys and all features, in one event per field.

Per field type, what several values do:

| Type (iD file) | With several values | Where |
| --- | --- | --- |
| text, url, email, tel, identifier, number, integer, colour, schedule; date is text (`ui/fields/input.js`) | placeholder "Multiple Values", title, class `mixed`; a blank does not override; steppers do nothing | `input.js` 139-142 (steppers), 455 (blank), 559-561 (display) |
| textarea | same as text | `ui/fields/textarea.js` 52-53, 66-71 |
| combo, typeCombo, networkCombo | placeholder; blank does not override; no icon | `ui/fields/combo.js` 545-546, 607-608, 809-1013 |
| semiCombo, multiCombo, manyCombo | list from the key's tags; for multi-key fields the key union over `context.selectedIDs()` | `combo.js` 29, 57, 805-830; `input.js` `getVals` (425-441) |
| radio, structureRadio | a value is mixed when some feature has it; title "not shared by all features" | `ui/fields/radio.js` 340-375 |
| check, defaultCheck, onewayCheck | indeterminate box, "Multiple Values"; a click sets yes if any feature has yes, else the first value, on all features | `ui/fields/check.ts` 139-146, 210-230 |
| onewayCheck reverser | reverses each feature's way; annotation with `n` fixed to 1 | `check.ts` reverser click |
| access | one row per mode; placeholder is the implied value when all agree, else "Multiple Values"; a blank does not override | `ui/fields/access.js` 77, 287-301, 305-330 |
| directionalCombo, cycleway | left and right harmonized over the selected features; a write sets both sides | `ui/fields/directional_combo.js` `tags` (about 130-175), `change` (85-127) |
| address | each subfield mixed; a blank does not override | `ui/fields/address.js` 395-396, 419-420, 462-463 |
| localized | name variants mixed; a blank does not override | `ui/fields/localized.js` 257-258, 468-487 |
| roadspeed, roadheight | placeholder and class `mixed`; a blank does not override | `roadspeed.js` 107-108, 154-155; `roadheight.js` 130-131, 199-203 |
| wikidata | placeholder and class `mixed` | `ui/fields/wikidata.js` 302-306 |
| wikipedia, restrictions | not offered for several | see above |
| brand, network, operator, flag | locked when any selected feature has `wikidata`, or is a suggestion with a `*:wikidata` | `ui/fields/input.js` `calcLocked` (56-80) |
| lanes | no `lanes` entry in the iD field map (`ui/fields/index.ts`) | not checked further |

### 1.4 Validation, relations and history, one line each

- Validation: `getSharedEntityIssues` returns the issues that involve any selected feature, sorted by type (`core/validator.js` 349-380).
- Relations: membership lists one row per relation with the combined roles; add and remove apply to all (1.1).
- Operations: availability by geometry mix (circularize, extract, straighten) is for the operations report.
- Info panels: measurement and history (1.1).

### 1.5 iD tests on multi-selection

Maid state: passing (read, not run), todo (`it.todo`), browser only (covered by `tools/bench/interactions-check.ts`, not run here), missing.

| # | iD spec | iD test title | What it asserts | Maid state |
| --- | --- | --- | --- | --- |
| A1 | `util/util.js` | sorts tag values by frequency then alphabetically | five nodes: values by count, then alphabetically | todo: `packages/model/test/id/util/util.test.ts:96` (F-util-7) |
| A2 | `util/util.js` | returns raw value when all entities share the same tag value | two nodes, same value: a plain string | todo: same file, line 97 |
| A3 | `ui/fields/access.js` | sets correct placeholder on a multi selection | foot and motor vehicle show "Multiple Values"; bicycle shows "no" | todo: `packages/ui/src/inspector/fields/id-access.test.ts:97` (F-ui-6) |
| A4 | `ui/fields/directional_combo.js` | populates the left/right fields using :left/:right and :both | two features harmonized | todo: `id-directional_combo.test.ts:82` |
| A5 | `ui/fields/directional_combo.js` | missing explicit direction tag should be reported like a conflicting value | a missing side counts as a conflict | todo: `id-directional_combo.test.ts:83` |
| A6 | `presets/preset.js` | #matchAllGeometry: returns false if they don't all match | `['line']` does not match point and line | passing: `packages/presets/src/id-preset.test.ts:53` |
| A7 | `presets/preset.js` | #matchAllGeometry: returns true if they do all match | equal sets match | passing: `id-preset.test.ts:58` |
| B1 | `behavior/select.js` | click on empty space clears the selection | click on open ground clears | browser only: `tools/bench/interactions-check.ts:130` |
| B2 | `behavior/select.js` | shift-click on unselected entity adds it to the selection | shift-click adds | browser only: `interactions-check.ts:101-102` |
| B3 | `behavior/select.js` | shift-click on selected entity removes it from the selection | shift-click takes it out | browser only: `interactions-check.ts:110` |
| B4 | `behavior/select.js` | shift-click on last selected entity clears the selection | removing the last clears | missing |
| B5 | `behavior/select.js` | shift-click on empty space leaves the selection unchanged | shift on open ground changes nothing | missing; Maid differs (2.1) |
| B6-B13 | `modes/select.js` (8 tests: 26, 47, 70, 95, 113, 133, 153, 178) | selects all child nodes when an open way, a closed way or a way with a revisited node is selected; does not affect selection when a node, a vertex or a relation is selected; selects shared child node when two connected ways are selected; does not affect selection when two independent ways are selected | selecting a way adds its nodes; other kinds do not | missing; no such selection in Maid (grep of `apps/`, `packages/`) |
| B14 | `behavior/lasso.js` | can be initialized | lasso exists | missing; no lasso code (F-beh-3) |
| C1-C6 | `operations/circularize.js` | availability for a multiselection: closed ways; unclosed ways forming a ring; unclosed ways not forming a ring; closed way and a non-way; closed way and unclosed ways forming a loop; ... not forming a loop | availability by the mix | passing: `packages/operations/src/id-circularize.test.ts:66, 73, 78, 82, 88`; todo: `:71` (F-ops-1) |
| C7 | `osm/entity.js` | combines combined tags | `mergeTags` joins values with `;` (merge action, not the inspector) | passing: `packages/model/test/data/OsmEntity.test.js:354` |
| C8 | `osm/entity.js` | combines combined tags with whitespace | same, with spaces | passing: `OsmEntity.test.js:361` |

Counts: 29 tests. Maid: 9 passing (A6, A7, C1-C8 except the todo), 6 todo (A1-A5, C ring), 3 browser only (B1-B3), 11 missing (B4, B5, B6-B13, B14).

Related single-feature tests, not counted: raw tag editor (4 tests, todo in `apps/maid/src/id-raw_tag_editor.test.ts`, F-ui-18), entity editor (1 test, todo, F-ui-16), `actions/change_tags.js` (1 test, passing), `ui/multiCombo.ts` (18 tests, adopted in `id-multiCombo.test.ts`).

## Part 2: Maid today

### 2.1 Selecting several

- Shift-click: `apps/maid/src/components/MapView.tsx` `handleClick` (378-381). Shift adds or removes the first feature under the pointer.
- Shift on open ground: `id` is `null`, the shift branch is skipped, and `select(id)` (383) runs with `null`. `apps/maid/src/selection.ts` turns that into `[]`, which clears the selection. iD keeps it (`behavior/select.js` 242-243 `isMultiselect`; 340-370 "targeting nothing" changes nothing when multiselect). Found by reading; not run.
- Right click (`MapView.tsx` `openMenu`, 241): a feature not in the selection is selected first; one in it keeps the selection.
- Lasso: none (`grep -rni lasso apps packages`). `docs/research/interactions-vs-id.md:74` agrees.
- State: `apps/maid/src/selection.ts` `useSelection` (9-19) reads the URL `id=w1,n2` and calls `engine.setSelected` (`packages/renderer/src/engine.ts` 1509-1523). `id` is the first id.
- Stack: `apps/maid/src/stack.ts` `keepsStack` keeps it only for exactly one selected feature. Favourite keys do nothing for several (`apps/maid/src/favourites.ts` 85).

### 2.2 The inspector for several

- `apps/maid/src/components/Inspector.tsx` 77-93: header "N features selected", the id list as subtitle, the hint "Shift-click adds a feature...", and `<Operations />`. Nothing else.
- Not rendered for several (everything below line 93 is for one feature): fields (117-124, `presets.fieldsFor` with one preset and geometry), the type picker (136, 159), the Fields disclosure (199-225), the Tags list (226-228), the inspector sections (229: element info, validation, relations).
- No feature list. The only way to remove one from the selection is Shift-click on the map.
- Operations: `apps/maid/src/commands.ts` `useEditCommands` (74-121) for all ids. `engine.runOperation` (`packages/renderer/src/engine.ts` 744-763) refuses when any selected feature is read-only (746).

### 2.3 Fields and presets

- `Tags` is `Record<string, string>` in every package (`packages/presets/src/types.ts:1`, style, filters). An array value cannot exist.
- `FieldProps` (`packages/ui/src/inspector/fields/shared.ts` 4-17): `field`, `tags: Tags`, `onChange(key, value)`. No ids, no several-value data. `PresetFields` (`packages/ui/src/inspector/fields.tsx` 71-91); the component map (37-64).
- Each field reads one string: `Text.tsx` 20, 36 (`tags[key] ?? ''`); `Multi.tsx` 61 (`semiList(tags[key])`); `Check.tsx` 14; `Radio.tsx` 183; `Access.tsx` 19-55 (implied value per feature); `fields/directional-logic.ts`.
- Check "mixed" already exists but means "unset": `packages/ui/src/inspector/logic.ts` `checkState` (200-209). The name is taken.
- `packages/presets/src/presets.ts` `fieldsFor` (624-637) and `moreFieldsFor` (648) take one preset and one geometry.
- `matchAllGeometry`: `presets.ts` 915-918, type `types.ts` 114-115, tests `id-preset.test.ts` 52-61 (passing). No caller in `apps/` or `packages/ui`. The preset picker searches by one geometry (`Inspector.tsx` 169).
- "Multiple values" text: none in `packages/ui/src` or `apps/maid/src` (grep, 2026-10-13).

### 2.4 Raw tags

- `apps/maid/src/components/TagList.tsx` 12-51: rows from one `tags`; without `onChange` a read-only table; `AddTag` below.
- `TagRow.tsx` 14-55: one value input, written on Enter or blur (`draft.trim() || undefined`), a remove button. The key is text, not editable.
- `AddTag.tsx` 10-46: key and value both required; one tag.
- Undo label: `engine.setTag` (`engine.ts` 639-647) calls `setTags` (649-652), default "Changed tags", one id.
- No text view, copy of rows or suggestions in the tag list.

### 2.5 Type picker, menu, validation, relations, undo

- `changeType(id, preset)` (`apps/maid/src/favourites.ts` 64-70): one feature. It uses `presets.applyPreset(entity.tags, preset, geometry, entity.preset)`, so the per-feature logic exists.
- Context menu (`apps/maid/src/components/MapContextMenu.tsx`): "Here: N features" lists the stack; commands from `useEditCommands`.
- Validation: `apps/maid/src/modules/validation.tsx` 201 uses `store.validator.issuesFor(entity.id)`; `packages/validation/src/validator.ts` 189 is per feature. The dock view "Issues" lists all issues.
- Relations: `apps/maid/src/modules/relations.tsx` 671-694: "Members" for relations, "Relations" for one feature. Element info: `apps/maid/src/modules/element-info.tsx` 55-65, one feature. None of these render for several.
- Journal: `packages/journal/src/journal.ts` 44: each edit has an annotation shown in the undo and redo menus. `engine.ts` 905-911 `edit` takes one action and one annotation. A change to several features fits one commit with `selectedIDs`; the engine has no entry point for it yet.

### 2.6 Model helpers

- `packages/model/src/util/` has `clone.ts`, `ids.ts`, `iterable.ts`. No combined-tags helper (grep "combined" in `packages/model/src`: none).
- `packages/model/test/id/util/util.test.ts` 94-98: the two iD tests as `it.todo` ("needs F-util-7").
- `actionChangeTags(entityID, tags)` (`packages/model/src/actions/change_tags.ts` 12-16) takes one id.
- `OsmEntity.mergeTags` (`packages/model/src/data/OsmEntity.ts` 350) is tested (C7, C8). It is the merge helper, not a combined-tags helper.

### 2.7 Earlier reports, checked against the code

| Item | Earlier report | Now |
| --- | --- | --- |
| F-ui-6 "Multiple values" (`docs/research/id-tests/ui.md:40`) | todo; no such text | still true. The Shift-click line it cites (334) is now 378-381 |
| F-util-7 (`geo-util.md:48`) | todo; helper target `packages/ui/src/inspector` | still todo. The ported test is already in `packages/model/test/id/util/util.test.ts`, so the helper belongs in `packages/model` |
| F-presets-1 (`presets.md:22`) | todo | stale. `matchAllGeometry` is built (`presets.ts` 915-918) and both iD tests are adopted and not todo. No app code calls it |
| directional "handle multiselection" (`ui.md`) | todo | still todo (`id-directional_combo.test.ts:81-84`) |
| `docs/build-out/steps.md` B2 (line 39) | multi-selects not done | still true |
| `docs/build-out/steps.md` U7 known gaps | remove and revert write one undo step per key | not re-read here |

## Part 3: Gaps and a build plan

### 3.1 Gap table

| # | Behaviour | iD (file) | Maid today | Gap | Size | Package | iD tests that would pass | Maid tests to add |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Header, sections, selection list, remove one | `entity_editor.js`, `selection_list.js` | count, ids, Operations (`Inspector.tsx` 77-93) | the whole multi inspector | L | `apps/maid`, `packages/ui` | 0 | row order; remove one keeps the rest; header text |
| 2 | Combined tags and a typed mixed value | `util.ts` 408-475 | none | helper and type | S | `packages/model` | A1, A2 | absent key is `missing`; frequency then alphabetical; one value stays `one` |
| 3 | One write to all features, one undo step | `entity_editor.js` 159-215 | `engine.setTag` on one id | `engine.changeTags` | M | `packages/renderer` | 0 (no iD spec) | set and remove on two; rename keeps each value; one undo; read-only (D6) |
| 4 | Remove a key from all | `field.js` 142-155; `raw_tag_editor.js` 562-571 | per key, per field | one call for all keys | S | `ui`, `renderer` | 0 | remove on two features, one undo |
| 5 | Fields shared by all presets and geometries | `preset_fields.js` 47-99 | `fieldsFor` one preset (`presets.ts` 624) | `fieldsForAll` | M | `packages/presets` | 0 (A6, A7 cover only `matchAllGeometry`) | intersection; geometry filter; universal fields in "Add field" |
| 6 | Default "Multiple values" for any field type | `input.js` 139-561, `textarea.js` 52-71, `combo.js` 545-1013 | none; `Text.tsx` reads `tags[key]` | wrapper in `Row.tsx` | M | `packages/ui` | 0 | placeholder; title; blank does not write |
| 7 | Check mixed: indeterminate, click chooses | `check.ts` 139-146, 210-230 | `checkState` "mixed" = unset | three states for several | S | `packages/ui` | 0 | click gives yes or the first value; indeterminate |
| 8 | Radio mixed | `radio.js` 340-375 | `Radio.tsx` 183, one value | mixed button | S | `packages/ui` | 0 | a value on some features is mixed |
| 9 | Access placeholders per mode | `access.js` 77, 287-330 | `Access.tsx` implied per feature | needs each feature's tags (D10) | M | `packages/ui` | A3 (todo now) | placeholder when features differ |
| 10 | Cycleway, both sides harmonized | `directional_combo.js` | `directional-logic.ts`, one feature | harmonize over features | M | `packages/ui` | A4, A5 (todo now) | conflict on a missing side |
| 11 | Multi-value combos | `combo.js` 805-830; `input.js` 425-441 | `Multi.tsx` 61; `multi-logic.ts` 151 | chips from several | M | `packages/ui` | 0 | chip dashed when mixed |
| 12 | Address, localized, roadspeed, roadheight, wikidata | `address.js`, `localized.js`, `roadspeed.js`, `roadheight.js`, `wikidata.js` | `Address.tsx`, `Localized.tsx`, `Number.tsx`, `Link.tsx` | per-subfield state | L | `packages/ui` | 0 | per field |
| 13 | Preset change for several | `preset_list.js` 405-423 | `changeType` one id (`favourites.ts` 64) | `changeTypeMany` | M | `apps/maid`, `packages/presets` | 0 (`change_preset.js` is single) | each keeps its own preset tags; one undo |
| 14 | "Multiple types" label and icon | `feature_type.js` 29-31, 89-99 | single preset (`Inspector.tsx`) | label, icon | S | `packages/ui` | 0 | label when presets differ |
| 15 | Shift-click on open ground keeps selection | `behavior/select.js` 242-370 | clears (`MapView.tsx` 378-383) | pure rule | S | `apps/maid` | B1, B5 (B5 missing) | table of shift and click cases |
| 16 | Lasso (Shift-drag box) | `behavior/lasso.js` | none | box selection | M | `packages/renderer`, `apps/maid` | B14 (todo in iD terms) | features in a box; read-only excluded |
| 17 | Shared issues for several | `entity_issues.js` 24-43; `validator.js` 349-380 | `issuesFor(entity.id)` | `issuesForAll` | M | `packages/validation`, `apps/maid` | 0 | any involved feature; sort order |
| 18 | Membership for several | `raw_membership_editor.js` 107-146, 251-262 | `relations.tsx` one feature | membership for several | L | `apps/maid` | 0 | one row per relation; add to all |
| 19 | Lock brand, network, operator, flag with wikidata | `input.js` 56-80 | none | lock state | S | `packages/ui` | 0 | any selected feature with `wikidata` locks |
| 20 | Read-only feature in the selection | no filters in iD (not checked) | refusal in `engine.ts` 746 and 639 | rule D6 | S | `packages/renderer` | 0 | refusal names the feature |

### 3.2 Design notes

**One place for combined tags.** Put it in `packages/model/src/util/combined-tags.ts`, with the ported tests already in `packages/model/test/id/util/util.test.ts`:

```ts
export type Combined =
  | { kind: 'one'; value: string }                          // every feature has this value
  | { kind: 'mixed'; values: string[]; missing: boolean }    // distinct non-empty values, most frequent first; missing: some feature lacks the key

export type CombinedTags = Readonly<Record<string, Combined>> // a key on no feature is not in the record

export function combineTags(features: readonly Tags[]): CombinedTags
export function applyTagChanges(tags: Tags, changes: TagChanges): Tags // iD's changeTags rules
```

Why this shape: iD's string-or-array needs an `Array.isArray` check in about 30 lines of `ui/fields`. Here the type forces the check. `undefined` never appears in `values`; absence is `missing`. `packages/ui` does not depend on `packages/model` directly. It reaches it through `packages/renderer`, or add the dependency (one line in `packages/ui/package.json`).

**One write function.** `engine.changeTags(ids, changes, annotation = 'Changed tags')` in `packages/renderer/src/engine.ts`, next to `setTags` (649). It maps `applyTagChanges` over the features, builds one action per changed feature, and calls `edit` once. `setTag(id, key, value)` becomes a call with one id. Changes keep iD's shapes: `undefined` and `''` remove (as `setTag` does now); `{ oldKey }` renames and keeps each feature's value. The inspector's `onChange` binds the ids: `(key, value) => engine.changeTags(ids, { [key]: value })`.

**A field that knows nothing about several values.** Add two optional props to `FieldProps` (`packages/ui/src/inspector/fields/shared.ts` 4-17):

```ts
/** Several features only: every key of the selection. Absent for one feature. */
combined?: CombinedTags
/** Several features only: each feature's tags. Only for fields that need them (access, directional). */
features?: readonly Tags[]
```

`tags` stays `Tags`. For several features it holds the `one` values; a `mixed` key is absent from it. The default wrapper in `packages/ui/src/inspector/fields/Row.tsx` checks `combined[key]`: for `mixed` it gives the control `value=''`, placeholder "Multiple values", the values as title, class `mixed`, and drops a blank write. Text, number, url, email, tel, identifier, colour, date, textarea and combo get this without changes of their own.

These handle more themselves: Check, Radio, Access and Directional (needs `features`), Multi (semi, multi, many), Address, Localized, Number (roadspeed, roadheight), Link (wikidata). `PresetFields` (`fields.tsx` 71-91) passes `combined` and `features` to each row. `defaultFieldComponents` (37-64) needs no change. iD's `supportsMultiselection` becomes a list of types "not for several" (wikipedia, restrictions), checked where rows are built.

**The raw tag grid.** The grid takes `combined` and the selected ids, not one feature's tags:

- A `one` key is a plain cell. A `mixed` key is a "mixed" cell: placeholder "Multiple values", the values in a tooltip, and the suggestions are the `values`. iD uses local values only for mixed keys, no taginfo (`raw_tag_editor.js` 388-414).
- A key with `missing: true` shows a marker such as "on 2 of 3". iD shows "(empty)" in the suggestions (396-404).
- A typed cell writes to all selected features in one undo step through `engine.changeTags`. A blank in a mixed cell is ignored (iD 545-546).
- Renaming a mixed key keeps each feature's own value (`{ oldKey }`, iD 176-177). Removing a row removes the key from every feature that has it (iD 562-571). Adding a row writes the value to all selected (iD 523-529).
- Paste of `key=value` lines uses the same write. A line `key=*` for a mixed key is a no-op (iD 369-370).
- Copy: `key=value` for `one`, `key=*` for `mixed`, as iD's text view does (337-338). See D11.

**Which existing types and components change.**

| File | Change |
| --- | --- |
| `packages/model/src/util/combined-tags.ts` | new: `Combined`, `CombinedTags`, `combineTags`, `applyTagChanges` |
| `packages/renderer/src/engine.ts` | `changeTags` next to `setTags` (649); `setTag` delegates; `runOperation` unchanged |
| `packages/ui/src/inspector/fields/shared.ts` | `FieldProps` gets `combined?`, `features?` |
| `packages/ui/src/inspector/fields.tsx` | `PresetFields` props and pass-through |
| `packages/ui/src/inspector/fields/Row.tsx` | default mixed state |
| `packages/ui/src/inspector/logic.ts` | `checkState` "mixed" renamed "unset" |
| `Check.tsx`, `Radio.tsx`, `Access.tsx`, `directional-logic.ts`, `Multi.tsx`, `Address.tsx`, `Localized.tsx`, `Number.tsx`, `Link.tsx` (same folder) | own mixed handling |
| `packages/presets/src/presets.ts`, `types.ts` | `fieldsForAll`, type entry |
| `packages/validation/src/validator.ts`, `types.ts` | `issuesForAll(ids)` next to `issuesFor` (189, 106) |
| `apps/maid/src/components/Inspector.tsx` | several branch (77-93); `onChange` binds ids (95-98); fields and tags for several |
| `apps/maid/src/components/TagList.tsx`, `TagRow.tsx`, `AddTag.tsx` | take `combined` and the ids |
| `apps/maid/src/favourites.ts` | `changeTypeMany` next to `changeType` (64-70) |
| `apps/maid/src/selection.ts` | a pure `without(ids, id)` helper |
| `apps/maid/src/components/MapView.tsx` | the Shift rule as a pure function (378-383) |

### 3.3 Implementation steps

Each step is one package, one agent, under 100k tokens of context, effort `high` at most (AGENTS.md). Each ends with `bun run check` and the named test.

1. **Combined tags (model).** `combineTags`, `applyTagChanges`, types. Un-todo A1, A2 in `packages/model/test/id/util/util.test.ts`; add absent-key, one-value and blank cases. Done when that file has no todo for them.
2. **Engine write (renderer).** `engine.changeTags`; `setTag` delegates. Tests: set on two; delete only where present; rename keeps each value; one undo step; read-only per D6.
3. **Mixed default (ui).** `FieldProps.combined`, `PresetFields` pass-through, `Row.tsx` default via a pure `mixedDisplay(combined, key)`. Test: `mixed-logic.test.ts`.
4. **Check (ui).** Rename "mixed" to "unset" in `logic.ts`; indeterminate for mixed; click gives yes or the first value (`check.ts` 139-146).
5. **Radio (ui).** Mixed button when some feature has the value.
6. **Access (ui).** Placeholder per mode from `features`. Un-todo A3 (`id-access.test.ts:97`).
7. **Directional (ui).** Harmonize over `features`. Un-todo A4, A5.
8. **Multi-value combos (ui).** Chips from `combined`; dashed chip when mixed.
9. **Address, localized, number, link (ui).** One test file per family; split if large.
10. **Shared fields (presets).** `fieldsForAll(presets, geometries)`: intersection, then `matchAllGeometry`. Maid's own tests (iD has none).
11. **Several branch, UI parts (ui).** Header "Edit features", selection list with per-row select and remove, "Multiple types" label. Tests: the list's pure helpers.
12. **Several branch, wiring (apps/maid).** `Inspector.tsx`: shared fields (step 10), `TagList` with `combined`, `onChange` through `changeTags`, Operations kept.
13. **Shift on open ground (apps/maid).** Pure rule in `apps/maid/src/selection-rules.ts`, used by `MapView.tsx`. Tests: iD cases B1-B5.
14. **Change type for several (apps/maid).** `changeTypeMany(ids, preset)`: `applyPreset` per feature, one undo step. Test: each feature keeps its own tags.
15. **Shared issues (validation, apps/maid).** `issuesForAll(ids)` and an "Issues" section in the several branch. Maid's own tests.
16. **Lasso (renderer, apps/maid).** Shift-drag box selection, read-only excluded. Test: the pure "features in box" function.
17. **Raw tag grid (apps/maid, when rebuilt).** On steps 1 to 3, with the rules above.
18. **Locks (ui).** After D9.
19. **Membership for several (apps/maid, L).** After D8.

### 3.4 Decisions for the owner

| # | Decision | Options | What iD does | Recommendation |
| --- | --- | --- | --- | --- |
| D1 | Several features of different geometries: fields | (a) shared fields that match every geometry; (b) tags only | (a), `preset_fields.js` 72-99 | (a); `matchAllGeometry` already exists |
| D2 | Several features with different presets | (a) "Multiple types" and shared fields; (b) hide the type picker | (a), `feature_type.js` 96-99 | (a); the picker offers presets matching every geometry |
| D3 | A field written to several features | (a) all features (iD); (b) only those with the key | (a), `entity_editor.js` 159-215 | (a); a blank never clears a mixed value; removing is explicit |
| D4 | Undo label for several | (a) "Changed tags." (iD); (b) "Changed tags on 3 features" | (a) | (a) now; (b) later if wanted |
| D5 | Shift-click on open ground | (a) keeps the selection (iD); (b) clears (today) | (a), `behavior/select.js` | (a) |
| D6 | A read-only feature among several | (a) refuse the whole change and say why, as `runOperation` does (`engine.ts` 746); (b) change the others | not checked (iD has no read-only filter) | (a), with the reason shown in the inspector |
| D7 | Shared issues for several | (a) show; (b) only in the Issues dock | (a), `entity_issues.js` | (a) |
| D8 | Membership for several | (a) one row per relation, add to all (iD); (b) hide until later | (a), `raw_membership_editor.js` | (b) for now; large |
| D9 | Lock brand, network, operator, flag when a selected feature has `wikidata` | (a) lock (iD); (b) do not | (a), `input.js` 56-80 | (a); it protects data, and U7 step 17 is open |
| D10 | Access and directional need each feature's tags | (a) pass `features`; (b) compute from `combined` | (a), `allTags` symbol, `util.ts` 473 | (a); access placeholders need per-feature implied values |
| D11 | Copy of a mixed row in the grid | (a) `key=*` (iD text view); (b) the values | (a), `raw_tag_editor.js` 337-338 | (a) |

### 3.5 Five biggest gaps

1. The inspector shows nothing for several features but a count and the edit bar (`Inspector.tsx` 77-93).
2. No combined-tags helper and no typed mixed value. `Tags` is `Record<string, string>` everywhere, and the iD test that would prove the helper is todo (`util.test.ts` 96-97).
3. Writes take one id: `engine.setTag` (`engine.ts` 639), and `FieldProps.onChange` has no ids. Several features need `changeTags` in one undo step.
4. No field has a several-values state. Check, Radio, Access, Directional and Multi read one string. A text field given a mixed key would show an empty value that looks unset.
5. Shift-click on open ground clears the selection (`MapView.tsx` 378-383), where iD keeps it (`behavior/select.js`, "shift-click on empty space leaves the selection unchanged"). Lasso is missing (F-beh-3).

Proposed type for a mixed value: `Combined` as in 3.2, with `values` and `missing`. The state keeps the name "mixed"; the check state "mixed" is renamed "unset" to avoid the clash.

## Not checked

- No test was run. "Passing" and "todo" are read from the test files. The counts in `docs/research/id-tests/ui.md` were not re-checked by running them.
- No browser check was run. Maid's Shift behaviour is read from `MapView.tsx`, not seen on screen.
- Absence claims (no lasso, no "Multiple values" text, no caller of `matchAllGeometry`, no iD spec for a section) come from grep at the time of writing. A grep miss is possible.
- iD's read-only handling for several: iD has no filters, so there is no direct equivalent (D6).
- iD's date and colour fields were classed by the type map and `input.js`, not each branch read. `lanes` has no entry in iD's field map. iD's `radio.isAllowed` (unused) and the wikipedia and restrictions flags are as read; their runtime use was not traced.
- Maid's validator internals and the journal's storage were not read in full. Operations for several belong to the operations report; only circularize's six tests were counted. Effort and context sizes in 3.3 are estimates.
