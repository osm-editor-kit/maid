# @osm-editor-kit/maid-filters

Which features an editor lets you edit, only look at, or not see at all. Headless and without dependencies. The design is in [docs/architecture/06-filters.md](../../docs/architecture/06-filters.md).

```ts
import { createFilterSet, defaultFilters } from '@osm-editor-kit/maid-filters'

const filters = createFilterSet(defaultFilters, 'buildings:readonly,boundaries:hidden')
filters.stateOf({ building: 'yes' }, 'area') // 'readonly'
filters.with('buildings', 'editable').toParam() // 'boundaries:hidden'
```

- A filter is a named rule (`match`: tag conditions as data, a function where data cannot say it) and the state it starts in: `editable`, `readonly` or `hidden`.
- The list is ordered and **the first filter that matches decides**.
- `defaultFilters` are iD's categories with iD's ids, so `disable_features=…` from an iD link can be read (`fromIdDisableFeatures`). Each filter is exported on its own: a fork writes `[cycleInfra, ...defaultFilters]` or its own list and passes it as `filters` in its editor config.

Different from iD: iD shows a feature if any of its categories is visible; here the first one decides. An untagged way that is the outline of a multipolygon does not take the relation's category.
