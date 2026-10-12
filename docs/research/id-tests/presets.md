# iD tests: presets

Compared at iD commit `0194f3926`. Run: `bun test packages/presets` → 129 pass, 0 fail, 15 todo (48 of the passes are in the existing `presets.test.ts`).

`it(...)` blocks are counted as the inventory counts them: an `it.each` block is one iD test (it runs one Maid test per case). `describe.skip` blocks in iD count their tests here as todo.

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `presets/category.js` | 2 | 0 | 0 | 2 | 0 | `packages/presets/src/id-category.test.ts` |
| `presets/collection.js` | 16 | 0 | 14 | 0 | 2 | `packages/presets/src/id-collection.test.ts` |
| `presets/index.js` | 27 | 1 | 17 | 9 | 0 | `packages/presets/src/id-index.test.ts` |
| `presets/preset.js` | 35 | 0 | 31 | 4 | 0 | `packages/presets/src/id-preset.test.ts` |
| `actions/change_preset.js` | 13 | 0 | 13 | 0 | 0 | `packages/presets/src/id-change-preset.test.ts` |
| **sum** | **93** | **1** | **75** | **15** | **2** | |

The presets part alone (`presets/*.js`, 80 tests) is 1 covered, 62 adopted, 15 todo, 2 n/a: 80.

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-presets-1 | `matchAllGeometry`: presets that fit every geometry of a multi-selection | `preset.js`: 2 | todo | `packages/presets/src/presets.ts` |
| F-presets-2 | Addable presets: an `addable` flag per preset and `addablePresetIDs` (only the listed presets can be picked; the defaults follow the list) | `preset.js`: 1 (`#addable`); `index.js`: 4 (`#addablePresetIDs`) | todo | `packages/presets` (index), the app's config |
| F-presets-3 | `skipFieldDefaults` option for `applyPreset` and `unsetTags` | `preset.js`: 1 | todo | `packages/presets/src/presets.ts` |
| F-presets-4 | Preset categories: groups of presets with members and a geometry (the tabs of the preset list); the category data is not in `PresetData` | `category.js`: 2 | todo | `packages/presets` (data and index) |
| F-presets-5 | Recent presets, favourites and location sets (`defaults` with recents; `locationSetID` filtering) | `index.js`: 1 (`PresetIndex.recents`) | todo | `packages/presets` |
| F-presets-6 | Merging custom presets into a built index after creation (`presetIndex.build`); skipped in iD | `index.js`: 2 | todo | `packages/presets/src/presets.ts` |
| F-presets-7 | Presets from an external URL (`presetIndex.fromExternal`); skipped in iD. The test needs a fake server, so it would use data written into the test | `index.js`: 2 | todo | outside the package (a fetch), not in automated runs |

## Differences found

- **Search tiers were missing.** iD's `collection.search` has a close-name tier (edit distance below 3, closest first) and a close-term tier, and it always ends with the geometry's fallback preset. Maid had neither. Both are added to `packages/presets/src/presets.ts`, and the fallback now counts in `limit` (as iD's `MAXRESULTS - 1` plus the fallback). The existing `presets.test.ts` still passes. The 1,000-search test takes about 0.9 s (limit 5 s); the edit distance runs on text prepared once per preset.
- **`applyPreset` was missing iD's `actionChangePreset` logic.** Added: the field keys of the new preset are kept (`allKeys`, including localized `name:xx`, the multi-combo prefix and directional `:both`), the old preset's field keys are removed only when the old preset no longer matches (a collective preset keeps them), and the sub-preset rule (`highway/service/driveway` to `highway/service`).
- **Field defaults are now applied.** `applyPreset` used to skip them, on purpose: the old comment gave location sets and preferences as the reason. Location sets are still not ported and there is no preference here, so the defaults are built, as in iD (`skipFieldDefaults` is F-presets-3). This changes what the app writes: `apps/maid/src/components/Inspector.tsx` calls `applyPreset` when a preset is picked, so a picked preset now also adds its fields' defaults. Tobias should check that this is wanted.
- **New public functions** on `Presets`: `matchScore(preset, tags)`, `isFallback(preset)`, `unsetTags(tags, preset, geometry, ignoringKeys?)`. They are iD's preset methods, needed by the adopted tests. `applyPreset` gets the same docs as iD's `actionChangePreset`.
- **`it.todo` takes a no-op body** (`() => {}`) in these files. bun's types for `it.todo` need a function; the same error shows in other packages' todo tests (`packages/ui`, `packages/validation`).
- **README is out of date** (`packages/presets/README.md`, not edited: outside the allowed files). Its "Not ported yet" line still lists search, which is now ported with the fuzzy tiers, and it does not mention field defaults or the field-key rules of `applyPreset`.

## Not applicable, by reason

- A preset collection object with positions: Maid's searches return plain arrays, and a position in one is the caller's `indexOf`. `collection.js` `#index` (2 tests).

Covered elsewhere: `index.js` "matches vertices on an addr:interpolation line as points" → `packages/model/test/data/OsmNode.test.js` (`isOnAddressLine`). The vertex's geometry is derived by the model; `presetIndex` takes it as an argument, and the iD test's preset part (`park` for a point) is the same match as the adopted "expected matches" tests.

## Not finished

Nothing. Every file of the area is done and the four checks in the brief pass: `bun test packages/presets` has 0 failures, `tsc --noEmit -p .` has no error in `packages/presets`, and oxlint and oxfmt are clean on `packages/presets/src`.
