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

Tailwind needs the module's sources in `apps/maid/src/index.css`: `@source '../../../packages/module-traffic-signs/src';`.

## Status: not complete

The module shows the **fallback only**: a text input for the value of the key, committed on blur or Enter. The sign picker is not mounted, for two reasons:

1. **`d3-selection` is missing.** The package's factory (`createTrafficSignField`) returns a function that takes a d3 selection from its host and calls `selectAll`, `data`, `enter`, `merge` and friends. The package does not declare d3 as a peer, and nothing in this repo installs it. To mount the package, add `"d3-selection": "^3.0.0"` to this module's `package.json` dependencies (the package's own dev dependency is `~3.0.0`).
2. **`@osm-traffic-signs/converter` is missing.** It is a declared peer (`>=0.7.0`) and is not installed. The package loads the sign data and the SVGs through the host's `loadConverter`, `loadCountryCatalogue` and `getSvgAssetUrl`, so no sign data comes from the network unless these adapters do.

The package's remaining host adapters (iD's combobox, tooltip, icon, `utilRebind`, `utilGetSetValue`, `utilNoAuto`, `utilTotalExtent`, `countryCoder`, `t`, `context.graph`, `context.cleanTagValue`) still have to be written for Maid. Pinning the country: `countryCoder.iso1A2Code` can return the configured country, with `utilTotalExtent` returning a non-null extent; the package then does not read the location.

The fallback loads nothing from the network, so it is safe under automation.

## What the presets do

- Roads that have their own field list (trunk, primary, residential, living street, service) get `traffic_sign_way` (key `traffic_sign`). Secondary, tertiary and unclassified inherit from primary and residential in the schema, so they get it too.
- Cycleways, paths and footways get `traffic_sign_way` and the directions.
- Roads also get the directions and the six side keys (`cycleway:{left,right,both}:traffic_sign`, `sidewalk:{left,right,both}:traffic_sign`) as more fields, shown once they have a value.
- The base `traffic_sign` field is untouched, so the sign presets (`highway/traffic_sign`, `traffic_sign/*`) are unchanged.

## Known gaps

- The way's sign goes last among the fields, not after the width as in the fork.
- Side fields show only when tagged or added by hand. The fork shows them when the bike lane or sidewalk exists (`prerequisiteTag` cannot express "either side").
- No `cycleway:traffic_sign` (no side), no directions on the side keys, no crossings.
- No tag suggestions: they come with the package, which is not mounted.
- English labels only.

## Tests

`bun test packages/module-traffic-signs`: preset changes against the default data (residential, secondary, footway, sign nodes unchanged) and the mapping of change events to `onChange` calls.
