# Buildings module (`@osm-editor-kit/maid-module-buildings`)

The building editor of Maid Buildings (`apps/maid-buildings`): an editor for building mapping campaigns. Its map style
follows the building styles of Pierre-Léo Bourbonnais's iD fork, [kaligrafy/iD](https://github.com/kaligrafy/iD)
(branch `v5`, `css/50_misc.css` and `modules/svg/tag_classes.js`; branch `feat/quebec-building-styles`,
`lenses/v5-quebec.css`; branch `feat/building-levels-always-visible`), read on 2026-11-13. No code of the fork is copied:
its colours and rules are written here as a Maid lens.

## What a person sees / can do

- A map style "Standard: Buildings" (`buildingsLens`), on at the first visit. Every building is outlined and filled in
  salmon red at 30 %, so buildings stand out on the aerial imagery. The type changes the outline, and for the
  non-residential types the fill: commercial and retail blue, office crimson (also `office=yes` on another type), public,
  civic and pavilion orange, barn and farm building yellow, service teal, industrial violet; house dark red, detached
  orange, semi-detached mint, terrace green, apartments olive. A building with a number of dwellings
  (`building:flats`, then `flats`, then `houses`, above 0) gets a thicker outline from cyan (1) to orange (8), above
  that red; the number wins over the type, as in the fork. `building=no` and every other feature are drawn as usual.
- The number of dwellings on each such building, from zoom 17 (`FlatsOnMap`, "4 WE" in German), below the middle of
  the building so a house number stays readable, left out where it would cover another label. The fork labels unnamed
  buildings with that number.
- Preset changes (`buildingPresetChanges(data)`): every building preset shows levels, levels underground and roof
  levels together after the name (the fork's "always show building levels"); roofs, carports, building sites, tents and
  ruins are left out. The residential types also show the number of dwellings. `roof:levels` has no field in the
  tagging schema; the module adds `roof_levels`. `withBuildingDefaults` puts the building types first in the type picker
  (area), the address first for points and the entrances for vertices.
- `BUILDING_FAVOURITES`: the favourites the app suggests through `favourites` in its config (building, house, detached,
  semi-detached, terrace, apartments, garage, shed, commercial, industrial, roof, address); a person with no favourites
  gets them, and changes them as their own.

## Using it in an editor's config

From `apps/maid-buildings/src/maid.config.ts` and `presets.ts`:

```ts
lenses({ lenses: [buildingsLens], editorDefault: 'buildings' }),
buildings(),
// AppConfig
favourites: BUILDING_FAVOURITES,
// presets.ts
const base = withChanges(defaultPresetData, streetImageryPresetChanges)
const data = withChanges(base, buildingPresetChanges(base))
return createPresets({ ...data, defaults: withBuildingDefaults(data.defaults) })
```

The drawing tools of the app (rectangle, angle snap, extrude, resize, merge, cut, divide) are `module-shapes`; Square,
the merge of very close points, Move and Rotate are in every Maid.

## Tests

`bun test packages/module-buildings`: the lens (types, dwellings over type, `building:flats=0`, `building=no`), the
number of dwellings, the labels (local over base, a moved node moves its building's label) and the preset changes. The
base graph's labels are kept per base, so a drag measures only what was changed (about 25 ms for a walk of a dense
scene, which a drag would pay on every step otherwise).
