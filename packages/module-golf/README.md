# Golf module (`@osm-editor-kit/maid-module-golf`)

The golf editor of Maid Golf (`apps/maid-golf`), a prototype. The plan behind it, and what comes next:
[docs/research/golf/plan.md](../../docs/research/golf/plan.md).

## What a person sees / can do

- A dock view "Holes": the scorecard of the loaded data, one row per `golf=hole` with its number (`ref`), par, handicap,
  the length along the line and what is missing (number, par, handicap, a number used twice on the same course).
  Choosing a row selects the hole; the pointer on a row marks it on the map.
- A map style "Standard: Golf" (`golfLens`), on at the first visit: greens, fairways, rough, tees, bunkers, water hazards,
  the driving range and the clubhouse in their colours, the holes as red dashed lines (amber while they lack number or
  par), the course outline, everything else dimmed.
- Eight rules for the Issues dock (`golfRules`): a hole without number, without a par from 3 to 6, with a handicap outside
  1 to 18; a bunker without `natural=sand` and a water hazard without `natural=water` (each with a fix that adds it); a
  generic name such as "Bunker" or "Hole 3" (fix: remove it); `sport=golf` on a part of the course (fix: remove it); a
  golf course mapped as a point.
- Preset changes (`golfPresetChanges`): bunkers add `natural=sand`, water hazards add `natural=water`, a new `golf/pin`
  preset. `withGolfDefaults` puts the golf presets first in the type picker for areas, lines, points and vertices.

## Using it in an editor's config

From `apps/maid-golf/src/maid.config.ts` and `presets.ts`:

```ts
validation({ rules: [...defaultRules, ...golfRules] }),
lenses({ lenses: [golfLens], editorDefault: 'golf' }),
golf(),
// presets.ts
const data = withChanges(defaultPresetData, golfPresetChanges)
return createPresets({ ...data, defaults: withGolfDefaults(data.defaults) })
```

## Tests

`bun test packages/module-golf`: the rules with their fixes, generic names, the scorecard (order, length, what is
missing, edits over the loaded data, numbers used twice). The made-up scene `golf` (`bun run fixtures-golf`) has a
course of three holes with mistakes for every rule but the handicap and the point.
