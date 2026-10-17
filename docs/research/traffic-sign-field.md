# Traffic sign field for Maid: spec

Status: research, 2026-10-17. Nothing built yet. Scope: a React field for `traffic_sign` values in Maid, on the APIs of
`@osm-traffic-signs/converter` 0.7.0, modelled on the d3 field for iD.

Sources, read in this session:

- Converter: `packages/traffic-sign-field/node_modules/@osm-traffic-signs/converter` (`dist/*.d.ts`, `README.md`). Behaviour
  checked with two read-only `node` probes over the local `dist` (no network, no install); the probe scripts are in the
  session scratchpad.
- d3 field: `osm-traffic-sign-tools-id-field/packages/traffic-sign-id-field/src` (paths below are relative to that folder).
- iD fork wrappers: `iD--radnetz-berlin/modules/ui/fields/traffic_sign.ts`, `traffic_sign_group.ts`,
  `modules/traffic_sign/sign_field_rows.ts`, `modules/presets/traffic_sign_fields.ts`, strings in `data/core.yaml`.
- Maid: `packages/module-traffic-signs`, `packages/traffic-sign-field` (stub), `packages/ui/src/inspector/fields`.

Line numbers: `impl` is `createTrafficSignField.impl.ts`; `wrapper` is `modules/ui/fields/traffic_sign.ts` in the fork;
`group` is `traffic_sign_group.ts`.

---

## 1. Converter API

All names are exported from the main entry `@osm-traffic-signs/converter` unless a subpath is given. Types are in
`dist/data-definitions/TrafficSignDataTypes.d.ts`.

### 1.1 Parse and format a `traffic_sign` value

| Export | Signature (from the `.d.ts`) | Use |
| --- | --- | --- |
| `trafficSignTagToSigns` | `(input: string, countryPrefix: CountryPrefixType \| undefined) => SignStateType[]` (`dist/trafficSignTagToSigns/trafficSignTagToSigns.d.ts:3`) | Parse a value such as `DE:274-30,1000-31` into signs. Unknown codes come back with `recodgnizedSign: false`. |
| `signsToTrafficSignTagValue` | `(signs: SignStateType[], countryPrefix) => string` (`dist/signsToTrafficSignTag/signsToTrafficSignTagValue.d.ts:3`) | Format signs back to a value. The d3 field writes only this (`impl:113-124`, via `parse`/`serialize` in `signValue.ts:4-23`). |
| `splitSignIdSignValue` | `(urlKey: string) => { signId, signValue }` (`dist/trafficSignTagToSigns/utils/splitSignIdSignValue.d.ts`) | Split an `osmValuePart` such as `274[47]` into id and value. Takes the part without the country prefix. |
| `combineSignIdSignValue` | `(signId: string, signValue: string \| number \| undefined) => string` (`dist/utils/combineSignIdSignValue.d.ts`) | Rebuild an `osmValuePart` from id and value (`impl:325-343`). |
| `getSignWithRedirects` | `(osmValuePart, countryPrefix) => SignStateType \| undefined` (`dist/utils/getSignWithRedirects.d.ts`) | Look up a sign by canonical id or redirect. |
| `createSvgImportname` | `(countryPrefix, input: SignType \| string) => string` (`dist/utils/createSvgImportname.d.ts`) | Name of the bundled SVG, for example `DE_274_30`. |

Probed results (DE, 2026-10-17):

- `trafficSignTagToSigns('DE:274-30,1000-31','DE')` gives `274-30` (`traffic_sign`, svg `DE_274_30`) and `1000-31`
  (`exception_modifier`, svg `DE_1000_31`).
- `signsToTrafficSignTagValue` of the same gives `DE:274-30,1000-31`.
- `DE:274` is parsed to `274[47]`, because the catalogue's default value is written into the `osmValuePart`
  (`valuePrompt.defaultValue`). The round trip is then `DE:274[47],1000-31`. A test must assert the canonical form, not
  the typed input.
- A quoted modifier, `DE:"Kfz-Verkehr frei"`, is recognized (`osmValuePart` `"Kfz-Verkehr frei"`).
- An unknown code, `DE:999999`, gives `recodgnizedSign: false`, `signId: null`, `osmValuePart: '999999'`.
- `none` gives `osmValuePart: 'none'` with `recodgnizedSign: false`. The d3 field treats it as "no sign" (`impl:274`).

Note: `signValue.ts` in the d3 package passes `countryPrefix` as `undefined` when the value is empty, and returns no
value for zero signs (`signValue.ts:16-27`). Keep that rule: an empty list writes no tag (`undefined`).

### 1.2 Tag suggestions (the "tag plan")

| Export | Signature | Used by d3 |
| --- | --- | --- |
| `signsToTags` | `(signs, countryPrefix, geometry: GeometryType, answers?) => Map<string, string \| string[]>` (`dist/signsToTags/signsToTags.d.ts:4`) | Yes, with geometry `'way'` (`signTagPlan.ts:68-75`, `createSignRecommend`). Array values are allowed values (for example `highway`). |
| `signsToOptionalTags`, `signsToOptionalTagsBySign`, `optionalTagsToMap`, `mergeTagMaps` | `dist/signsToTags/signsToOptionalTags.d.ts` | No. The d3 plan ignores optional tags. |
| `signsToApplicability` | `(signs, geometry) => { applicable, notApplicable }` | No. |
| `signsToComments` | `(signs, geometry)` | No. |
| `tagsToSigns` | `(countryPrefix, osmTags: string[]) => SignType[]` (`dist/tagsToSigns/tagsToSigns.d.ts`) | No. Reverse direction, a suggestion of a value from tags. |

Probed (DE): `signsToTags` for `DE:274-30` with `'way'` gives `maxspeed: '30'`, `source:maxspeed: 'sign'`,
`traffic_sign: 'DE:274-30'`. With `'way_centerline'` it gives `{}`. For `DE:240` (README) `highway` is an array of allowed values.
`GeometryType` values: `node`, `way`, `way_centerline`, `area`, `relation` (README, "Main methods").

### 1.3 The country catalogue

- `countries: CountryPrefixType[]` and `countryDefinitions` (the 9 countries: AT AU BE BR CA DE FR IT PL), and the type
  `CountryPrefixType` (`dist/data-definitions/countryDefinitions.d.ts`).
- Per-country catalogue: subpath `@osm-traffic-signs/converter/data/<CC>`, export `trafficSignData: SignType[]`
  (`dist/data/DE.d.ts`). DE has 286 entries: 209 `traffic_sign`, 31 `exception_modifier`, 46 `condition_modifier`.
- Modifiers have a `kind` of `exception_modifier` or `condition_modifier` and an `osmValuePart` such as `1000-31`
  ("Beide Richtungen"). The `catalogue.signCategory` field has finer categories (`speed`, `hazard_sign`, `signpost`,
  `object_sign`, `surface_sign`, `direction_modifier`, and more: `dist/data-definitions/TrafficSignDataTypes.d.ts`).
- Fields the search and the row use: `signId`, `osmValuePart`, `name`, `descriptiveName?`, `description` (string or
  null), `kind`, `signValue?`, `valuePrompt?` (`prompt`, `defaultValue`, `format`), `image`, `catalogue.focus`,
  `compatibility?.incompatibleModifiers`, `redirects?`.
- Names and descriptions in the DE data are German (for example `name: "Zeichen 274"`, `descriptiveName: "Zulässige
  Höchstgeschwindigkeit von ?? km/h"`). The d3 field shows them as they are (`impl:266-276`). See section 4.6.
- `catalogue.focus`: values `'highlight'` (featured) and `true`. Probed: 18 DE signs are highlighted. The search uses
  `'highlight'` as "häufig verwendet" (`searchCatalogue.ts:9-13`).
- `compatibility.incompatibleModifiers` is set on 1 DE sign only (probe). The d3 field excludes such pairs in both
  directions (`signCompatibility.ts:12-30`).
- `valuePrompt.format`: `float` (5), `integer` (16), `time_restriction` (1), `opening_hours` (6) in DE. The input
  attributes come from `getValuePromptInputAttributes(format) => { type: 'number' | 'text', step? }`
  (`dist/data-definitions/valuePromptFormats.d.ts`). Probed: `integer` gives `type: number`, `opening_hours` and `text`
  give `type: text`.
- Warning for Maid: the main entry imports all nine catalogues statically (`dist/data-definitions/countryDefinitions.js:1-9`).
  Any import of `parse`/`format` pulls all of them into the bundle, and `data/<CC>` is the lighter import for the search.
  Measure the bundle before deciding (section 4.8).

### 1.4 SVG images

- Every DE sign has a bundled SVG: probe gave 286 of 286 with `hasBundledSvg`, and 0 with `isSignSvgMissing` (wiki flag).
  Exports from `dist/signSvgAvailability.d.ts`: `hasBundledSvg(country, signOrOsmValuePart)`, `isSignSvgMissing(sign)`,
  `isSignSvgUnavailable(country, sign)`.
- `loadTrafficSignSvg(country, sign | osmValuePart | string) => Promise<string | undefined>` (`dist/loadTrafficSignSvg.d.ts`).
  It returns the module's default export, a URL under Vite (`dist/loadTrafficSignSvg.js:1-40`). It caches per sign. It is the
  recommended entry in the README ("SVG assets / Vite lazy loading").
- Per-country loader maps: `@osm-traffic-signs/converter/data-svgs/<CC>/loaders` exports `SvgLoaders<CC>`, keyed by the svg
  name (for example `DE_274_30`), each a function returning a module (`dist/data-svgs/DE/loaders.d.ts`).
- Do not use `sign.image` for display. `image` is `{ kind: 'remote', sourceUrl, licence }` pointing at the wiki
  (`TrafficSignDataTypes.d.ts`, `SignImage`). A remote load breaks AGENTS.md rule 1 (automation sends zero requests to
  OSM infrastructure, and the wiki is one). Only the bundled SVG is shown.

### 1.5 Helpers the d3 field does not use

Leave them out unless a later step needs them: `signsToApplicability`, `signsToComments`, `showSignsToTagsWarning`,
`buildSignReferenceLinks` and `buildOsmWikiTagUrl` (`dist/referenceLinks/`), the question API (`questions/`, the sign's
`questions` array, 25 DE signs), `signsToTopLevelComments`.

---

## 2. What the d3 field does (UX walk-through)

Screens are described in words. "Field" means the sidebar row for one key.

### 2.1 The label and the tool link

- The label row has a small icon button (out-link icon, tooltip "Open in Traffic Sign Tool") before the remove icon
  (`impl:375-400`). It is hidden until a country is known. Clicking it opens
  `https://trafficsigns.osm-verkehrswende.org/<CC>?signs=<value>` in a new tab with `noopener` (`buildToolUrl.ts:3-16`).
  The link is built from the value as it is in the tags, so the tool gets the same signs.
- Country (`resolveCountryPrefix.ts:14-42`): the value's prefix (`^([A-Z]{2}):`, `:6`) if it is a known country; else the country
  of the selected feature's centre (`countryCoder.iso1A2Code`); else the first country of the converter. In Maid the country
  comes from the module option (`trafficSigns({ country })`, `module-traffic-signs/src/index.ts`), so only the value prefix
  rule and the option are needed.

### 2.2 Empty value

- The list shows one line, grey: "No signs yet. Search below by name or sign ID to add one." (`impl:489-503`, key
  `traffic_sign_field.empty`).
- Below it, a text input with placeholder "Add sign…" (`impl:752-790`). Typing opens a list (section 2.5).
- The wrapper adds a button "No sign here" under each empty row (`wrapper:144-162`, strings
  `inspector.traffic_sign_none.label` and `.tooltip`, `data/core.yaml:805-807`). Click writes `none` for that row's key. The
  button is shown when the key is absent and at least one feature is selected (`wrapper:145`). Every row of the iD group is
  its own instance of this field, so the button appears under `traffic_sign:forward`, `:backward` and the side keys too.

### 2.3 A value with signs

Each sign is a row box, in the order of the value (`impl:489-603`). Row parts, left to right:

1. A drag handle, "⋮⋮", a button with label "Drag or use arrow keys to reorder" (`impl:520-545`).
2. A figure, 36 px square at most, with the bundled SVG (`id-field.css:94-110`). Unknown: a "?" glyph (`impl:568`). "No sign": a "–"
   glyph (`impl:561-566`).
3. A body with two lines: the title (descriptive name, else name, else the code; "Unknown sign" for unrecognized values;
   "No sign" for `none`, `impl:278-285`), then a monospace code line with the `osmValuePart` (for example `274[47]`).
4. If the sign has a `valuePrompt`: a label with the prompt and a input on the same line, for example "Geschwindigkeit in km/h
   ohne Einheit:" with a number field (`impl:421-482`). Typing is debounced by 300 ms (`impl:26`, `:345-354`); blur writes
   at once (`impl:441-449`). An empty input writes the default value (`impl:325-343`).
5. A remove button (trash icon, title "remove") at the right edge (`impl:585-598`).

The row's hover title is the long description, else the name, else the title (`impl:287-300`).

Unknown values stay in the list as rows: title "Unknown sign", the raw code, "?" glyph, no image. They are kept on write.

### 2.4 Adding a sign

- The input is a combobox (iD's `uiCombobox`, `impl:729-750`). It filters from one character (`minItems(1)`).
- Each result shows: the bundled image (lazy, removed on error, `impl:697-727`), the title (descriptive name, else name),
  and the code. The list has no cap and scrolls (the `searchCatalogue` doc comment, `searchCatalogue.ts`).
- Accepting a result (click, or Enter on a highlighted row) adds the sign, clears the input and returns focus to it after
  10 ms (`impl:796-799`).
- Enter with no highlighted result (`impl:668-695`): the typed text is cleaned and parsed. If every parsed sign is
  unknown and the catalogue has a best match, that match is added. If the only matches are incompatible with the existing
  signs, nothing is added. Otherwise the text is added as an unknown sign.
- Enter also blurs the input (`impl:787-791`). Blur with text in it runs `change` and adds the same way.
- Incompatible signs are not offered (`isSignExcludedByCompatibility`, `impl:744`).

Search matching (`searchCatalogue.ts:19-40`), lower score is better, first match wins:

| Score | Rule |
| --- | --- |
| 0 | the sign id or code equals the query |
| 1 | id or code starts with the query |
| 2 | a name starts with the query |
| 3 | a word of a name starts with the query |
| 4 | a name contains the query |
| 5 | id or code contains the query |
| 6 | the description contains the query |

Ties: a sign with the `highlight` focus comes first. Empty query: the whole catalogue, highlighted first, in catalogue
order. The query is trimmed and lower-cased. By these rules `274` should match by id prefix and `Kfz` by a quoted modifier
containing it; not run in this session, to be confirmed by the unit test of section 5.

### 2.5 Removing

- The trash button removes the row at once and writes the value (`impl:356-360`). There is no undo of the field's own; the host's
  undo covers it.

### 2.6 Reordering

- Drag the handle: the row follows the pointer; the others move aside by a row (`impl:605-666`). A drag starts after 5 px
  (`registerDragAndDrop`). Release writes the new order.
- Keyboard: ArrowUp and ArrowDown on the handle move the row by one and move focus to the handle of its new place
  (`impl:362-373`).
- A hint under the field: "Signs are read top to bottom. The top sign is the main sign." (`impl:402-419`, shown in the tag
  reference body only, iD-specific).

### 2.7 Modifiers (Zusatzzeichen)

- The d3 field has no separate "attach modifier" control. A modifier is added with the same search as any sign, as a
  row after the sign it belongs to (`impl:668-695`). The search lists the modifiers (`kind` `exception_modifier`,
  `condition_modifier`) with their "Zusatzzeichen" names.
- The only rule is compatibility (section 2.4). Ordering is by hand (section 2.6).

### 2.8 Unknown values and errors

- Unknown codes are rows, not errors (section 2.3). Whole-value parse errors do not exist: the converter always returns rows.
- A load failure of the converter is logged by the wrapper and the field stays empty (`wrapper.ts`, the `catch` of
  `trafficSign`). A failed catalogue load sets the catalogue to `null` (`loadCatalogue` in `impl`), so the search returns
  nothing and the rows still show.

### 2.9 Directions and sides: the wrapper, not the package

The package (`impl`) has one row list per key and knows one key at a time. Directions and sides belong to the wrapper
`traffic_sign_group.ts`, which creates one d3 field per row key (`group:37-47`).

- The way: row `traffic_sign` (label "Whole way (both directions)" once directions are shown, else no label, `group:49-57`),
  and when directions are tagged or the toggle is on, rows
  `traffic_sign:forward` ("Forward (in the direction of the way)") and `traffic_sign:backward` ("Backward (against the
  direction of the way)"), `group:49-57`, strings `data/core.yaml:797-800`.
- Toggle "Per direction" in the label (`group:133-166`). It is locked on while a direction is tagged, with a tooltip saying why
  (`data/core.yaml:801-804`).
- Merge: direction signs that say the same as the whole way are shown as that one row (`mergeWaySigns`,
  `sign_field_rows.ts:127-134`). The tags are written back only with the next change of the whole way's sign
  (`waySignChanges`, `:146-154`). This is a display rule that can hide a stored direction value: see section 3.4.
- Arrows: each direction label has an arrow along the way's heading on the map, hidden when the visible part of the way is
  too curved (`group:168-186`). Needs the map's projection; not in Maid's field props.
- Sides: `cycleway` and `sidewalk` groups with one row per side (`sidesWith` `sign_field_rows.ts:50-66`, `signRows` `:71-95`),
  labels "Left", "Right", "Both sides" (`data/core.yaml:793-796`). Side direction keys are shown only when tagged.

### 2.10 The tag plan panel

- Shown below the field of a changed sign, for one selected feature, when all values are strings (`wrapper:106-142`).
- Header: "The traffic sign suggests these tags:" (`data/core.yaml:809`). Then a list. Each row is one tag change, shown as
  code: `key=value` for an add or remove, `key: from → value` for a change. Each row has a reason:
  "{sign} implies this", "The usual way to write this sign" (normalize), "Was implied by the previous sign {sign}", "Was
  implied by the previous sign {sign}; back to the downloaded value" (restore) (`data/core.yaml:811-815`, `impl:146-171`).
- Button "Apply these tags" writes all rows at once as one change (`impl:248-263`, `signTagPlanChanges`, `signTagPlan.ts:202-208`).
- The plan is computed when the value changes, comparing with the value before the change in this selection, or with the
  downloaded value (`computeSuggestions`, `impl:187-205`; `trackSign`, `impl:103-111`; reset on a new selection, `impl:813-820`).
- Not for `traffic_sign:forward` or `:backward`: `signTarget` returns `undefined` for them (`signTagPlan.ts:54-65`), so
  `signTagPlan` returns `undefined` and no panel is shown. The same is true for any key that is not a sign key.
- The rules (`signTagPlan.ts:126-200`): normalize the sign's own value; add or change the implied tags (`highway` only
  for paths, `PATH_HIGHWAYS` `:37-46`; sides use `bicycle`, `foot`, `segregated`, `SIDE_KEYS` `:48`); remove the tags the
  previous sign implied, or restore the downloaded value.

---

## 3. Keys and directions in Maid

### 3.1 Keys the field serves

From `packages/module-traffic-signs/src/presets.ts` (`TRAFFIC_SIGN_FIELDS`, lines 29-61):

| Field id | Key | Label | Preset use |
| --- | --- | --- | --- |
| `traffic_sign_way` | `traffic_sign` | Traffic Sign | `addFields` of roads and paths (`roadEdit` line 89, `pathEdit` line 95) |
| `traffic_sign_forward` | `traffic_sign:forward` | Traffic Sign (Forward) | `addMoreFields` (`DIRECTION_FIELDS`, line 78) |
| `traffic_sign_backward` | `traffic_sign:backward` | Traffic Sign (Backward) | `addMoreFields` |
| `cycleway_left_traffic_sign` | `cycleway:left:traffic_sign` | Traffic Sign (Left Bike Lane) | `addMoreFields` on roads (`SIDE_FIELDS`, line 79) |
| `cycleway_right_traffic_sign` | `cycleway:right:traffic_sign` | Traffic Sign (Right Bike Lane) | same |
| `cycleway_both_traffic_sign` | `cycleway:both:traffic_sign` | Traffic Sign (Both Sides Bike Lane) | same |
| `sidewalk_left_traffic_sign` | `sidewalk:left:traffic_sign` | Traffic Sign (Left Sidewalk) | same |
| `sidewalk_right_traffic_sign` | `sidewalk:right:traffic_sign` | Traffic Sign (Right Sidewalk) | same |
| `sidewalk_both_traffic_sign` | `sidewalk:both:traffic_sign` | Traffic Sign (Both Sides Sidewalk) | same |

Presets (`ROAD_PRESETS` line 63, `PATH_PRESETS` line 76): roads `highway/trunk`, `primary`, `secondary`, `tertiary`,
`unclassified`, `residential`, `road`, `living_street`, `service`; paths `highway/cycleway`, `highway/path`, `highway/footway`.
The base `traffic_sign` field of the sign presets (`highway/traffic_sign`, `traffic_sign/*`) is not touched.

The field type is `trafficSign` (`TRAFFIC_SIGN_FIELD_TYPE`, `presets.ts`), registered on `inspector.field` by
`trafficSigns()` (`module-traffic-signs/src/index.ts`). Its component is `signFieldComponent(country)`
(`field.tsx:53-55`).

Not in Maid's presets yet: `cycleway:traffic_sign` (no side; the d3 wrapper shows it when tagged, `sign_field_rows.ts:83`),
`traffic_sign` on other ways and nodes (sign nodes have their own presets), crossings. These are known gaps in
`module-traffic-signs/README.md` ("Known gaps").

### 3.2 Current placeholder

`field.tsx:25-52` is a text input committed on blur or Enter, with placeholder `e.g. DE:274-30`. It does not parse, does
not show images, and does not call the converter. It is the fallback to keep for read-only and for failure.

### 3.3 Grouping: iD groups, Maid does not

- iD: one field per group, one row per key (section 2.9). Maid: one field per key, presets say which keys a way has
  (`addFields` and `addMoreFields`). So the React field is one instance per key, with its label from the field definition
  (as iD's `fieldForRow`, `group:37-47`).
- Maid's "more fields" (`addMoreFields`) take the place of iD's "Per direction" toggle and of the side rows: a direction or
  side appears once it has a value or is added by hand. The `DirectionalGroup.tsx` component in `packages/ui` shows the
  side pattern for other keys; it is an option for layout, not a dependency.
- Decision for step 1: no merge of direction signs into the whole way. Maid shows the keys as they are stored. Merging can
  hide a stored `traffic_sign:forward` value behind the whole way's sign (section 2.9), which is a surprise in a field that
  writes tags. Revisit with the iD behaviour in step 3, as a pure function (`mergeWaySigns`, `sign_field_rows.ts:127`).

### 3.4 Tag plan per key

- Plan targets: `traffic_sign`, `cycleway:{left,right,both}:traffic_sign`, `sidewalk:{left,right,both}:traffic_sign`
  (`signTarget`, `signTagPlan.ts:54-65`). Directions have none (section 2.10). The plan for the whole way and the sides is
  therefore the only one to port in step 2.
- Maid has the feature's tags (`FieldProps.tags`, `packages/ui/src/inspector/fields/shared.ts:16-30`) and, for several
  features, `combined`/`features`. The plan is for one selected feature only (as iD). The downloaded version is needed for
  the "restore" rows. Maid's `FieldProps` has no base tags. Open point (section 6).

---

## 4. Proposed React design for Maid

### 4.1 Package and layout

- Package: `packages/traffic-sign-field` (`@osm-editor-kit/osm-traffic-sign-field`, already has `@osm-traffic-signs/converter`
  0.7.0, `@heroicons/react`, `react`). No Maid import. Its `src/index.ts` is an empty stub today.
- Files, one folder, no `package.json` changes beyond those already there:

```
src/
  TrafficSignField.tsx     the component (props below), the list and the search
  SignRow.tsx              one sign: handle, image, title, code, value prompt, remove
  SignSearch.tsx           the combobox input and its list (floating-ui, as ComboInput.tsx)
  ValuePrompt.tsx          the input of a sign with valuePrompt (debounced 300 ms, blur writes)
  TagPlan.tsx              step 2: the plan panel
  NoSignButton.tsx         "No sign here"
  sign-value.ts            parse and format (wraps the converter, no React)
  search-catalogue.ts      port of searchCatalogue.ts with isPromotedSign
  compatibility.ts         port of signCompatibility.ts
  tag-plan.ts              step 2: port of signTagPlan.ts (pure)
  build-tool-url.ts        port of buildToolUrl.ts
  catalogue.ts             lazy import of data/<CC> with a cache, and loadSvg defaults
  texts.ts                 the TrafficSignTexts type and the English defaults
  *.test.ts                unit tests (section 5)
```

### 4.2 Component API

```ts
export type TrafficSignFieldProps = {
  id?: string                       // the input's id, for the row label
  value: string | undefined         // the raw tag value; undefined: the key is absent
  country: CountryPrefix            // 'DE' etc.; a value prefix that is a known country wins
  readOnly?: boolean                // no change; the list and the search are hidden
  onChange?: (value: string | undefined) => void  // undefined removes the key
  texts: TrafficSignTexts           // every UI string, see 4.7
  loadSvg?: (country: CountryPrefix, osmValuePart: string) => Promise<string | undefined>
                                    // default: the converter's loadTrafficSignSvg (a bundled URL)
  mixed?: boolean                   // several features with different values: read-only "Multiple values"
  tagPlan?: TagPlanInput            // step 2; absent: no plan panel
  noSignButton?: boolean            // default true; whether the module offers it per key is open (section 6)
}
```

`onChange` is the only write. The module maps it to `(key, value)`, as `applySignTagChanges` does
(`module-traffic-signs/src/tag-changes.ts:11-17`). Undo: one change per committed action (add, remove, move, commit of
a value prompt, "No sign here"). Plan apply is one change with all keys: `onApplyTags(changes: Record<string, string | undefined>)`
(step 2), which maps to `onChangeTags` in `FieldProps` (`shared.ts`, `writeEdits` line 57).

### 4.3 Sub-components

- Sign list: `<ol aria-label={texts.listLabel}>` of `SignRow`. An empty value shows `texts.empty` as the one line
  (`<li>`, like the d3 field, `impl:489-503`).
- SignRow: grid `auto auto minmax(0,1fr) auto`, the same as `id-field.css:27-37`. The handle is a button; the figure holds
  `<img loading="lazy" decoding="async" alt="">` (decorative: the title says the sign; a sign image is redundant to a
  screen reader) with a 36 px box; the body is title, code, and (if any) the value prompt.
- SignSearch: input with `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`,
  `aria-activedescendant`, the `ListBox` of options with `role="option"` and `aria-selected`. Options: image 28 px, title,
  code (d3 `impl:697-727`, `id-field.css:251-290`). The list is in a portal (floating-ui `FloatingPortal`), with `offset(4)`,
  `flip({padding: 8})`, `shift({padding: 8})`, min width of the input (as the floating-ui setup in `ComboInput.tsx`).
- ValuePrompt: `<label>` with the prompt text and `<input type/step>` from `getValuePromptInputAttributes`
  (`valuePromptFormats.d.ts`). `id` is `${id}-value-${index}`, so the row label can point at it.
- NoSignButton: shown when `value` is `undefined` and not read-only; writes `none`.

### 4.4 Keyboard

- Search input: ArrowDown and ArrowUp move the active option; Enter accepts it, or with none active adds the typed text
  (section 2.4); Escape closes the list and restores the typed text to empty; Tab accepts the active option and moves
  focus; Backspace in an empty input removes the last sign (the chip rule of `Multi.tsx`, `ChipInput`, and d3 does not do
  this, so decide: yes, as Maid's semi-combos do, `Multi.tsx:58-60`).
- Handle: ArrowUp and ArrowDown move the row (section 2.6) and keep focus on the handle; the live region says
  `texts.moved({ position, total })` (polite, `aria-live`). Space and Enter on the handle do nothing.
- Remove: a button per row with `aria-label={texts.removeSign({ sign: title })}`.
- Value prompt: Enter blurs (commits), as Maid's text fields do.
- Keys in the list (`Escape`, arrows) must not reach the editor's keyboard shortcuts: stop propagation like `ComboInput.tsx`
  (`onKeyDown` Escape: `event.stopPropagation()`). Maid's shortcuts are in the editor; the combobox owns the keys while open.

### 4.5 Loading SVGs lazily

- A row's image URL comes from `loadSvg(country, osmValuePart)`. The default is the converter's `loadTrafficSignSvg`
  (`loadTrafficSignSvg.d.ts`), which imports the country's loader on first use and caches the URL. Only the image of a row
  or of a visible option is requested: options are rendered only while the list is open, and the `img` has
  `loading="lazy"`.
- No `image.sourceUrl` is ever fetched (section 1.4).
- Hook: `useSignImage(country, osmValuePart)` with a module-level `Map` of promises (one load per sign) and `useState` for the
  URL. The package cannot use Maid's TanStack Query client (no Maid dependency). If Maid's convention (TanStack Query for
  fetching, memory 2026-10-14) must hold, the module wraps `loadSvg` in `useQuery` and passes it in as the prop: open point.
- Catalogue: `loadCatalogue(country)` with explicit `import()` per country (static analysis, as the converter does with
  `countrySvgLoaderImports`, `loadTrafficSignSvg.js:4-30`), cached per country; the search is idle until it resolves.

### 4.6 Language of the sign texts

The catalogue names and descriptions of DE are German and are shown as they are, as in the d3 field. UI strings come
from `texts` (4.7) and are in Maid's four languages through Paraglide in the module (ARCHITECTURE.md "Texts and languages").
Open point: whether to show the English `name` of a sign where one exists. The data has no English names for DE (probe:
the `name` field is "Zeichen 274" in every language). Keep the German names in step 1 and say so in the module README.

### 4.7 The `texts` object

Each key is a string, or a function for values. Maid's module makes it from its `m` (paraglide, `messages/<locale>.json`),
so the package never sees Paraglide. Keys (English defaults in the d3 field, `impl:` lines in brackets):

```ts
export type TrafficSignTexts = {
  empty: string                                     // "No signs yet. Search below by name or sign ID to add one." [489]
  addPlaceholder: string                            // "Add sign…" [773]
  listLabel: string                                 // the field's label, for the list
  searchNoResults: string                           // new: nothing matches
  noSign: string                                    // "No sign" [279]
  noSignDescription: string                         // "There is explicitly no traffic sign here (traffic_sign=none)" [289]
  unknownSign: string                               // "Unknown sign" [282]
  reorder: string                                   // "Drag or use arrow keys to reorder" [524]
  moved: (v: { position: number; total: number }) => string   // new
  remove: string                                    // "remove" [592]
  removeSign: (v: { sign: string }) => string       // new (aria)
  openTool: string                                  // "Open in Traffic Sign Tool" [381]
  noneButton: string                                // "No sign here" (data/core.yaml:806)
  noneTooltip: (v: { tag: string }) => string       // "Sets {tag}: checked, there is no sign" (core.yaml:807)
  orderHint: string                                 // "Signs are read top to bottom. The top sign is the main sign." [412] (step 2)
  planHeader: string                                // "The traffic sign suggests these tags:" (step 2)
  planApply: string                                 // "Apply these tags" (step 2)
  planCause: { sign: (v: { sign: string }) => string; normalize: string;
               previousSign: (v: { sign: string }) => string;
               restore: (v: { sign: string }) => string }            // step 2
}
```

Interpolated strings are functions, so the module can use Paraglide's `m.key({ values })`. The d3 field's `{name}`
replacement (`impl:97-103`) is not needed.

### 4.8 What to leave out in step 1

Step 1 is one hour: a single key, add, remove, reorder, value prompt, "No sign here", the tool link, the fallback
when the converter fails. Leave out, with the step that adds it:

- Tag plan panel and its tests: step 2 (`tag-plan.ts` is pure, a port of `signTagPlan.ts`).
- Directions and sides as groups, the merge of direction signs, the arrows on the map heading: step 3, in the module, not the
  package. The map heading would need a prop from the module (`FieldProps` has no geometry).
- Several features ("Multiple values"): step 1 shows the mixed state read-only, as text, with `texts.mixed`. Editing a mixed
  value is not supported (iD asks for a choice of one value; not done here).
- Optional tags, applicability, comments, questions (section 1.5), reverse suggestions (`tagsToSigns`).
- Catalogue focus views (the iD tabs for the catalogue focus). Search over all signs is enough for step 1.
- Bundle size: the main converter entry pulls in all nine catalogues (section 1.3). Measure with a Vite build of the
  maid app before choosing; if too large, parse with the converter's `id-field-browser` entry only if it is smaller (it
  imports the same catalogues, so probably not). Open point.

---

## 5. Tests

### 5.1 Unit tests (`bun test packages/traffic-sign-field`, `bun test packages/module-traffic-signs`)

- `sign-value.test.ts`: parse and format round trip on canonical values: `DE:274-30`, `DE:274-30,1000-31`, `none`,
  `DE:"Kfz-Verkehr frei"`, an unknown code `DE:999999`. Assert `format(parse(x))` equals `x` for canonical input. For
  non-canonical input (`DE:274`) assert idempotence instead: `format(parse(format(parse(x)))) === format(parse(x))`
  (the converter writes `274[47]`, section 1.1). An empty list formats to `undefined`.
- `search-catalogue.test.ts`: port of iD's `searchCatalogue.test.ts` (108 lines; copy it, change imports, run).
  Cases: exact id before name; id prefix before name prefix; highlight breaks ties; empty query lists highlighted first;
  `exclude` removes a sign; a query with only spaces is empty. Use a small fixture catalogue built from `trafficSignData`
  (`data/DE.js`) by id, not a hand-made copy.
- `compatibility.test.ts`: port of the rule in `signCompatibility.ts` (both directions; the one DE pair from the probe).
- `build-tool-url.test.ts`: port of iD's 16-line test. `resolve-country` test (in `sign-value.test.ts`): the value prefix wins
  over the `country` prop when it is a known country; an unknown prefix falls back to the prop.
- Step 2: `tag-plan.test.ts`: port of iD's `signTagPlan.test.ts` (199 lines). Copy, change imports, run.
- Module: `presets.test.ts` and `tag-changes.test.ts` are kept; add one test that `signFieldComponent` renders the row for
  `traffic_sign=DE:274-30` (React test with the converter; `bun test` with `react-dom/server` is enough).

Keep each file under about 200 lines. No test may fetch an SVG URL from the network: `loadSvg` is injected in tests.

### 5.2 Browser check

Maid has no traffic sign scene and no app mounts the module (`apps/*`: no `trafficSigns` import). The check needs the module
in an app first, and the module's own step 1 must say so. Proposed:

- `tools/bench/traffic-sign-check.ts` and `package.json` script `check-traffic-signs` (`bun tools/bench/traffic-sign-check.ts`),
  in the style of `tools/bench/parking-check.ts` (`runCheck`, prints `ok <check>` and `FAIL <check>`).
- Entry in `tools/checks/check-all.ts`: add `'traffic-signs'` to `CHECKS`, to `MODULE_CHECKS`, and a `RUNS` entry with
  `only` set to the app that mounts the module. Update `EXPECTED_OK` for it.
- Checks, with real input and the map after each step: select a way with a sign value; add "274" via search and Enter (the row
  shows an image with `naturalWidth > 0`); the tag equals the converter's output (taken from `trafficSignTagToSigns`, not typed
  by hand); ArrowDown on the handle moves the row and the tag order follows; remove writes the tag without the sign; "No sign
  here" writes `none`; one undo step per action; the tool link opens the URL of `buildToolUrl`.
- Network: the check reads `read_network_requests`-style output (or Playwright's request log) and fails on any request to
  `wiki.openstreetmap.org` or another host outside localhost. This is the test of section 1.4.

---

## 6. Unsure

- Tag plan "restore" rows need the downloaded tags. Maid's `FieldProps` has no base tags. Check whether the model keeps a
  base graph (the d3 field uses `context.history().base()`, `wrapper:` `drawSuggestions`). Until then step 2 uses only the
  session's previous value.
- Maid's undo: is one `onChange` one step? The value prompt commits on blur, the iD field debounces 300 ms. Check the
  editor's history before choosing the debounce.
- Bundle cost of the main converter entry (all nine catalogues). Not measured.
- Whether Maid's TanStack Query convention applies to the SVG and catalogue loads inside the package, or only in the module.
- Sign names are German in the data. Whether the field should show them in the editor's language (no English names exist).
- The d3 field's `geometry` for the recommendations is `'way'`. Maid's geometry for a line or a closed area may need
  `way_centerline` or `area`. Not checked.
- The module's `package.json` still lists `@osm-traffic-signs/id-field` 0.1.0 and `module-traffic-signs/README.md` says the
  package is not mounted for d3 reasons. Both are stale once the React field lands: update the README "Status" section and
  drop the d3 dependency in the same change.
- Browser check: no traffic sign scene in the fixtures (`fixtures/*.json.gz`, not searched inside the gzip). Confirm that
  `small` or another scene has `traffic_sign` values before writing the check.
- Modifier attach: the d3 field has no separate control (section 2.7). Confirm with Tobias that the search is the design
  he wants in Maid, not a modifier picker.
- Keyboard: the Backspace-removes-last-sign rule (section 4.4) is copied from Maid's semi-combo, not from the d3 field.
  Confirm.
- "No sign here" under `traffic_sign:forward` and the side keys: iD shows it under every row, since each row is its own
  field (section 2.2). Whether Maid offers it on directions and sides is a design choice, not decided here.
