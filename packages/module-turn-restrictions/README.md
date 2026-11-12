# Turn restrictions module (`@osm-editor-kit/maid-module-turn-restrictions`)

The turn restrictions editor of iD, on a junction: pick the road you come from, then click each turn to allow it, forbid it or make it the only one. The restriction is a `type=restriction` relation, written as one undo step. The module ports iD's "Turn Restrictions" field.

## What a person sees / can do

- **A section "Turn restrictions"** in the inspector, open at first, on a single selected node that is a junction: three or more highways meet there. Otherwise it says the roads here do not make a junction.
- **A junction sketch**: the roads around the node, and an arrow for each turn from the FROM road. The FROM road is picked when the section opens: the highest road class first, then a road that already has restrictions, then the longest. A person can pick another.
- **Hover or focus on a turn** highlights the FROM road, the TO road and any via ways on the map.
- **A click on a turn** cycles it: allowed, then "No" (`no_*`), then "Only" (`only_*`), then allowed again. The step back to allowed deletes the restriction. A turn that is "Only" shows the badge ONLY.
- **Search distance** (10, 20, 30, 50 or 75 m) and **via ways** (node only, up to 1, up to 2). The defaults come from the module's options. The person's choice is kept in the browser.
- **Indirect** turns (caused by a nearby restriction) are shown and marked as such. They cannot be clicked; the hint says to change the direct restriction next to them.
- A read-only road shows the turns but cannot change them.

## Using it in an editor's config

```ts
import { turnRestrictionRules, turnRestrictions } from '@osm-editor-kit/maid-module-turn-restrictions'

// in the modules list (apps/maid, apps/maid-bicycle, apps/maid-lanes):
turnRestrictions(),                 // or turnRestrictions({ maxDistance: 30, maxViaWays: 0 })
// in the validation module, which is not registered by the module itself:
validation({ rules: [...defaultRules, ...turnRestrictionRules] }),
```

`maxDistance` is the default search distance in metres (iD: 30); `maxViaWays` the default number of via ways (iD: 0, node only). The section's chunk loads when it is first shown. Tailwind needs `@source '../../module-turn-restrictions/src';` in `packages/shell/src/styles.css` (done). `apps/maid-indoor` does not use it.

## Parts

| File | What it does |
| --- | --- |
| `src/index.ts` | `turnRestrictions(options)` (the inspector section, its `when`) and `turnRestrictionRules` |
| `src/is-junction.ts` | Whether a vertex is a junction (the highways that count, from the model's `osmIntersection`). Kept out of the lazy chunk |
| `src/TurnRestrictionsSection.tsx` | The section: distance and via choices, FROM road, the sketch, the list of turns, undo texts. Lazy |
| `src/junction.ts` | `junctionSketch`, `junctionTurns`, `relatedWayIDs` (headless, SVG units) |
| `src/JunctionDiagram.tsx` | The drawing of the sketch and the turn hints |
| `src/turns.ts` | `turnStateOf`, `turnKindOf`, `cycleTurn`: what a click writes. Ported from iD's `restrictions.js` |
| `src/from-road.ts` | `roadRank`, `pickFromRoad`: which road the section starts with |
| `src/restriction-rule.ts` | `turnRestrictionIncomplete` (rule `turn_restriction_incomplete`): a restriction without its from, via or to member. No fix |
| `src/fixtures.ts` | A four-way crossing for the tests |

## Tests

`bun test packages/module-turn-restrictions`: junction detection and the sketch (fit, turned by the map's bearing, turn buttons on the TO roads), the click cycle and the relation it writes, via ways, the FROM road choice, relations of roads that change later, and the incomplete rule.

## Open

- [steps.md](../../docs/build-out/steps.md) still lists "Turn restrictions field as iD (large)" as open, and ADR 0009 decision 14 is marked open. The module covers the section; the rest of the field is not checked here.
- The broken-restriction warning (`restriction_broken`) is in `packages/validation`, not in this module. Whether the apps list it is not checked here.

## More

- Decision: [ADR 0009, decision 14](../../docs/adr/0009-decisions-of-2026-10-13.md) (restrictions field at a junction, build now, as iD).
- Research: [relation-handling.md](../../docs/research/relation-handling.md) (turn restriction checks in iD and Maid), [missing-features.md](../../docs/research/missing-features.md) (row 10), and [lanes-ux.md](../../docs/research/lanes-ux.md) section 5.1 (how this section works, read for the lane editor).
- Steps: [docs/build-out/steps.md](../../docs/build-out/steps.md), B6 (relations) and the notes on turn restrictions in Part F.
