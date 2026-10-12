# @osm-editor-kit/maid-presets

Which iD preset describes a feature, and which fields it shows. Headless: no React, no DOM, no global state. The data is [`@openstreetmap/id-tagging-schema`](https://github.com/openstreetmap/id-tagging-schema); the matching is ported from iD (`modules/presets`).

```ts
import { defaultPresets } from '@osm-editor-kit/maid-presets/default'

const preset = defaultPresets.match({ amenity: 'cafe' }, 'point') // id 'amenity/cafe', name 'Cafe'
const fields = defaultPresets.fieldsFor(preset, tags, 'point')
```

- `createPresets(data)` builds the lookup from the three files of the schema or a changed copy of them. An editor gets its presets through its config, so a fork passes its own.
- The default data is a separate entry (`/default`), so importing the package alone does not pull in the JSON.
- `match` is called for every point drawn on the map. It uses an index by geometry and first tag key and does not scan the presets.

Not ported yet: location sets, fields whose key is a prefix (multi-selects such as `payment:*`), language variants of names, search, categories, recently used presets. Names and labels are English only.
