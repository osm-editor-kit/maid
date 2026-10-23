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

Not ported yet: categories, recently used presets, addable presets, preset defaults per geometry, language variants of names. Location sets are ported (see below). Names and labels are English only. The rules that are ported, and the ones that are not, are listed under [Compared with iD](#compared-with-id).

## Changing presets in a child app

`withChanges(base, changes)` returns the preset data with the changes applied: fields and presets added or replaced, the fields a preset shows changed, names, hidden presets and universal fields. The base is not changed. It works on the raw data (`PresetData`), so `{preset}` references and labels resolve as in the default data. Build the lookup from the result:

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

`EditorConfig.presets` takes the built `Presets`, which does not keep its data, so the config calls `createPresets` on the result. The three apps do not build them at import time: `apps/*/src/presets.ts` exports `makePresets()` (the data, the module changes, `createPresets`), and `maid.config.ts` gives the editor `lazyPresets(() => import('./presets').then((m) => m.makePresets()))` from `@osm-editor-kit/maid-core`. The schema's data and the country data (about 1.4 MB, 400 kB gzip) are then a chunk of their own, fetched in parallel with the entry (a `modulepreload`, `apps/vite-presets-preload.ts`) and run after the map exists; `editor.presets` is undefined until then (`editor.presetsPending`, `editor.onPresets`). `apps/maid/src/preset-changes.example.ts` is a longer example; its changes go into `apps/maid/src/presets.ts`.

`PresetChanges` has four keys:

| Key | Shape | What it does |
| --- | --- | --- |
| `fields` | `{ [id]: FieldDefinition }` | New or replaced fields. A definition replaces the whole field. `type` and `label` (English) are required; `key`, `keys`, `options`, `placeholder`, `geometry`, `prerequisiteTag`, `default` and the other schema properties are optional. |
| `presets` | `{ [id]: PresetDefinition }` | New or replaced presets. `name`, `tags` and `geometry` are required; `addTags`, `removeTags`, `icon`, `matchScore`, `searchable`, `terms`, `aliases`, `fields` and `moreFields` are optional. |
| `presetEdits` | `{ [id]: PresetEdit }` | Changes to a preset in the data: `name`; `hide` (true: not offered by search, still matched); `addFields`, `removeFields`, `setFields`; and `addMoreFields`, `removeMoreFields`, `setMoreFields`. |
| `universalFields` | `{ add?, remove? }` | Fields offered for every feature. |

The list edits work on the list the preset shows now. `addFields` takes a field id (it goes last) or `{ id, before }` or `{ id, after }` with another id in the list. `setFields` replaces the whole list, in the given order, which is how to reorder.

Options can be a record of value to label, or a list of `{ value, label }`. A record lists its values in JavaScript's key order, so a whole number such as `'1'` comes first. Use the list when the order matters.

**Errors.** Every problem is reported in one error, with the path of the change: an unknown preset or field id (`presetEdits["highway/cycleway"].addFields[0]: no field "sidpath"`), an unknown key (`addField`), a missing `type` or `label`, a field that is not in the list it is removed from, and `setFields` with `addFields`. A preset may end with no fields: as in iD, it then shows none, since no fields are inherited from the parent preset.

**Not yet:**

- Partial changes to a field: a field definition replaces the whole field, so change it with all its properties.
- Side labels of a directional combo (iD's `strings.types`): `Field` has no place for them.
- Other languages: texts are written in English only. Terms and aliases of an existing preset cannot be changed without replacing the preset.
- `{preset}` and `{@templates/…}` references in a definition: list the field ids.
- `locationSet` in a definition: a field or preset that a change adds or replaces has no location set, so it applies everywhere. `FieldDefinition` and `PresetDefinition` take none.

## Compared with iD

Compared at iD commit `0194f3926` (`.reference/id`), by reading the code: `modules/presets/index.js`, `preset.ts`, `collection.ts`, `field.ts`, `modules/actions/change_preset.js`, `modules/ui/field.js`, `modules/ui/form_fields.js` and `modules/ui/sections/preset_fields.js`.

- **same**: the same results as iD.
- **fixed**: was different and now follows iD.
- **left**: still different; the reason is given.

The `id-*.test.ts` files are adopted from iD's spec files. `as-id.test.ts` holds the rules that iD's specs do not test. Its table of ten presets has expected values worked out by reading iD's code, not by running iD.

| Function | State | What is the same, or what differs and why | Test that pins it |
| --- | --- | --- | --- |
| `match`: best score | same | For each tag key, the presets with the exact value, then those with `*`. A later candidate wins only with a higher score. | `presets.test.ts` "match" |
| `match`: geometry fallbacks | same | The generic preset of the geometry; a vertex gets the point preset. | `presets.test.ts` "falls back to the generic preset of the geometry when there are no tags" |
| `match`: `addr:*` fallback | same | Any `addr:` key gives the Address preset when the match is a fallback. | `presets.test.ts` "uses the Address preset when only addr:* tags are present" |
| `match`: location sets | same | With a `loc`, as iD's matchTags: when the best preset's location set does not hold there, the best one that does is taken, and the fallbacks follow as before. Without a `loc` every set holds. | `location-sets.test.ts` "match" (chitalishte, barangay, post box); `locations.test.ts` |
| `match`: a vertex on an address line is a point | left | iD's `match` gets the geometry from the entity. Maid takes the geometry as an argument, and the model decides it. | `packages/model/test/data/OsmNode.test.js` |
| `areaKeys` | same | Keeplist: the first key of each area preset, except `barrier`, `highway`, `footway`, `railway`, `junction` and `type`. Discard list: the addTags of line presets. Suggestions and replacements are left out. | `id-index.test.ts` "#areaKeys" |
| `matchScore` | same | An exact value scores the preset's `matchScore`, a `*` half of it, a missing key is -1. addTags add a boost. `searchable: false` multiplies by 0.999. A `matchScore` of 0 or none is 1 (iD's `originalScore`). | `id-preset.test.ts` "#matchScore" |
| `matchGeometry` | fixed | Added as iD's preset method. | `id-preset.test.ts` "#matchGeometry" |
| `matchAllGeometry` | fixed | Added (F-presets-1). iD's preset list uses it for a selection. The field-level version, which iD's field list uses, is not ported. | `id-preset.test.ts` "#matchAllGeometry" |
| `isFallback` | same | No tags, or only `area`. | `id-preset.test.ts` "isFallback" |
| `setTags`: addTags | same | A `*` becomes `yes` unless the preset matches on that key and the key has a value. addTags overwrite the tags. | `id-preset.test.ts` "#setTags" |
| `setTags`: `area=yes` | same | On an area, when no addTag is an area key (not for a preset that can also be a line) and no exception applies. | `id-preset.test.ts` "for a preset with a tag in areaKeys" |
| `setTags`: field defaults | same | See [When iD applies field defaults](#when-id-applies-field-defaults). Not checked against `prerequisiteTag`, as in iD. The location set of the field is checked when a `loc` is given. | `as-id.test.ts` "a field default is set even when its prerequisiteTag does not hold"; `location-sets.test.ts` "a field default is written only where its location set holds" |
| `setTags` and `applyPreset`: `skipFieldDefaults` | fixed | An option. It skips the field defaults of the new preset only, as iD's `actionChangePreset` does. | `as-id.test.ts` "skipFieldDefaults adds the addTags but no field default" |
| `unsetTags`: removeTags | same | The removeTags, without `ignoringKeys`. Without removeTags, the addTags. | `id-preset.test.ts` "#unsetTags" |
| `unsetTags`: field defaults and `area` | same | A default is removed when the key has exactly that value, unless `ignoringKeys` names the key. `area` is always removed. | `id-preset.test.ts` "removes tags that match field default tags" |
| `unsetTags`: `skipFieldDefaults` | fixed | An option. | `id-preset.test.ts` "preserves field default tags when skipFieldDefaults flag is on" |
| `applyPreset` (actionChangePreset) | same | The old preset's field keys go (not limited to the geometry), except the keys the new preset keeps. The sub-preset rule. The collective rule: the old preset's tags stay when it still matches. `skipFieldDefaults` is not used for the old preset's removal, as in iD. | `id-change-preset.test.ts` (13 tests); `as-id.test.ts` "skipFieldDefaults does not stop the old preset's field defaults from being removed" |
| `fields`: `{preset}` and `{@templates/x}` | left (kept) | iD's runtime does not expand references: the schema build does. The bundled dist still has them, so Maid expands them. The templates are presets with a `@template` tag in the dist. | `presets.test.ts` "expands the internet_access template into the cafe fields" |
| `fields`: inheritance from the parent (`a/b` to `a`) | fixed | Removed: iD gives a preset with no fields of its own none. Was different. | `as-id.test.ts` "a preset with no fields of its own shows none"; `changes.test.ts` "as iD: a preset with no fields" |
| `fields`: geometry filter | same | A field with a `geometry` applies to the listed geometries only. | `presets.test.ts` "takes the label of building for building_area_yes and shows it only for areas" |
| `fields`: location sets | same | With a `loc`, a field whose location set does not hold is left out of `fieldsFor` and `moreFieldsFor`, for the preset's fields, its moreFields and the universal fields (iD's `fields(loc)` and `isAllowed`). | `location-sets.test.ts` "fields" |
| `search`: location sets | same | With a `loc`, a preset whose location set does not hold is not searched, neither by name nor in the empty-query list (iD's collection.search). | `location-sets.test.ts` "presets that exist in some countries only" |
| country of a point | same | `countryAt` is iD's `countryCoder.iso1A2Code(center)` (the address field's country), in lower case. `countryCodesAt` is the territory, then the country (`['hk', 'cn']`), as iD's address field tries them. `matchesLocation` is iD's `locationSetsAt(loc).has(id)`. All use the borders that ship with the packages. | `locations.test.ts` |
| `fields`: `prerequisiteTag` | fixed | `key`, `value`, `valueNot`, `keyNot`, and `values` and `valuesNot` (these were missing), tested in iD's order. An absent key counts as `''`. | `presets.test.ts` "applies internet_access/fee only while its prerequisite holds"; `as-id.test.ts` "prerequisiteTag values, valuesNot and keyNot hold as iD tests them" |
| `fieldsFor`: a field has a value | fixed | A key that is in the tags counts even with an empty value, and a multiCombo's prefixed keys count (iD's `tagsContainFieldKey`). Was different. | `as-id.test.ts` "a field whose key is in the tags is shown, even with an empty value"; "a multiCombo field is shown when a key under its prefix is set" |
| options of a check field: `"undefined"` | fixed | id-tagging-schema lists the unset state of `check`, `defaultCheck` and `onewayCheck` as the option "undefined". iD maps it to no value (check.ts); Maid makes it `''`, the unset value, with its label. Other fields keep "undefined" as a value, as iD does. | `presets.test.ts` "armrest: the option \"undefined\" is the unset value"; "the mapping is for the check types only"; `changes.test.ts` "its option \"undefined\" is the unset value" |
| `moreFieldsFor` ("Add field") | same | Non-universal fields by label, then universal fields by label (iD's form_fields sort). | `presets.test.ts` "lists the non-universal fields first, sorted by label" |
| field default when a field is added from "Add field" | left (UI) | iD's `field.show()` writes the field's default when the user adds the field. The package only offers the field. | none |
| `allKeys` of a field | same | The key and keys, the `:both` pair of a directional combo, `name:xx` of a localized field, the prefixed keys of a multiCombo. | `id-change-preset.test.ts` "preserves the tags when there is a matching field in the new preset" |
| `reference` of a preset: key and value | same | The schema's reference, else the first tag other than `name`, with its value. A `*` value gives the key only. | `reference.test.ts` "preset reference derived from the tags, as iD does" |
| `reference` of a preset: Wikidata | left | iD's `reference()` first looks for `wikidata`, `brand:wikidata` and similar, and returns a `qid`. Maid's `Reference` is `{ key, value? }`, which the UI reads. A `qid` variant would change that type outside this package. | none |
| `reference` of a field | same | The schema's reference, else the key; a multiCombo `key:` is looked up as `key:*`. The value is added by the UI. | `reference.test.ts` "field reference" |
| `name` | same | The English name; a name that refers to another preset is followed. The bundled names have none. | `presets.test.ts` "resolves a name that refers to another preset" |
| `aliases` and `terms` | same on the bundled data | iD's `t_all` reads an array, and the bundled English translations hold strings. Maid splits them as the schema build does: terms are lower-cased and trimmed, aliases are split by newline. Not checked against iD 7.x data: this package installs `@openstreetmap/id-tagging-schema` 6.19.2. | `presets.test.ts` "finds amenity/cafe by its term" |
| `subtitle` | n/a | Suggestion presets are not in the bundled data, and Maid has no subtitle. | none |
| search: the tiers and their order | fixed | Name, stripped name, term, tag value, close name, close term, key=value, name inside the query. The key=value tier is in iD's order: tags exact, tags prefix, addTags exact, addTags prefix (was exact and prefix over both together). | `id-collection.test.ts` (14 tests); `as-id.test.ts` "the key=value tiers come in iD's order" |
| search: close matches | same | Edit distance on text without diacritics (iD's `utilEditDistance` strips them), less the length difference, below 3. The close names are sorted by distance. | `id-collection.test.ts` "returns alternate matches in correct order" |
| search: the limit | fixed | The default is 50, iD's MAXRESULTS (was 20). The tiers are cut to `limit - 1` before duplicates are removed, so a preset that two tiers find uses two places. The fallback is last, or where a tier put it. | `presets.test.ts` "returns 50 presets by default"; `as-id.test.ts` "the tiers are cut before duplicates are removed"; "the geometry fallback keeps its place" |
| search: tag values and key=value | fixed | Compared as they are; only the query is lower-cased. Was lower-cased. | `as-id.test.ts` "a mixed-case tag value is not found by its lower-case query" |
| search: a preset's text in the query | same | A text is trimmed; a text that is empty before trimming is never found. | `id-collection.test.ts` "returns matches also when search term includes the preset name as substring" |
| search: `searchable: false` | same | Not offered by search; still matched. | `id-collection.test.ts` "excludes presets with searchable: false" |
| search: an empty query | left | iD returns the whole collection in its order, and the UI then shows the defaults. Maid returns the first `limit` presets by name, so a list can be shown. | `presets.test.ts` "returns the first 5 presets by name for an empty query" |
| search: a query of only spaces | left | iD checks for an empty query before trimming, so spaces run the tiers, and every preset matches the empty text. Maid treats it as empty. | none |
| `defaults(geometry)` and recent presets | left | Not ported (F-presets-5). The preset list starts from them in iD. | none |
| `addable` and `addablePresetIDs` | left | Not ported (F-presets-2). The todo test stays. | `id-preset.test.ts` "#addable" (todo) |
| preset categories | left | Not ported (F-presets-4). | `id-category.test.ts` (todo) |
| `allowsVertex`, `pointTags`, `vertexTags` | left | iD's vertex and point decisions. The model makes them in Maid. | none |
| merging presets after creation (`presetIndex.build`) | left | Not ported (F-presets-6): `createPresets` builds the lookup once. | `id-index.test.ts` "builds presets from provided" (todo) |

**Summary:** 48 rows: 26 same (one of them, aliases and terms, same on the bundled data only), 10 fixed, 11 left, and 1 not applicable (subtitle). Of the 11 left, one (`{preset}` expansion in `fields`) is a Maid addition that iD does not have, and it stays on purpose. The others are categories, recents, addable presets, Wikidata references, the UI's Add field default, a vertex on an address line, two query edge cases, the vertex helpers of iD's presets, and the merge of presets after creation.

### When iD applies field defaults

iD writes a field's default in `setTags`, and the UI writes it when the user adds the field from "Add field" (`field.show()`). `setTags` is called by `actionChangePreset` (a preset picked in the preset list, and the outdated-tags validation, which passes `skipFieldDefaults`), by the add point, line and area modes with the preset, and by the icon of the preset list. In `setTags`, the default is set only when:

1. the field is in the preset's own `fields`, not in `moreFields`, and it is not a universal field;
2. the field has a `key` and a non-empty `default`;
3. the field applies to the geometry (it has no `geometry`, or lists it);
4. the key is not set yet, or is `''`;
5. the field's `locationSet` holds at the location (iD only; with a `loc`).

`prerequisiteTag` is not checked there. The UI checks it, to decide whether a field is shown. The location is checked in the same way the UI checks it: `setTags`, `unsetTags` and `applyPreset` take it as `options.loc`, and the fields of `fieldsFor` and `moreFieldsFor` take it as their `loc` argument.

`unsetTags` removes a default only when the key has exactly that value, and not when `ignoringKeys` names the key or `skipFieldDefaults` is set. `actionChangePreset` calls the old preset's `unsetTags` without skipping, so the old preset's defaults are always removed.

Maid follows all of this, rule 5 included, when a `loc` is given. Without one, every location set holds.

The bundled data has four location-bound fields with a default: `crossing/markings_yes` (every country but BG, DE, AT, CH and PL), and `crossing/markings_yes-PL`, `-DE-AT-CH` and `-BG`. Each has the default `yes` for `crossing:markings`, and the presets `highway/crossing/uncontrolled`, `highway/footway/crossing/uncontrolled`, `highway/cycleway/crossing/uncontrolled` and `highway/path/crossing/uncontrolled` list them through the `@templates/crossing/markings_yes` template. Together the four location sets cover the world, so iD writes `crossing:markings=yes` in every country, each time from the one field that holds there. The location changes which field is shown and which options it lists: in Paris `crossing/markings_yes`, in Berlin `crossing/markings_yes-DE-AT-CH`. The tags written are the same as before.

### Relation members

The schema's `relation` (id-tagging-schema 7.x; the bundled 6.x data has none, so every answer is empty or true until it is updated) is read into `Preset.relation`. Three functions use it, all ported from iD:

- `relationRoles(tags)` (iD's `utilGetRelationSchema`): the roles of the best preset for geometry `relation`, else of the preset matching `{ type }`, else `{}`. A role's `label` is its English translation (`presets.presets[id].relation.role_labels[role]`), else the schema's own text. A reference `{other.role_labels.role}` takes that preset's label; a reference of another shape, a loop or an unknown preset gives `''`. The result is cached per tags object.
- `allowsDuplicateMembers(tags)` (iD's `utilRelationAllowsDuplicateMembers`): `false` only when that schema says `allowDuplicateMembers: false`.
- `matchTagPatterns(patterns, tags)` (iD's `osmMatchTags`) and `validRelationRoles(roles, geometry, tags)` (iD's `utilGetValidRelationRoles`): the member filters, in `relation.ts`. An empty value counts as no value, and an own key only: `constructor` is not a tag.

The label references were written from iD's code and the schema's shape, not checked against id-tagging-schema 7.3.0 (not installed yet). Tests: `relation.test.ts`, `relation-roles.test.ts`.
