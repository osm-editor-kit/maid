# Surface and smoothness module (`@osm-editor-kit/maid-module-surface`)

The `surface` and `smoothness` field for roads, cycleways, paths and footways in Maid, chosen by photo, the way the Radnetz fork shows it (WORKDOC feature 24). Two parts:

- `surfacePresetChanges`: the presets change. The field `surface_smoothness` (type `surfaceSmoothness`, keys `surface` and `smoothness`) takes the place of the plain `surface` field and the `smoothness` field in the presets below. The two tags have one home.
- `surface()`: the module. It registers the field type `surfaceSmoothness` on `inspector.field`.

## Using it in an editor's config

```ts
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'
import { surface, surfacePresetChanges } from '@osm-editor-kit/maid-module-surface'

// in the modules list:
surface(),
// in the config (chain it with other change sets, one withChanges per set):
presets: createPresets(withChanges(defaultPresetData, surfacePresetChanges)),
```

With the traffic sign module as well, both sets apply in either order: `withChanges(withChanges(defaultPresetData, trafficSignPresetChanges), surfacePresetChanges)`. Checked for residential, cycleway, footway and secondary.

Tailwind needs the module's sources in `apps/maid/src/index.css`: `@source '../../../packages/module-surface/src';`.

## What the field does

- **Two tiles**, "Surface" and "Smoothness", side by side. Each shows its photo and label, with the tag value in small mono type. An empty tile shows its name and "Choose…". A value that is not in the catalogue shows on the tile as text.
- **A click on a tile** opens a flyout with a grid of photos. Surfaces: the common ones first (the catalogue's `smoothnessQuest` flag), then the others. Smoothness: for the chosen surface, its reference photos best to worst, each with its description; without a surface, or for a surface without photos, the eight levels with their vehicle icons. A value the surface does not offer is shown first and marked "Not offered for this surface".
- **Choosing** writes the tag at once and closes the flyout. The clear button on a tile's corner removes its tag.
- **Keyboard** in a grid: arrow keys move (Left and Right by one, Up and Down by a row), Home and End go to the ends, Enter or Space chooses, Escape closes. The Tab stop is the chosen item, or the first.
- **Changing the surface keeps the smoothness**, as the task asks. The fork's rule is different: it removes a smoothness the new surface does not offer (asphalt `excellent` → sett). Not done here; a kept value that the new surface does not offer shows as "Not offered for this surface" in the picker.
- **Type a value** (collapsed, opens by itself when a value is not in the catalogue): one combo per tag, with the catalogue's values and aliases (`concrete:plates`, `bricks`, …) as suggestions. Any value can be typed.
- **Read-only** (no `onChange`): the tiles show, nothing opens and the text fallback is not rendered.

## Where the photos come from, and the licence

Everything comes from `@osm-editor-kit/surface-smoothness-data` (npm 0.0.0, extracted from StreetComplete). The package's files are imported by `src/photos.ts`, so the bundler emits them as files of Maid's own origin. Nothing is loaded from the network at run time.

- **Photos**: 55 JPEGs (256 × 256). Each file has its own licence in the package's `catalogue.attribution`: CC-BY-SA 4.0, CC-BY-SA 3.0 and 2.0, CC-BY 2.0 and 3.0, CC0, and public domain. The flyouts show the credits (file, licence, source) of the photos they show, under "Photo credits".
- **Vehicle icons**: 8 SVGs, GPL-3.0-or-later (StreetComplete).
- **The package itself** is GPL-3.0-or-later. **Maid is ISC.** Shipping the package in Maid's bundle means the distributed app is under GPL-3.0 terms. This needs a decision by the owner before a release; it is not decided by this module.

Attribution gaps to check: `images/surface_unpaved_impassable.jpg` is marked public domain with a Google Drive link as its source; `images/surface_paving_stones.jpg` names its author but gives no URL.

## Bundle size

Measured with Vite 8 on a scratch entry (not committed):

- Photos and icons: 63 files, 1,827,595 bytes in total (55 JPEG, 8 SVG). They are separate hashed files, not inlined. The `?no-inline` suffix on each import keeps Vite from inlining the SVGs, which are all under its 4 KB limit.
- The picture map in JavaScript: 5,475 bytes (1,551 gzipped), with no data URIs.
- The field's own code is not measured apart from React, maid-ui, motion and floating-ui, which the app ships already.

## Presets changed

| Preset | Change |
| --- | --- |
| `highway/trunk`, `primary`, `residential`, `living_street`, `service` | `surface` out of the fields, the field in its place (before `structure`); `smoothness` out of the more fields |
| `highway/path`, `highway/footway` | `surface` out of the fields, the field before `width`; `smoothness` out of the more fields |
| `highway/cycleway` | `surface` and `smoothness` out of the fields, the field before `width` |

Presets that take their list from another (`secondary`, `tertiary` from primary, `unclassified`, `road` from residential) inherit the change; they are not edited, so the field shows once.

## Known gaps

- **Presets not changed**: `highway/motorway`, `track`, `bridleway`, `steps`, `construction`. They keep the plain `surface` field and `smoothness` in their more fields. Add a `presetEdits` entry for each, if wanted.
- **Side keys** (`cycleway:right:surface`, `sidewalk:…`) and `sett:length` are not covered, as in the fork.
- **Labels are English** only, as the fork's.
- **19 of the 26 surfaces have no smoothness photos** (the matrix covers asphalt, concrete, sett, paving stones, compacted, gravel and fine gravel). For them the smoothness picker shows the levels with vehicle icons. All 26 have a surface photo.
- **The vehicle icons on a dark theme** are inverted with `dark:invert`, which is a guess; not seen in a browser.
- **Tests** cover the logic, the preset changes and the photo map. The flyout's keyboard and clicks are not tested in a DOM; a server-side render of the field was checked once, in a throwaway test.

## Tests

`bun test packages/module-surface`: which photo a pair shows (aliases, fallbacks), the picker groups and offers, unknown values, the grid steps, the credits, the preset changes against the default data (one field per preset, the place of the field, inheritance), and that every path the catalogue names is bundled.
