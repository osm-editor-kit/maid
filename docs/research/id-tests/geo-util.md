# iD tests: geo and util

Compared at iD commit `0194f3926`. Run:
- `bun test packages/model/test/id/geo` → 113 pass, 0 fail, 24 todo
- `bun test packages/model/test/id/util` → 41 pass, 0 fail, 81 todo
- `bun test packages/ui/src/inspector/id-util.test.ts` → 1 pass

Covered tests are compared by their `it` titles and by reading the assertions of the Maid side only where noted. Adopted tests keep iD's titles, inputs and expected values; only the calls and two shapes of argument changed (see Differences).

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `geo/extent.js` | 41 | 0 | 38 | 2 | 1 | `packages/model/test/id/geo/extent.test.ts` |
| `geo/geo.js` | 25 | 0 | 25 | 0 | 0 | `packages/model/test/id/geo/geo.test.ts` |
| `geo/geom.js` | 54 | 8 | 24 | 22 | 0 | `packages/model/test/id/geo/geom.test.ts`; covered in `packages/model/test/geo/geom.test.js` |
| `geo/vector.js` | 26 | 0 | 26 | 0 | 0 | `packages/model/test/id/geo/vector.test.ts` |
| **sum geo** | **146** | **8** | **113** | **24** | **1** | |
| `util/aes.ts` | 5 | 0 | 0 | 0 | 5 | none (n/a) |
| `util/array.js` | 13 | 0 | 12 | 1 | 0 | `packages/model/test/id/util/array.test.ts` |
| `util/clean_tags.js` | 7 | 0 | 1 | 6 | 0 | `packages/ui/src/inspector/id-util.test.ts` (adopted), `packages/model/test/id/util/clean_tags.test.ts` (todo) |
| `util/keybinding.js` | 10 | 0 | 0 | 0 | 10 | none (n/a) |
| `util/localizer.ts` | 0 | 0 | 0 | 0 | 0 | `packages/model/test/id/util/localizer.test.ts` (12 todo cases, see Notes) |
| `util/object.ts` | 4 | 0 | 1 | 3 | 0 | `packages/model/test/id/util/object.test.ts` |
| `util/rebind.js` | 1 | 0 | 0 | 0 | 1 | none (n/a) |
| `util/session_mutex.js` | 10 | 1 | 0 | 0 | 9 | none; covered in `packages/journal/src/journal.test.ts` |
| `util/units.js` | 13 | 0 | 0 | 13 | 0 | `packages/model/test/id/util/units.test.ts` |
| `util/util.js` | 74 | 0 | 28 | 46 | 0 | `packages/model/test/id/util/util.test.ts` |
| **sum util** | **137** | **1** | **42** | **69** | **25** | |
| **sum all** | **283** | **9** | **155** | **93** | **26** | |

The sums match the inventory: geo 146 and util 137 (283).

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-geo-1 | `geoChooseEdge`: the nearest edge of a way to a point, skipping given nodes (hover and draw snapping); built on `vecProject` | `geom.js`: 8 | todo | `packages/model/src/geo` |
| F-geo-2 | `geoHasLineIntersections`: does the active way cross other ways in the graph (the validation's crossing check is a different API) | `geom.js`: 4 | todo | `packages/model/src/geo` |
| F-geo-3 | `geoViewportEdge`: nudge a point that sits on the map's edge inwards so drawing can reach it | `geom.js`: 9 | todo | `packages/renderer` or `packages/ui` (map) |
| F-geo-4 | `Extent.split()`: four equal quarters of an extent | `extent.js`: 1 | todo | wrapper in `packages/model/src/geo` (`@rapid-sdk/math` has no `split`) |
| F-geo-5 | Winding order: `Extent.polygon()` and `geomGetSmallestSurroundingRectangle().polygon` return the ring in the other direction from iD; the test asserts iD's order | `extent.js`: 1, `geom.js`: 1 | todo | `@rapid-sdk/math` upstream, or a wrapper in `packages/model/src/geo` |
| F-util-1 | `utilArrayPowerset` | `array.js`: 1 | todo | `packages/model/src/util` |
| F-util-2 | Tag cleaning before upload, as `utilCleanTags`: empty keys and undefined values dropped, whitespace in `;` lists, `opening_hours` and `conditional` spacing, description, note and fixme left alone. `@rapid-sdk/util` has `utilCleanTags`, but `apps/maid/src/save` does not call it | `clean_tags.js`: 6 | todo | `apps/maid/src/save` |
| F-util-3 | Coordinate display and parsing: DMS (`dmsCoordinatePair`) and `dmsMatcher` (D M SS, z/x/y, x/y, localized numbers) | `units.js`: 13 | todo | `packages/ui` (or `packages/model/src/util`) |
| F-util-4 | `utilCheckTagDictionary`: look a tag value up in a dictionary (iD uses it for one-way tags) | `object.js`: 2 | todo | `packages/model/src/util` |
| F-util-5 | `stringifyProperties`: GeoJSON properties turned into string tags (iD's data layer editor) | `object.ts`: 1 | todo | with the GeoJSON data layer |
| F-util-6 | `utilTagDiff` option `context` (include context tags in the diff) | `util.js`: 1 | todo | `@rapid-sdk/util` upstream, or `packages/model/src/util` |
| F-util-7 | `utilCombinedTags`: the values of a tag across a multi-selection, most frequent first | `util.js`: 2 | todo | `packages/ui/src/inspector` (multi-selection) |
| F-util-8 | `utilEditDistance` with `substring: true` (a query matched inside a name, for combo search) | `util.js`: 6 (5 tests and one `it.each` of 9 rows) | todo | `packages/model/src/util` |
| F-util-9 | `utilDisplayName`: the label of a feature from name, ref, route network and direction, address fallbacks, localized names | `util.js`: 24 | todo | `packages/model/src/util` (the renderer's label in `packages/renderer/src/build.ts` covers only the house number) |
| F-util-10 | `utilOldestID`: the oldest of several entity ids, database before editor ids (used when merging) | `util.js`: 5 | todo | `packages/model/src/util` (`join.ts` has its own rule for ways) |
| F-util-11 | `utilStripDiacritics` as a utility (Maid has a private `stripDiacritics` in `packages/presets/src/presets.ts`) | `util.js`: 1 | todo | `packages/model/src/util` or `packages/presets` export |
| F-util-12 | `utilCompareIDs`: iD's order (existing oldest-first, new ones after, other strings last). Maid's `OsmEntity.creationOrder` is newest-first on purpose (Rapid's tests) and does not sort strings. A decision is needed first | `util.js`: 5 | todo | `packages/model/src/data/OsmEntity.ts` |
| F-util-13 | `utilExpandLocaleCode`: language fallbacks (`zh-CN` to `zh-Hans-CN`, `zh-Hans`, `zh`) for localized names | `localizer.ts`: 12 cases (inventory counts 0) | todo | `packages/ui/src/inspector/fields/localized-logic.ts` |
| F-util-14 | `utilStringQs` decodes `+` as a space (iD does; `@rapid-sdk/util` keeps the `+`) | `util.js`: 2 | todo | `@rapid-sdk/util` upstream, or a wrapper in `packages/model/src/util` |

## Differences found

- **Polygon winding (F-geo-5).** `Extent.polygon()` and the smallest surrounding rectangle return the same rectangle, but starting at the other corner and in the other direction. Both tests were parked, not changed. Neither is wrong for OSM; code that relies on iD's order would break. Maid's `geomGetSmallestSurroundingRectangle` also calls the ring `polygon`, not `poly`.
- **`vecProject` result.** iD's closest point is `target`; `@rapid-sdk/math` returns `point` with the same value. The adopted test reads `point`.
- **`geoAngle`.** iD takes entities with a `loc` and a projection; the test shim calls `vecAngle` on the projected points. `vecAngle` is `atan2` of the vector from `a` to `b`, the same as iD's.
- **Extent arguments.** iD accepts a point, a `[min, max]` pair or an extent wherever an extent is expected, and reads `extent[0]` and `extent[1]`. Maid's `Extent` takes an `Extent` or points, and has `min` and `max`. The adopted file wraps every extent argument in a small `geoExtent` helper that accepts iD's forms. The two index-reading tests use `.min` and `.max`. `has length 2` is n/a.
- **`utilStringQs` and `+` (F-util-14).** iD turns `+` into a space in query strings; `@rapid-sdk/util` does not. Maid's own URL parsing (`apps/maid/src/url`) was not checked.
- **`cleanValue` trims everything (F-util-2).** Maid's `cleanValue` (`packages/ui/src/inspector/logic.ts`) trims any value, including description, note and fixme, which iD leaves untouched. This is a real difference and the todo in `clean_tags.test.ts` names it. The trimming of a single value is covered in `packages/ui/src/inspector/id-util.test.ts`.
- **Ordering of entity ids (F-util-12).** Maid's `creationOrder` is newest-first for existing and new entities; iD's `utilCompareIDs` is oldest-first for existing ones. Rapid's tests assert Maid's order, so the iD assertions were not adopted.
- **`utilTagDiff` test.** The iD test omits the `render` key with es-toolkit's `omit`; the adopted file uses `utilObjectOmit` from `@rapid-sdk/util` with the same keys. The expected values are unchanged.

## Not applicable, by reason

- Maid stores no encrypted value (no token is kept encrypted; the sign-in is a public PKCE client): `util/aes.ts` 5.
- Maid binds keys with `@tanstack/react-hotkeys` (`apps/maid/src/components/useShortcuts.ts`); iD's `utilKeybinding` mechanics are not Maid's: `util/keybinding.js` 10.
- D3 dispatch helper, which Maid does not use: `util/rebind.js` 1.
- Maid's journal takes a Web Lock (`navigator.locks`), which the browser releases when the tab closes. iD's localStorage mutex API (`lock`, `locked`, `unlock`, names) does not exist in Maid: `util/session_mutex.js` 9. The guarantee that iD's `returns false when the lock is held by another session` checks is covered in `packages/journal/src/journal.test.ts` (`refuses to start while another tab holds the lock`).
- iD's extent is an array; Maid's `Extent` has `min` and `max` and no `length`: `geo/extent.js` 1 (`has length 2`).

## Notes

- `util/util.js`: the inventory says 74, which is 73 `it(` calls plus one `it.each` block of 9 rows. The block is counted as one here, as in the inventory. As its own tests the file runs 82 cases.
- `util/localizer.ts`: the inventory says 0, but the file has an `it.each` of 12 rows. They are written as todo in `localizer.test.ts` and are not in the sums. The inventory should say 12 (not changed here; it is outside this folder).
- The four files of `util` that have no Maid test file (`aes`, `keybinding`, `rebind`, `session_mutex`) are all n/a or covered, as above.

## Not finished

Nothing in this area is left unread. Lint was run on `packages/ui/src/inspector/id-util.test.ts` only (`packages/model` is excluded from oxlint and oxfmt).
