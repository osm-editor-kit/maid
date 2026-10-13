# Parking module (`@osm-editor-kit/maid-module-parking`)

The street-side parking editor's module for Maid (see docs/parking/README.md). The scaffold: every folder has an `index.ts` with a working stub, and `src/index.ts` composes them into `parking()`.

| Folder | Exports | Registered by |
| --- | --- | --- |
| `src/sides.ts` | `SIDES`, `sideKey`, `readSide`, `writeSide` (done, tested) | not registered; pure helpers |
| `src/presets/` | `parkingPresetChanges` | the app: `withChanges(data, parkingPresetChanges)` |
| `src/buttons/` | `QuickTags`, `QuickTagsSection`, `QUICK_TAGS` | `parking()` on `inspector.section` |
| `src/lens/` | `parkingLens`, `parkingSideFeatures`, `ParkingSidesOnMap` | lens: the app, `lenses({ lenses: [parkingLens] })`; sides: `parking()` on `map.content` |
| `src/restriction/` | `RestrictionField`, `PARKING_RESTRICTION_FIELD_TYPE` (`parkingRestriction`), `parseConditional`, `formatConditional` | `parking()` on `inspector.field` |
| `src/validation/` | `parkingRules` | the app: `validation({ rules: [...defaultRules, ...parkingRules] })` |
| `src/operations/` | `parkingOperations` | `parking()` on `edit.operation` |
| `src/icons/` | `PARKING_ICONS` (file name to URL) | imported by components only |

Pure files (sides, presets, conditional, rules, operations) must not import the icons: PNG imports belong in components.

The field's side line on the map: a control that belongs to a side sits in an element with `data-focus-key` and `data-focus-side` (`FieldFocus` in maid-ui); fields on `parking:<side>:*` keys get the side line from the key alone (packages/shell/src/field-overlay.ts).

Tailwind needs `@source '../../module-parking/src';` in `packages/shell/src/styles.css` (done).

The icons, presets and styles come from the Berlin parking mapping project, used with the author's permission (NOTICE.md).
