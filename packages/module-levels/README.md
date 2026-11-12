# Levels module (`@osm-editor-kit/maid-module-levels`)

The level mode for buildings: pick a floor on the map, edit only that floor, and see the rooms in 3D. The level is kept in the URL, so a link opens on the same floor. It is the module of the indoor editor (`apps/maid-indoor`).

## What a person sees / can do

- **Floor picker** at the top left of the map, from zoom 17. "3D" first, then the floors of the features in view, highest first, each with a count of its features. Then "none" (the features without a level) and "All levels".
- **Choosing a floor** edits on that level. The other levels are dimmed. The levels up to one above and one below stay in view but are locked. Other levels are hidden.
- **"none"** shows the features without a level, to find and fix them. Its flyout hides or shows them.
- **Level in the URL**: `level=` takes a number as OSM writes it (`-1`, `0.5`) or `none`. Back and forward follow it, and a level chosen on the map is written to the URL.
- **Set level**: a click on a locked feature with no level opens a menu with the levels around it. The suggestions give their reasons (the edited level, the levels of connected ways, a room it lies in, the other levels in view). A suggestion that several sources give is shown in bold.
- **Level section** at the top of the inspector, for a feature with a level or a connector. On stairs, escalators and ramps it shows "from → to" and a button "Swap the direction".
- **3D**: the map tilts and each room and floor is drawn as an extruded shape, one level 4 m above the one below. The map is flat when the editor starts.

## Using it in an editor's config

```ts
import { levels } from '@osm-editor-kit/maid-module-levels'
import { missingLevel, stairsLevelMissing, stairsLevelUnreached, defaultRules } from '@osm-editor-kit/maid-validation'

// in the modules list (apps/maid-indoor):
levels(),
// in the validation module:
validation({ rules: [...defaultRules, missingLevel, stairsLevelMissing, stairsLevelUnreached] }),
```

`levels()` takes no options. Only `apps/maid-indoor` turns it on: `maid` and `maid-bicycle` had the level mode and lost it on 2026-11-03. The rules are listed by the app, as the other validation rules are. Tailwind needs `@source '../../module-levels/src';` in `packages/shell/src/styles.css` (done).

## Parts

| File | What it does |
| --- | --- |
| `src/module.tsx` | `levels()`. Registers the map parts (URL sync, engine, picker, menu, 3D) and the inspector section |
| `src/LevelPicker.tsx` | The floor picker. Its pure helpers (`floorsIn`, `floorChoices`, `levelPickerShown`, `nextFloors`) are exported and tested |
| `src/LevelMenu.tsx` | The "Set level" menu on a locked feature. Its pure helpers are `levelOffersFor`, `nearbySuggestionsFor` |
| `src/level-suggestions.ts` | `suggestLevels`, `isRecommended`, `withLevelsInView`, `pointInPolygon` (pure) |
| `src/LevelSection.tsx`, `src/level-section.ts` | The inspector section and the connector helpers (the two ends of a connector, its incline) |
| `src/LevelExtrusion.tsx`, `src/extrusion.ts` | The 3D view: the rooms of each level as extruded polygons (pure part in `extrusion.ts`) |
| `src/url.ts` | The `level` URL parameter |
| `src/engine-store.ts`, `src/view-store.ts` | The engine for the inspector section; whether the view is 3D (per visit, not stored) |
| `src/look.ts` | The look of the picker and menu buttons |

The level rules that go with it live in `packages/validation`; the level dimming and picking live in `packages/renderer`; the level parsing is in `packages/levels`.

## Tests

`bun test packages/module-levels`: the picker's floor lists and labels, the 3D extrusion, the connector section, and the suggestions of the "Set level" menu. The browser check is `bun run check-levels` (with `--app indoor`, scene `indoor`).

## Open

From [steps.md](../../docs/build-out/steps.md), "Indoor and levels":

- The texts of the picker, the menu and the section are English only in the code (no `messages/` in this package). Steps names the picker's texts for the i18n files.
- The level a new feature gets is not yet confirmed by the person (MapComplete asks).
- Levels above 3 make the picker's list long. A filter to indoor features is open.
- Snapping across levels while drawing (a flight drawn on level 0 that ends on level 1 gets `level=0;1`).
- OSM2World as a panel for the selected building ([3d-osm2world.md](../../docs/research/indoor/3d-osm2world.md), section 8).

## More

- Parsing and the level rules: [packages/levels](../levels/README.md).
- Research: [docs/research/indoor/README.md](../../docs/research/indoor/README.md); MapComplete's floor selector and iD's focus on an indoor level in [id-and-mapcomplete.md](../../docs/research/indoor/id-and-mapcomplete.md); 3D in [3d-osm2world.md](../../docs/research/indoor/3d-osm2world.md).
- Steps: [docs/build-out/steps.md](../../docs/build-out/steps.md), "Indoor and levels" (ticked 2026-10-21 to 2026-11-03).
