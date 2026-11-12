# Style package (`@osm-editor-kit/maid-style`)

The look of ways on the map, taken from iD, and the lens type. Headless: no React, no network. The renderer reads it to draw ways. The lens modules and the lens rules of the other modules use its matcher.

- The look is generated from iD's stylesheets and presets, not hand-copied: `bun run style-generate` (ADR 0001).
- `tagClasses` returns the classes iD gives an element (a port of iD's `svgTagClasses`). `resolveWayStyle` applies the generated rules to those classes the way the CSS cascade does: specificity, then source order. Results are cached per class list and geometry.
- A lens is data (rules of tags to colour, width and dash). `lensStyle` decides what a lens does to one feature. A lens file is read by `module-lenses`.

## What it computes and who uses it

| Export | What it does | Used by |
| --- | --- | --- |
| `tagClasses`, `hasInterestingTags`, `isArea`, `wayLayer`, `Tags` | iD's tag classes; whether a way is an area; the layer a way belongs to | `packages/renderer` (`build.ts`, `engine.ts`, and the other renderer files); shell |
| `resolveWayStyle`, `PartStyle`, `WayStyle` | Colours, widths for both zoom bands and dashes of a way, from the generated rules | `packages/renderer/src/build.ts` |
| `Lens`, `LensRule`, `LensLegend`, `LensStyle`, `lensStyle`, `matchesTags`, `describeMatch` | A lens, its rules and legend; the first matching rule decides; a list of values matches any | `module-lenses`, `module-lanes`, `module-parking`, `module-bike-infrastructure`, `module-turn-restrictions` |
| `parseColour`, `withAlpha`, `scaleAlpha`, `lensColour`, `lensFill`, `DIM_OPACITY`, `FILL_ALPHA` | Colour helpers for lens styles | the same modules, and the renderer |

## Parts

| File | What it does |
| --- | --- |
| `src/classes.ts` | `tagClasses` and the area and interesting-tag checks (ported from iD, ISC) |
| `src/resolve.ts` | `resolveWayStyle`: the cascade over the generated rules, with a cache |
| `src/lens.ts` | The lens types and the pure matcher and colour helpers |
| `src/generated/id-rules.json` | Every iD CSS rule that styles a way path by tag class (generated) |
| `src/generated/area-keys.json` | The keys that make a closed way an area (iD's `areaKeys`) (generated) |
| `scripts/extract.ts` | The generator (`bun run style-generate [iD checkout]`), reading `.reference/id` by default and `@openstreetmap/id-tagging-schema` |

The ADR lists a third generated file, `icon-presets.json`. It is not in the package: the preset list moved to `packages/presets` (`docs/build-out/steps.md`, the presets step). The ADR still names it.

## Tests

`bun test packages/style`: `tagClasses` against iD's own test cases and a recorded snapshot of the dense fixture; the resolved look of a few ways (residential road, motorway bridge, footway); the lens matcher (first rule wins, lists match any value).

## More

- [ADR 0001: the look is generated from iD's stylesheets](../../docs/adr/0001-style-from-id-css.md).
- [Styles and lenses](../../docs/architecture/07-styles-and-lenses.md).
- [Package layout](../../docs/architecture/03-packages.md).
- [iD tagging schema 7](../../docs/research/id-tagging-schema-7.md) and [renderer hooks for indoor](../../docs/research/indoor/renderer-hooks.md) for the renderer's use of the look.

## Open

- A move of the iD pin to `develop` needs `bun run style-generate` again (`docs/build-out/steps.md`, the iD pin step).
