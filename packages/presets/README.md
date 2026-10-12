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

Not ported yet: location sets, fields whose key is a prefix (multi-selects such as `payment:*`), language variants of names, categories, recently used presets. Names and labels are English only.

## Changing presets in a child app

`withChanges(base, changes)` returns the preset data with the changes applied: fields and presets added or replaced, the fields a preset shows changed, names, hidden presets and universal fields. The base is not changed. It works on the raw data (`PresetData`), so inheritance and labels resolve as in the default data. Build the lookup from the result:

```ts
import { createPresets, withChanges, type PresetChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'

const changes: PresetChanges = {
  fields: {
    is_sidepath: { type: 'check', label: 'Along a Road (Sidepath)', key: 'is_sidepath', geometry: ['line'] },
  },
  presetEdits: {
    'highway/cycleway': { addFields: [{ id: 'is_sidepath', before: 'surface' }] },
    'highway/footway': { addMoreFields: ['is_sidepath'] },
    'amenity/fuel': { hide: true },
  },
}

// presets: createPresets(withChanges(defaultPresetData, changes)) in the editor config
```

`EditorConfig.presets` takes the built `Presets`, which does not keep its data, so the config calls `createPresets` on the result. `apps/maid/src/preset-changes.example.ts` is a longer example, and `apps/maid/src/maid.config.ts` shows where it goes.

`PresetChanges` has four keys:

| Key | Shape | What it does |
| --- | --- | --- |
| `fields` | `{ [id]: FieldDefinition }` | New or replaced fields. A definition replaces the whole field. `type` and `label` (English) are required; `key`, `keys`, `options`, `placeholder`, `geometry`, `prerequisiteTag`, `default` and the other schema properties are optional. |
| `presets` | `{ [id]: PresetDefinition }` | New or replaced presets. `name`, `tags` and `geometry` are required; `addTags`, `removeTags`, `icon`, `matchScore`, `searchable`, `terms`, `aliases`, `fields` and `moreFields` are optional. |
| `presetEdits` | `{ [id]: PresetEdit }` | Changes to a preset in the data: `name`; `hide` (true: not offered by search, still matched); `addFields`, `removeFields`, `setFields`; and `addMoreFields`, `removeMoreFields`, `setMoreFields`. |
| `universalFields` | `{ add?, remove? }` | Fields offered for every feature. |

The list edits work on the list the preset shows now, including the fields it inherits from its parent. `addFields` takes a field id (it goes last) or `{ id, before }` or `{ id, after }` with another id in the list. `setFields` replaces the whole list, in the given order, which is how to reorder.

Options can be a record of value to label, or a list of `{ value, label }`. A record lists its values in JavaScript's key order, so a whole number such as `'1'` comes first. Use the list when the order matters.

**Errors.** Every problem is reported in one error, with the path of the change: an unknown preset or field id (`presetEdits["highway/cycleway"].addFields[0]: no field "sidpath"`), an unknown key (`addField`), a missing `type` or `label`, a field that is not in the list it is removed from, `setFields` with `addFields`, and removing every field of a preset (an empty list makes it inherit its parent's fields).

**Not yet:**

- Partial changes to a field: a field definition replaces the whole field, so change it with all its properties.
- Side labels of a directional combo (iD's `strings.types`): `Field` has no place for them.
- Other languages: texts are written in English only. Terms and aliases of an existing preset cannot be changed without replacing the preset.
- `{preset}` and `{@templates/…}` references in a definition: list the field ids.
- Locations and `locationSet`, as in the rest of this package.
