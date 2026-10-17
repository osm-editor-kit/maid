# Traffic signs module (`@osm-editor-kit/maid-module-traffic-signs`)

The traffic sign field for `traffic_sign` tags in Maid, the way the Radnetz fork shows it (WORKDOC features 2, 15 and 27). Two parts:

- `trafficSignPresetChanges`: the presets change. Roads, cycleways, paths and footways get a "Traffic Sign" field for the way, and "more fields" for the directions (`traffic_sign:forward`, `:backward`) and the signs of bike lanes and sidewalks per side.
- `trafficSigns()`: the module. It registers the field type `trafficSign` on `inspector.field`.

## Using it in an editor's config

```ts
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'
import { trafficSigns, trafficSignPresetChanges } from '@osm-editor-kit/maid-module-traffic-signs'

// in the modules list:
trafficSigns({ country: 'DE' }),
// in the config:
presets: createPresets(withChanges(defaultPresetData, trafficSignPresetChanges)),
```

Tailwind needs the module's sources in `packages/shell/src/styles.css`: `@source '../../module-traffic-signs/src';`.

## Status: the sign picker (step 1)

The field type `trafficSign` mounts `TrafficSignField` from `@osm-editor-kit/osm-traffic-sign-field` (`packages/traffic-sign-field`, built to move to the osm-traffic-sign-tools repository unchanged: no Maid import, texts and country come in as props). One field per key, as the presets have them.

- A row per sign: its bundled SVG (loaded lazily per sign), its name (German names from the DE catalogue), its code in mono, move up/down buttons (or Alt+ArrowUp/ArrowDown in the row) and a remove button. A sign with a value prompt (`274[47]`) has its input in the row. Parts the catalogue does not know stay as rows ("Unknown sign") and are written back as they were.
- Adding: the search under the rows (name, sign id, code; ranked as the d3 field ranks it). Modifiers (Zusatzzeichen) come through the same search and join the previous sign with a comma. Enter with text that matches nothing adds it as an unknown sign.
- Every change calls `onChange` once with the whole value (undefined when no sign is left), so one change is one undo step.
- Read-only: rows only. Several features with different values: "Multiple values", not editable.
- Loading: the field itself is loaded with `lazy` (the plain text input shows meanwhile), and it imports only the catalogue (`@osm-traffic-signs/converter/data/<CC>`) and the SVG loaders of the module's country. The converter's main entry (all nine catalogues) is used in tests only.
- Texts: the app's messages (`traffic_sign_*` in `packages/i18n/messages`), imported by a relative path in `src/texts.ts` because this package does not declare `@osm-editor-kit/maid-i18n`. Sign names stay German.

Next steps (docs/research/traffic-sign-field.md): the tag plan panel ("The traffic sign suggests these tags"), "No sign here" (`none`), the "Open in Traffic Sign Tool" link, drag and drop, the converter's time-restriction normalisation of `opening_hours` prompts and the converter's general redirects (the picker uses the catalogue's own redirects only).

## What the presets do

- Roads that have their own field list (trunk, primary, residential, living street, service) get `traffic_sign_way` (key `traffic_sign`). Secondary, tertiary and unclassified inherit from primary and residential in the schema, so they get it too.
- Cycleways, paths and footways get `traffic_sign_way` and the directions.
- Roads also get the directions and the six side keys (`cycleway:{left,right,both}:traffic_sign`, `sidewalk:{left,right,both}:traffic_sign`) as more fields, shown once they have a value.
- The base `traffic_sign` field is untouched, so the sign presets (`highway/traffic_sign`, `traffic_sign/*`) are unchanged.

## Known gaps

- The way's sign goes last among the fields, not after the width as in the fork.
- Side fields show only when tagged or added by hand. The fork shows them when the bike lane or sidewalk exists (`prerequisiteTag` cannot express "either side").
- No `cycleway:traffic_sign` (no side), no directions on the side keys, no crossings.
- No tag suggestions yet (next step).
- English labels only.

## Tests

`bun test packages/module-traffic-signs`: preset changes against the default data (residential, secondary, footway, sign nodes unchanged) and the mapping of change events to `onChange` calls.
