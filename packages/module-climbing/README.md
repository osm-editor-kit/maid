# Climbing module (`@osm-editor-kit/maid-module-climbing`)

The climbing section of Maid Climbing (`apps/maid-climbing`): crags, boulders and their routes. Plan and research: [docs/research/climbing.md](../../docs/research/climbing.md).

## What a person sees / can do

- An inspector section "Climbing" at the top of every climbing feature (`climbing=area|crag|route|route_bottom|route_top`, or a route relation `type=route` + `route=climbing`).
- A crag relation (`type=site`, `climbing=crag`): its routes in member order, numbered left to right as on the rock, with a grade chip coloured by difficulty (UIAA and French only), length and bolts. A click selects the route, hovering lights it on the map. Members that are not loaded are listed as such. Reordering is the relation column's ("Open" in Members).
- A crag as a point: a hint that only a crag relation can hold its routes.
- An area relation (`climbing=area`): its crags with their number of routes.
- A route (line, start point or relation): "Route 3 of 5 at Ostgipfel" with a button to the crag; or, in no crag yet, the loaded crag relations within 500 m (nearest first) with "Add", and "New crag with this route" (a `type=site` relation with the schema's addTags, then selected to be named). Each is one undo step.
- The fields of id-tagging-schema PR 2793 (`climbingPresetChanges`): bouldering, multi-pitch, pitches, ice, mixed, dry-tooling, aid, and the grades hueco, water ice, mixed, dry and aid, on crags and routes. Style fields are the PR's `defaultCheck`; the hueco options use an ASCII minus (see `src/presets.ts`).

## Using it in an editor's config

```ts
// maid.config.ts
import { climbing } from '@osm-editor-kit/maid-module-climbing'
climbing(),

// presets.ts
import { climbingPresetChanges } from '@osm-editor-kit/maid-module-climbing'
withChanges(defaultPresetData, climbingPresetChanges)
```

## Code

- `src/grades.ts`: grade systems in a fixed order, the shown grade, styles, a rough difficulty band. No conversion between systems.
- `src/logic.ts`: kind of a feature, a crag's routes, an area's crags, parents, nearby crags, the add and new-crag actions. Pure, tested in `src/climbing.test.ts`.
- `src/ClimbingSection.tsx`: the section.
- `src/presets.ts`: the PR's fields as preset changes. Remove entries once the schema version Maid uses has them.

Test scene: `?scene=climbing` (made up by `bun run fixtures-climbing`, `tools/fixtures/climbing.ts`).
