# @osm-editor-kit/maid-model

The data model of Maid: OSM entities, the graph, differences, geometry, the edit actions, and (in progress) undo history, the spatial index and the tagging-schema lookup.

**Ported from [Rapid 3](https://github.com/bhousel/Rapid)** at commit `413c0519f` (`modules/data`, `modules/lib`, `modules/geo`, `modules/actions`, parts of `modules/core`), ISC, © Rapid contributors. The reasons are in [docs/architecture/05-data-store.md](../../docs/architecture/05-data-store.md).

## State

| Part | Folder | From Rapid | State |
| --- | --- | --- | --- |
| Entities, changeset, GeoJSON and marker data | `src/data` | `modules/data` | Ported, Rapid's tests pass |
| OSM API JSON parser | `src/data/parsers` | `modules/data/parsers` | Ported. The XML parser is left out |
| Graph, difference, geometry, multipolygon, lanes, intersection | `src/lib` | `modules/lib` | Ported, Rapid's tests pass |
| Actions (39 of 41) | `src/actions` | `modules/actions` | Ported, Rapid's tests pass. Left out: `change_preset` (needs presets), `rapid_accept_feature` (Rapid's AI datasets) |
| Tagging-schema lookup: rulesets and variables | `src/schema` | `Ruleset`, `Variable`, `PropMatcher` unchanged; `RulesetSchema` is new and replaces `SchemaSystem` for what the model asks | Ported, Rapid's tests pass. No presets: `matchTags` answers nothing and `areaKeys` is empty until set |
| Undo history with staging | `src/edit` | core of `EditSystem` | Ported as `EditHistory`; 40 of Rapid's 51 tests kept. Cut: persistence, backups, animated edits, everything that talks to other systems |
| Spatial index | `src/spatial` | `SpatialSystem` | Ported as `SpatialIndex`; `getVisibleItems` takes the box as a parameter |

## What is different from Rapid

- **No application `Context`.** Rapid hands its whole application object to every entity and graph. Here `Context` is the small interface in `src/Context.ts`: id sequences and an optional schema lookup. Constructors keep Rapid's shape (`new OsmNode(context, props)`), so code and tests stay close to the original.
- **Global id types** (`EntityID` and friends) are declared in `src/types/globals.d.ts`, as in Rapid.
- **Entity properties are copied with `cloneData`** (`src/util/clone.ts`) and not with `structuredClone`, which made entity creation about three times faster on load.
- **Geometry is computed on first access**, not when an entity is created or a graph is built. Maid's renderer builds its own features and does not read it; loading the dense scene went from 587 ms to 211 ms in Chrome.
- **Summary of a point that became a vertex.** `Difference.summary()` reports it as modified, as iD does, and not as deleted (Rapid reports it as deleted). See [docs/research/id-tests/core.md](../../docs/research/id-tests/core.md) F-core-8.
- **The tests** are Rapid's, in `test/`, with one changed line each: they import `test/rapid.ts` instead of Rapid's `headless.js`. Maid's own tests are in `test/maid`.

Everything else is unchanged on purpose, including the formatting, so that a later Rapid fix can be compared line by line. For that reason the package is excluded from oxlint and oxfmt and has its own `tsconfig.json` without `noUncheckedIndexedAccess`.

## Still to do

- Loading the dense scene takes about 180 ms in Chrome (`bun run bench-model`), several times what the proof-of-concept store needed. The app does not use the parser; it creates entities with `entitiesFromOsmJson`.
- Enforce immutability (frozen entities in development builds).
- Decide what happens to the world-coordinate parts of `Geometry` and `GeometryPart`. Entity locations are lon/lat already; the world coordinates are a derived cache that Maid's renderer does not need.
- Bring the package under the repo's lint rules, or keep the exclusion and say why.
- Actions and model depend on each other in Rapid (`lib/intersection` and `lib/multipolygon` import actions), so they are one package here. Splitting off `maid-actions` needs those two untangled first.

## Run

```bash
bun test packages/model
bunx tsc --noEmit -p packages/model
```
