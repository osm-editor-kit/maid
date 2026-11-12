# Golf module (`@osm-editor-kit/maid-module-golf`)

The golf editor of Maid Golf (`apps/maid-golf`), a prototype. The plan behind it, and what comes next:
[docs/research/golf/plan.md](../../docs/research/golf/plan.md).

## What a person sees / can do

- A dock view "Holes": the scorecard of the loaded data, one row per `golf=hole` with its number (`ref`), par, handicap,
  the length along the line and what is missing (number, par, handicap, a number used twice on the same course).
  Choosing a row selects the hole; the pointer on a row marks it on the map.
- A map style "Standard: Golf" (`golfLens`), on at the first visit, in the colours of OSM Carto 5.4 (the jgruca diary):
  tee, fairway and driving range in grass green, rough a little darker, the green in pitch green with a darker outline (so
  it stands apart from water), bunkers in sand, water in water blue, the course in its light green; the holes as thin
  grey lines with their number (`HoleNumbersOnMap`), amber and dashed while they lack number or par; out of bounds as a
  dashed grey line. Everything else is drawn as usual.
- Eleven rules for the Issues dock (`golfRules`), from the OSM wiki pages: a hole without number, without a par from 3
  to 6, with a handicap outside 1 to 18; `golf_hole=*` instead of `ref` (fix: move it); a hole whose points are not one
  fewer than its par; a hole that shares a node with a golf feature on the ground; a bunker without `surface` and a water
  hazard without `natural=water` or a waterway (each with a fix); a generic name such as "Bunker", "fairway 1" or "18th
  Hole" (fix: remove it); `sport=golf` on a part of the course (fix: remove it); a golf course mapped as a point.
- Preset changes (`golfPresetChanges`): bunkers add `surface=sand` (the wiki's useful combination), new presets
  `golf/pin` and `golf/out_of_bounds` (proposed tag, a line along the white stakes), the course gets `golf:course`
  (9/18/27 holes, pitch and putt, driving range) and `golf:par`, the hole `golf:course:name`. `withGolfDefaults` puts the
  golf presets first in the type picker.
- `GOLF_FAVOURITES`: the favourites the app suggests through `favourites` in its config; a person with no favourites gets
  them, and changes them as their own.

## Using it in an editor's config

From `apps/maid-golf/src/maid.config.ts` and `presets.ts`:

```ts
validation({ rules: [...defaultRules, ...golfRules] }),
lenses({ lenses: [golfLens], editorDefault: 'golf' }),
golf(),
// AppConfig
favourites: GOLF_FAVOURITES,
// presets.ts
const data = withChanges(defaultPresetData, golfPresetChanges)
return createPresets({ ...data, defaults: withGolfDefaults(data.defaults) })
```

## Tests

`bun test packages/module-golf`: the rules with their fixes, generic names, the scorecard (order, length, what is
missing, edits over the loaded data, numbers used twice). The made-up scene `golf` (`bun run fixtures-golf`) has a
course of three holes with mistakes for every rule but the handicap and the point.
