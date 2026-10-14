# Parking module (`@osm-editor-kit/maid-module-parking`)

The street-side parking editor's module for Maid . Comments in this package cite the brief it was built from by document and entry (`josm-setup-presets-styles.md`, `qa-traffic-signs.md`, `qa-markings-obstacles-process.md`, `project-decisions.md`): summaries of the mapping project's internal material, which are kept outside this repository. `src/index.ts` composes the parts into `parking(options)`.

`parking({ lenses: lensChoice, showMissing? })`: with `lensChoice` of `@osm-editor-kit/maid-module-lenses` the parking sides are drawn while the "Parking" lens is active, and the lens is switched on at the first visit (not under automation). Without `lenses` no side line is drawn.

| Part | What it does | Registered by | Open |
| --- | --- | --- | --- |
| `src/sides.ts` | `SIDES`, `sideKey`, `parseSideKey`, `sideSuffixes`, `readSide`, `writeSide`, `applyEdits` (pure). A road has two sides; `both` is the spelling for "left and right are equal". Writing one side keeps the other and writes equal sides as `both`: iD's directional fields. Buttons, restriction field, operations and fixes all write through it | not registered | |
| `src/language.ts` | `isGerman`, `pick`: the module's own texts are English or German by the page's language | not registered | moves to `packages/i18n` |
| `src/presets/` | `parkingPresetChanges`: side fields first on roads; the Parkplatz presets (one per `parking` value), disabled bay, underground entrance, obstacle; three extra fields on iD's crossing presets; the project's area fields under "Add field" on iD's Parking Lot. `withGermanLabels` (German names from `LABELS_DE`) | the app: `withChanges(data, parkingPresetChanges)`, and `withGermanLabels` when the visit is German | fee, maxstay, access `:conditional` fields are free text; Berlin zones not here |
| `src/buttons/` | `QuickTags`, `QuickTagsSection`, `QUICK_TAGS` (33 JOSM buttons, no parking with a reason, lane parallel, clear a side) | `parking()` on `inspector.section` (`placement: 'top'`, `multiple`: also for several roads) | highlight of the side on the map follows hover and focus (`onFieldFocus`), one road only |
| `src/lens/` | `parkingLens` (areas; the side categories as legend-only rules), `ParkingSidesOnMap` (side lines with a casing, areas, kerbs, arrows), `connectParkingSides` | lens: the app, `lenses({ lenses: [parkingLens] })`; sides: `parking()` on `map.content` and the `lenses` option | the look of the side lines needs a person's eyes; the source is set whole when a parking feature changes |
| `src/restriction/` | `RestrictionField` (field type `parkingRestriction`): on `parking:both:restriction` a block for the left and one for the right side, each with the plain value and conditional rules; on `restriction` of an area one block. Both keys are written as one change; a rule is written once it has a value and a condition | `parking()` on `inspector.field` | fee/maxstay/access conditionals do not use it yet |
| `src/validation/` | `parkingRules` (9 rules), German texts by the page's language | the app: `validation({ rules: [...defaultRules, ...parkingRules] })` | rules from the open entries |
| `src/operations/` | `parkingOperations` (copy left to right and back, swap sides, remove parking tags), `inGerman` | `parking()` on `edit.operation` | no "make an area from a side", no obstacle or kerb operations |
| `src/icons/` | `PARKING_ICONS` (file name to URL) | imported by components only | |

German: the app starts in German where the browser names no language (`AppConfig.defaultLocale`). Buttons, restriction field, validation messages with their fixes and the operations pick their texts by `isGerman()`; presets by `withGermanLabels`. Not in German yet: the annotation of a button click (undo step name), the legend (the lens rules' labels), the names of iD's own presets and fields.

Pure files (sides, presets, conditional, rules, operations) must not import the icons: PNG imports belong in components.

The field's side line on the map: a control that belongs to a side sits in an element with `data-focus-key` and `data-focus-side` (`FieldFocus` in maid-ui); fields on `parking:<side>:*` keys get the side line from the key alone (packages/shell/src/components/field-overlay.ts).

Tailwind needs `@source '../../module-parking/src';` in `packages/shell/src/styles.css` (done).

The icons, presets and styles come from the Berlin parking mapping project, used with the author's permission (NOTICE.md).
