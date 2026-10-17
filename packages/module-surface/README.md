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

Tailwind needs the module's sources in `packages/shell/src/styles.css`: `@source '../../module-surface/src';`.

## What the field does

- **Two tiles**, "Surface" and "Smoothness", side by side. Each shows its photo and label; the tag (`surface=asphalt`) shows over the photo while the tile is hovered or focused. An empty tile shows its name and "Choose…". A value that is not in the catalogue shows on the tile as text.
- **A click on a tile** opens a flyout with a search field (it has the focus) above a grid of photos. Surfaces: the common ones first (the catalogue's `smoothnessQuest` flag), then the others. Smoothness: for the chosen surface, its reference photos best to worst, each with its description; without a surface, or for a surface without photos, the eight levels with their "usable by" emoji. A value the surface does not offer is shown first and marked "Not offered for this surface". Hovering a card shows its tag and description over the bottom of its photo.
- **Typing** filters the cards by name and value ("asphal" finds Asphalt). When no card is left, the list shows the other known values that match (the aliases, salt) and "Use '…'" with the typed text, so any value can be set. The list keeps the height it had with all cards.
- **Choosing** writes the tag at once and closes the flyout. The clear button on a tile's corner removes its tag.
- **Keyboard**: Up and Down move by a row of cards (and by one in the list below them), Left and Right move while the search is empty, Enter chooses the highlighted option, Escape closes.
- **Changing the surface keeps the smoothness**, as the task asks. The fork's rule is different: it removes a smoothness the new surface does not offer (asphalt `excellent` → sett). Not done here; a kept value that the new surface does not offer shows as "Not offered for this surface" in the picker.
- **Read-only** (no `onChange`): the tiles show and nothing opens.

## Where the photos come from, and the licence

Everything comes from `@osm-editor-kit/surface-smoothness-data` (npm 0.1.0, extracted from StreetComplete). The package is MIT-licensed from 0.1.0. The package's files are imported by `src/photos.ts`, so the bundler emits them as files of Maid's own origin. Nothing is loaded from the network at run time.

- **Photos**: 55 JPEGs (256 × 256). Each file has its own licence in the package's `catalogue.attribution`: CC-BY-SA 4.0, CC-BY-SA 3.0 and 2.0, CC-BY 2.0 and 3.0, CC0, and public domain. The flyouts show the credits (file, licence, source) of the photos they show, under "Photo credits".
- **Vehicle pictures** are the level's "usable by" emoji, not icons. Version 0.1.0 no longer ships StreetComplete's GPL vehicle SVGs. The package has no SVG files.
- **The package** is MIT from 0.1.0. Maid is ISC. No GPL terms apply to the data package any more, so the bundle has no GPL question for it.
- **Status**: the licence question was resolved on 2026-10-13. See `docs/research/surface-data-licence.md`.

Attribution gaps to check: `images/surface_unpaved_impassable.jpg` is marked public domain with a Google Drive link as its source; `images/surface_paving_stones.jpg` names its author but gives no URL.

## Bundle size

Measured with Vite 8 on a scratch entry (not committed):

- Photos: 55 JPEG files. They are separate hashed files, not inlined. The `?no-inline` suffix on each import keeps Vite from inlining a file. The size was measured for 0.0.0 with 63 files; not measured again after 0.1.0.
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
- **19 of the 26 surfaces have no smoothness photos** (the matrix covers asphalt, concrete, sett, paving stones, compacted, gravel and fine gravel). For them the smoothness picker shows the levels with their emoji. All 26 have a surface photo.
- **Tests** cover the logic, the preset changes and the photo map. The flyout's keyboard and clicks are not tested in a DOM; a server-side render of the field was checked once, in a throwaway test.

## Tests

`bun test packages/module-surface`: which photo a pair shows (aliases, fallbacks), the picker groups and offers, unknown values, the grid steps, the credits, the preset changes against the default data (one field per preset, the place of the field, inheritance), and that every path the catalogue names is bundled.
