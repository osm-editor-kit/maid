# Lanes module (`@osm-editor-kit/maid-module-lanes`)

The lanes editor of Maid Lanes (`apps/maid-lanes`). A road's lanes are edited as a cross-section, a table with a column per lane and a map overlay, in the OSM `turn:lanes`, `width:lanes`, `lanes` and related keys.

## What a person sees / can do

- An inspector section "Lanes" above the fields of a road for motor traffic (residential, living street and service roads too, see `src/roads.ts`).
- A cross-section of the road with the roads before and after it, travel upwards. Turn arrows are drawn on each lane. A click or Enter on a lane chooses it.
- A lane table: a column per lane, rows for turn, width, bus, bicycle, vehicles and lane change. Each change writes only the key it is about, as one undo step.
- `+` next to each direction adds a lane, `×` in a column removes it. "Set lanes=N" sets the count to the sum of the directions when they do not add up.
- A status line that says what is missing for the road's colour in the "Lanes" lens.
- On the map: the lanes of the selected road as bands beside its line from zoom 17, turn arrows from zoom 18. The chosen lane is blue, the lane under the pointer amber.
- A map style "Lanes" (top bar): values per lane green, lane count only amber, a main road without lane tags pink, a residential or service road without them grey.
- Four Issues rules (`src/rules/lane-rules.ts`): the lane count does not add up, the number of values differs from the count, values of different length, and a placement on a lane the road does not have.

## Using it in an editor's config

From `apps/maid-lanes/src/maid.config.ts`:

```ts
import { laneRules, lanes, lanesLens } from '@osm-editor-kit/maid-module-lanes'
import { lensChoice, lenses } from '@osm-editor-kit/maid-module-lenses'

validation({ rules: [...defaultRules, ...turnRestrictionRules, ...laneRules] }),
lenses({ lenses: [lanesLens], editorDefault: 'lanes' }), // "Standard: Lanes", on at the first visit
lanes(),
```

Only `maid-lanes` switches it on. The lens and the rules are wired by the app as shown. `packages/shell/src/styles.css` lists `@source '../../module-lanes/src';`.

## Parts

| Part | What it does |
| --- | --- |
| `src/index.ts` | `lanes()` (the section and the map overlay), `lanesLens`, `laneRules` and the exports |
| `src/LanesSection.tsx` | The inspector section: diagram, table, status line |
| `src/edit.ts` | Pure tag edits: one value of one lane, one lane more or less |
| `src/scene.ts`, `src/roads.ts` | The cross-section scene (the road and its neighbours), and which ways have lanes |
| `src/diagram/` | The cross-section as an inline SVG (`LaneDiagram.tsx`), its shapes and turn arrows (pure) |
| `src/overlay/` | `LanesOnMap.tsx` (on `map.content`), the bands and layers (`layers.ts`, `scene-bands.ts`) and the arrows (`arrows.ts`) |
| `src/lens.ts` | The "Lanes" lens and `laneStatus`, which reads the lens's own rules |
| `src/rules/lane-rules.ts` | The four Issues rules, on the findings of osm-lanes |
| `src/hover-store.ts` | The lane chosen or hovered, shared by the table, the diagram and the map |
| `messages/`, `src/messages.ts` | The module's texts in en, de, fr and es |

## Tests

`bun test packages/module-lanes`: the tag edits, the lens, the rules, the diagram shapes and turn arrows, and the map bands and arrows.

## More

- Research and decisions: [docs/research/lanes-ux.md](../../docs/research/lanes-ux.md) (the options and the recommendation, option D).
- Steps: [docs/build-out/steps.md](../../docs/build-out/steps.md), section "Lanes".

Open (from the steps and the research doc):

- The lane packages come from the copy in the repository, not from npm, until the street space editor publishes them.
- `mirrorTags` in osm-way-chain still mirrors lane pipes and turns when a way points the other way. It is to be fixed upstream, by a person.
- The German cycle lane pattern (in the pipes, not in `lanes`) is not flagged, and neither is `placement=left_of:1`.
- Whether a plain `placement` on a `oneway=-1` road counts along the travel direction is assumed, not checked.
