# module-bike-infrastructure

The default look of the bicycle editor: the bicycle infrastructure as [TILDA](https://tilda-geo.de) classifies it, drawn
over iD's style. Every highway goes through TILDA's processing (`processBikelanes` of `@tilda-geo/bicycle-infrastructure`),
which splits it into the way itself and its road sides and gives each part a category.

| What | Where |
| --- | --- |
| The groups and their colours: **blue** for bicycles alone (dark: built apart, light: on the carriageway, dashed: shared with motor vehicles), **pink** where people on foot share it (solid: foot and cycle path, dashed: footway or pedestrian area with bicycles allowed), purple dashed for what TILDA cannot classify | `src/groups.ts` |
| One line per part: on the way, or beside the road for a side (a sidewalk further out than the cycleway); two thin lines along a sidepath (`_adjoining`); a dotted line for a side mapped as a way of its own; lighter under construction | `src/features.ts`, `src/layers.ts` |
| The traffic sign of a part as its image (main sign above the additional signs), the bundled SVGs of the traffic sign field | `src/sign-images.ts` |
| Drawn while no lens is on, and with the lens "Bicycle infrastructure" (legend, rest dimmed); another lens hides it | `src/shown.ts`, `src/lens.ts` |
| A preset per category and per subcategory a mapper chooses, with TILDA's German names as search terms; each preset's tags give its category (tested) | `src/presets.ts` |

The app applies it in `apps/maid-bicycle/src/maid.config.ts` (`bikeInfrastructure({ lenses: lensChoice })`, the lens in
`lenses({ lenses: [bikeInfrastructureLens] })`) and `presets.ts` (`bikePresetChanges(data)` after the traffic signs).

Test cases: the made-up scene `bicycle` (`bun run fixtures-bicycle`, `tools/fixtures/bicycle.ts`) and its browser check
`bun run check-bike-style bicycle --app bicycle`, which writes screenshots to `reports/bike-style/`.
