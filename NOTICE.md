# Notices

Maid's own code is under the ISC License ([LICENSE.md](LICENSE.md)). This file lists what comes from other projects. Keep it up to date when something is ported or added: one row, in the same change.

## Code

| What | From | Licence | Where in this repo |
| --- | --- | --- | --- |
| Tag classification (`svgTagClasses`), area detection, way layering, tag helper tables | iD, `modules/svg/tag_classes.ts`, `modules/osm/tags.ts`, `modules/osm/way.ts`. © iD contributors | ISC | `packages/style/src/classes.ts` |
| Area-key derivation from presets | iD, `modules/presets/index.js` | ISC | `packages/style/scripts/extract.ts` |
| The data model: entities, graph, difference, geometry, edit actions, undo history, spatial index, tagging-schema lookup, and their tests | Rapid 3 (<https://github.com/bhousel/Rapid>) at commit `413c0519f`: `modules/data`, `modules/lib`, `modules/geo`, `modules/actions`, parts of `modules/core`, `data/osm_rulesets.json5`, `test/unit`. © Rapid contributors | ISC | `packages/model` |
| A patch to MapLibre GL JS 6.12.0 (wheel-zoom delay, GeoJSON tile load order) | MapLibre GL JS. © MapLibre contributors | BSD-3-Clause | `patches/maplibre-gl@6.12.0.patch` |

## Data generated from other projects

| What | From | Licence | Where |
| --- | --- | --- | --- |
| Style rules for ways and areas | iD's stylesheets, `css/*.css`, at the commit in `tools/refs/id/pin.json` | ISC | `packages/style/src/generated/id-rules.json` |
| Presets with names and icons, area keys | `@openstreetmap/id-tagging-schema` | ISC | `packages/style/src/generated/presets.json`, `area-keys.json` |

## Assets

Licences in this table are from memory of the projects and still need to be checked against their repositories.

| What | From | Licence | Where |
| --- | --- | --- | --- |
| Preset icons, copied from the pinned iD build at setup, not committed | Maki (Mapbox), Temaki, Font Awesome Free, Röntgen, iD | CC0 (Maki, Temaki), CC BY 4.0 (Font Awesome Free icons, Röntgen), ISC (iD) | `packages/shell/public/sprites/` |
| Label font glyphs, Open Sans Semibold, from MapLibre's demo tiles | Open Sans | Open Font License or Apache 2.0, depending on the version | `packages/shell/public/fonts/` |
| Parking icons (39 PNG), and the presets and styles the parking editor follows | The Berlin parking mapping project (JOSM presets and map styles), used with the author's permission | Reuse allowed by the author | `packages/module-parking/src/icons/` |

## OpenStreetMap data

The files in `fixtures/` are cut from an OpenStreetMap extract (Geofabrik, Berlin, 2026-08-06).

© OpenStreetMap contributors. Available under the Open Database License (ODbL) 1.0, <https://www.openstreetmap.org/copyright>.

## Reference editors

iD and Rapid are cloned and built into `.reference/` for comparison. They are not part of this repository and not distributed with it. The host pages and adapters in `tools/refs/` are Maid's own code.
