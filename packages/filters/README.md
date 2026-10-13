# @osm-editor-kit/maid-filters

Which features an editor lets you edit, only look at, or not see at all. Headless and without dependencies. The design is in [docs/architecture/06-filters.md](../../docs/architecture/06-filters.md).

```ts
import { createFilterSet, defaultFilters } from '@osm-editor-kit/maid-filters'

const filters = createFilterSet(defaultFilters, 'buildings:readonly,boundaries:hidden')
filters.stateOf({ building: 'yes' }, 'area') // 'readonly'
filters.categoriesOf({ railway: 'station' }, 'point').map((f) => f.id) // ['rail', 'points']
filters.with('buildings', 'editable').toParam() // 'boundaries:hidden'
```

- A filter is a named rule (`match`: tag conditions as data, a function where data cannot say it), the state it starts in (`editable`, `readonly` or `hidden`) and its `kind`.
- `defaultFilters` are iD's categories with iD's ids, so `disable_features=…` from an iD link can be read (`fromIdDisableFeatures`). Each filter is exported on its own: a fork writes `[cycleInfra, ...defaultFilters]` or its own list and passes it as `filters` in its editor config.

## Kinds

- **`rule`** (the default, and what a fork writes): an editor's own rule, such as `cycleInfra`. The first rule that matches decides, and nothing else is asked. A rule decides wherever it sits in the list: in front of the categories it overrides them, behind them it still wins over them. Among rules, list order decides.
- **`category`**: one of iD's categories. An object can be in several. Its state is the most permissive state of the categories it is in.
- **`fallback`**: iD's `others`. It takes an object only when no other category does.

## How the state of an object is decided

1. The first `rule` that matches gives the state, and the decision ends there.
2. Otherwise the object's categories decide: the state is the most permissive of theirs. Editable beats read-only, read-only beats hidden. So an object is hidden only when all of its categories are hidden, and read-only only when none is editable.
3. A `fallback` is looked at only when no category matched.
4. An object that nothing matches is editable.

A station mapped as a point (`railway=station`) is in `points` and in `rail`. With `rail` hidden and `points` shown it stays visible; the rail lines disappear. This is iD's rule (`renderer/features.js`: `getMatches`, `isHidden`).

- `filterOf` returns the rule that decides, or for categories the first category whose state the object gets, so a hidden object is counted under a category that hides it.
- `categoriesOf` returns every category the object is in, whatever their states. The renderer does not need it for the state.
- `stateOf` allocates nothing: it runs for every object on load and on every filter change.

## Differences from iD

- A value of `no` is absent for `*` (`{ power: '*' }` does not take `power=no`). iD's `power`, `building:part` and `piste:type` rules take any value, `no` included. Maid keeps its convention, which is the one iD uses for `indoor` and `landuse`.
- Relations: iD checks only relations with `type=boundary` against the categories. Here the caller gives the geometry, and any relation given as `relation` is checked. `multipolygon` relations are given as `area`.
- Untagged members of a multipolygon or boundary relation do not take the relation's category: this package gets the object alone and needs the parent relations as input (not built yet).
- Vertices are in no category; a vertex takes the state of its ways in the renderer.
- Address points are not `points`, as in iD.
