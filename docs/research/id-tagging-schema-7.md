# id-tagging-schema 6.19.2 to 7.3.0: what Maid needs

Compared 2026-10-15: the 6.19.2 data (the copy in `.reference/rapid/node_modules`, which is the version Maid had) and the 7.2.0 data (`packages/presets/node_modules/@openstreetmap/id-tagging-schema`, the version Maid now has). 7.3.0 is not installed (section 7). Counts come from reading the two `dist/` folders. Anything read from code and not run is marked **(inferred)**.

## 1. Size of the change

- Presets: 1731 in 6.19.2, 1737 in 7.2.0. 11 added, 5 removed, 1356 changed. 1210 of the changed presets differ only in `fields` or `moreFields` (not audited one by one).
- Fields: 13 added, none removed, 6 changed type (section 2).
- Deprecated tags: 503 entries in 6.19.2, 502 in 7.2.0 (the footway-to-path suggestion was stopped, #2788). The shape is the same.
- Preset categories: 17 in 6.19.2, 18 in 7.2.0.
- Discarded keys: 56 in both. None has an object value in 7.2.0 (the object form exists in the code, not yet in the data).
- Icons: 870 distinct icons in 7.2.0. All except 26 pinhead icons are in Maid's bundled sprites (`packages/shell/public/sprites`).

## 2. Breaking changes (7.0.0 migration guide) and how Maid reads them

| # | Change | Where Maid reads it | Status |
| --- | --- | --- | --- |
| 1 | `prerequisiteTag` has `values` and `valuesNot` | `packages/presets/src/presets.ts`, `prerequisiteHolds` and the picked fields | Handled. 5 fields in 7.2.0 use the list forms; the branch is tested in `as-id.test.ts`. |
| 2 | New field type `schedule` | `packages/ui/src/inspector/fields.tsx` (the type registry) | **Regression, not fixed here.** Unlisted types get `FallbackField`. See the list below. |
| 3 | New field type `integer` | same registry | **Regression, not fixed here.** `lanes` was `number` (`NumberField`), now falls back to a plain input. |
| 4 | `terms` and `aliases` are arrays in `translations/*.json` | `packages/presets/src/presets.ts`, `wordList` and `translatedList` | **Was broken, fixed.** The reader took strings only, so all terms and aliases were dropped (the "espresso" test failed). Now both forms are read. |
| 5 | `discarded.json` values can be objects (`{ "yes": true }`) | `packages/presets/src/discarded.ts` (typed), `packages/shell/src/save/clean-tags.ts` (reads it) | Handled by the code. No object entries in 7.2.0 yet. |
| 6 | `pinhead-` icon prefix (new icon set) | `packages/shell/src/images.ts`, `SPRITE_OF_PREFIX` | **Regression, not fixed here.** No pinhead sprite is bundled (`packages/shell/public/sprites/NOTICE.md`). 27 presets use it (26 distinct icons). |
| 7 | References and implicit inheritance are expanded at build time | `packages/presets/src/presets.ts` (`referenceOf`, `resolveList`) | Harmless. No `{...}` reference strings are left in the 7.2.0 presets, fields or English translation. The old reference code is now unused by the bundled data. |

Field types that changed (6.19.2 to 7.2.0):

- `collection_times`, `service_times`: `text` to `schedule`. They lose `TextField` and get `FallbackField`.
- `opening_hours`, `opening_hours/drive_through`: `combo` to `schedule`. They lose the combo UI.
- `lanes`: `number` to `integer`. It loses `NumberField`.
- `surveillance/type`: `combo` to `radio`. Maid has a radio field, so no action.

The migration guide's short-term options for the UI: treat `schedule` as `text` and `integer` as `number`. Both are one line each in `fields.tsx`.

The pinhead gap: the 27 presets used maki or fa icons in 6.19.2 (for example `aeroway/terminal` was `maki-airport`, `amenity/childcare` was `fas-child-reaching`). Maid draws a pin with no icon when the sprite is missing (`makePin` in `images.ts`) **(inferred from the code, not run)**. The fix needs a decision on the pinhead artwork and its licence, and a copy step in `tools/refs/copy-sprites.ts`.

## 3. Other 7.x changes that matter

- Relation member schemas (`relation.members`, `role_labels`) are on two presets only: `area` (reference `multipolygon`) and `type/boundary/administrative` (reference `boundary`). Maid reads them (`packages/presets/src/relation.ts`, `relationRoles`).
- The 7.1.0 changelog (#2576) says roles were added for `type=boundary` and `type=multipolygon`. In the dist, `type/multipolygon` has no `relation`, so `relationRoles({ type: 'multipolygon' })` is empty **(a gap between changelog and data; not verified upstream)**.
- `amenity/post_box` now covers every country: the US drive-through field is `drive_through-US`, limited by its own location set (7.1.0, #2645).
- The 6.x data had no `relation` key at all. The bundled 7.2.0 data has it on two presets.

## 4. Removed presets, and whether Maid names them

Removed in 7.x: `type/route/power` (7.2.0, #2816), `military/nuclear_explosion_site` (7.1.0, #2392), `landuse/pond` (7.1.0, #2656), `landuse/farm` (7.1.0, #2650), `amenity/post_box/post_box-US` (7.1.0, #2645).

- Maid's apps, packages and tools name none of them as a preset id. Every preset-like string in the source was checked against the 7.2.0 ids (the scan skipped `dist/` and `.reference/`).
- `landuse=pond` and `landuse=farm` still appear, but as tag values (`packages/filters`, `packages/core/src/osm-rulesets.ts`). Those values are unchanged.
- One test named `amenity/post_box/post_box-US`. It now uses `highway/motorway_link-US-CA` (section 5).

Added in 7.x (11): `aerialway/station`, `amenity/charging_station/charging_station_bicycle` and `..._designated`, `amenity/parking_surface`, `building/tent`, `historic/millstone`, `leisure/schoolyard`, `man_made/silo/crop`, two `power/generator/method/solar_thermal_collector` presets, `seamark/offshore_platform`. No Maid code names them.

## 5. The three test failures, and what changed

| Test | Cause | Decision | Change |
| --- | --- | --- | --- |
| location sets: a US post box in New York | `post_box-US` was merged into `amenity/post_box` (data changed). | Data changed. Used a real country-only pair instead: `highway/motorway_link-US-CA` (US and Canada) against `highway/motorway_link` (excludes them). Added a check that the US drive-through field shows in New York only. | `location-sets.test.ts` |
| moreFieldsFor: order and `website` | `website` became a field of `shop/bakery` (7.2.0, #2669), so it is no longer a moreField (data changed). | Asserts `website` is a field, and `description` (still a universal moreField) is offered. | `presets.test.ts` |
| search: `amenity/cafe` by "espresso" | Code bug. 7.0.0 stores terms as arrays; the reader took strings only. | Fixed the reader (`presets.ts`). Test unchanged. | `presets.ts` |

Also updated:

- Comments in `defaults.test.ts`, `reference.test.ts` and `presets.test.ts` now say the 6.19.2 expected values still hold for 7.2.0 (they pass on the bundled data).
- Added a test that reads the aliases of `tourism/alpine_hut` from the array form.

## 6. Relation member schemas

- `relation-roles.test.ts` has new tests on the bundled data: the four roles of an administrative boundary in schema order, their member rules (geometry, matchTags, min, max), their labels from the translation (`Inner`, `Outer`, `Label`, `Admin Center`), `allowDuplicateMembers: false`, and the `area` schema (reference `multipolygon`, outer with min 1).
- The old test that said the bundled data has no `relation` is replaced.
- The header comment in `packages/presets/src/types.ts` now says where the 7.2.0 relation data is.
- Behaviour change in validation **(inferred)**: admin boundaries now get real roles and member filters from the data. The validation tests still pass, and none of them covers an admin boundary with the bundled data.

## 7. The style package and 7.3.0

- Only `packages/style/scripts/extract.ts` reads the schema (`presets.json`, for the area keys). The runtime reads the committed `src/generated/*.json`. No style test reads the schema.
- A read-only re-run of the area-key logic on the 7.2.0 presets gives the same 54 keys with the same values as the committed `area-keys.json` **(inferred: the script was not run, `style-generate` needs an iD checkout)**. So regenerating would not change it.
- 7.3.0: installed on 2026-10-15. Tobias put the schema on the list of packages that skip the 5-day rule (`bunfig.toml`): Maid follows its releases at once, as iD does.

## 7a. What 7.3.0 changed for Maid

- Member schemas on 19 presets (7.2.0: 2): `area`, `type/multipolygon`, `type/boundary`, `type/boundary/administrative`, `type/restriction` and its ten kinds, `type/destination_sign`, `type/waterway`, `type/site/climbing/area`, `type/site/climbing/crag`.
- Still none for routes (`type/route/*`, `type/route_master`): stops, platforms and the like stay without rules from the schema.
- `allowDuplicateMembers: false` now holds for multipolygons, boundaries and turn restrictions.
- Role labels changed: `Inner Edge`, `Outer Edge`, `Capital / Seat` (was `Inner`, `Outer`, `Admin Center`).
- Three preset tests were updated to this data (`relation-roles.test.ts`). Nothing else failed.
- The area keys of the style package were not regenerated for 7.3.0 (`style-generate` needs an iD checkout).

## 8. Left for other folders

- `packages/ui/src/inspector/fields.tsx`: map `schedule` to `TextField` (or to an opening-hours UI later) and `integer` to `NumberField`.
- `packages/shell/src/images.ts` and `tools/refs/copy-sprites.ts`: pinhead icons need a sprite, or a fallback to the old icon. Check the artwork licence first.
- `packages/validation`: the three stale comments in section 6.

## 9. Test numbers

- `bun test packages/presets packages/style`: before, 393 pass, 3 fail, 9 todo (405 tests). After, 403 pass, 0 fail, 9 todo (412 tests; 7 added).
- `oxlint --deny-warnings -c oxlint.config.mjs packages/presets packages/style`: clean.
- `oxfmt --check -c oxfmt.config.mjs packages/presets packages/style`: clean.
- `tsc --noEmit` (the root project, read-only): 0 errors, presets and style included. `packages/core/tsconfig.test.json`: 0 errors.
- `bun test packages/validation` (not edited): 300 pass, 0 fail, 49 todo. No failure from the new data.
