# Levels (`@osm-editor-kit/maid-levels`)

Reads the building levels of OSM features: `level`, `repeat_on`, `min_level` and `max_level`, with the problems in them, and the floors a set of features is on. It has no map and no editor, so the level mode (`packages/module-levels`), the renderer and the level rules of the validation can all use it.

This package has no module of its own and no UI. A person sees its results through the level picker and the level rules of `apps/maid-indoor`.

## What it computes

- `levelsOf(tags)` and `parseLevels(value, key)`: the levels of a feature, sorted, without duplicates. Reads numbers (`-1`, `0.5`), ranges (`0-3`), lists (`0;1`) and `repeat_on`. Parts that cannot be read are returned as `problems` (a comma instead of a point, an empty part, a reversed range, a range too wide, not a number, a duplicate). They add no level.
- `floorsOf(features)`: the floors of a set of features for a level picker. Always contains 0.
- `levelState(level, edited)`: `edited`, `shown` or `hidden` for a level while another one is edited. Levels up to `NEIGHBOUR_RANGE` (1) above and below stay in view and locked.
- `onEveryLevel(tags)`: true for a building outline with no level tag, which is drawn on every level.
- `EditedLevel`: a level number, or `'none'` for the features without a level.

## Parts

| File | What it does |
| --- | --- |
| `src/parse.ts` | `parseLevels`, `levelsOf`, the `LevelProblem` and `Levels` types |
| `src/floors.ts` | `floorsOf` |
| `src/shown.ts` | `levelState`, `onEveryLevel`, `NEIGHBOUR_RANGE`, `EditedLevel` |
| `src/fixture-values.json` | The values of the level keys in the fixtures, per key, with the number of features that have each (read by `parse.test.ts`) |

Used by `packages/module-levels` (picker, menu, inspector section, 3D), `packages/renderer` (`build.ts`, `engine.ts`, `layers.ts`: the dimming and the picking of other levels) and `packages/validation` (rules `missing_level`, `stairs_level_missing` and `stairs_level_unreached`).

## Tests

`bun test packages/levels`: the parser on each syntax and problem, `floorsOf`, `levelState` and `onEveryLevel`, and every level value found in the fixtures (`fixture-values.json`) must parse.

## More

- Research: [docs/research/indoor/README.md](../../docs/research/indoor/README.md), with [tagging-model.md](../../docs/research/indoor/tagging-model.md) (level syntax and edge cases) and [renderer-hooks.md](../../docs/research/indoor/renderer-hooks.md) (dimming by level).
- Module: [packages/module-levels](../module-levels/README.md).
- Steps: [docs/build-out/steps.md](../../docs/build-out/steps.md), "Indoor and levels" (2026-10-21).
