# module-bike-infrastructure

The bicycle editor's own style (its lens "Standard: Bicycle infrastructure"): the bicycle infrastructure as [TILDA](https://tilda-geo.de) classifies it, drawn
over iD's style, only while that lens is on. Maid standard (no lens, `lens=none`) looks like iD. Every highway goes through TILDA's processing (`processBikelanes` of `@tilda-geo/bicycle-infrastructure`),
which splits it into the way itself and its road sides and gives each part a category.

| What | Where |
| --- | --- |
| The groups and their colours: **blue** for bicycles alone (dark: built apart, light: on the carriageway, dashed: shared with motor vehicles), **pink** where people on foot share it (solid: foot and cycle path, dashed: footway or pedestrian area with bicycles allowed), purple dashed for what TILDA cannot classify | `src/groups.ts` |
| One line per part: on the way, or beside the road for a side (a sidewalk further out than the cycleway); two thin lines along a sidepath (`_adjoining`); a dotted line for a side mapped as a way of its own; lighter under construction | `src/features.ts`, `src/layers.ts` |
| The riding direction from zoom 17, the renderer's glyphs at rest: a chevron with the line, a chevron back where bicycles ride against it (`oneway=-1`, the left lane of a two-way road, a contraflow lane), a chevron each way on a two-way part, an amber dot where a track or a way of its own does not say; from TILDA's `oneway` and `_lineReversed` ([ADR 0017](../../docs/adr/0017-line-direction-glyphs.md)) | `src/features.ts` `ridingDirection`, `src/layers.ts` |
| The traffic sign of a part as its image (main sign above the additional signs), the bundled SVGs of the traffic sign field | `src/sign-images.ts` |
| Drawn only with the lens "Bicycle infrastructure" (legend, rest dimmed); Maid standard and any other lens hide it | `src/shown.ts`, `src/lens.ts` |
| A preset per category and per subcategory a mapper chooses, with TILDA's German names as search terms; each preset's tags give its category (tested) | `src/presets.ts` |

The app applies it in `apps/maid-bicycle/src/maid.config.ts` (`bikeInfrastructure({ lenses: lensChoice })`, the lens in
`lenses({ lenses: [bikeInfrastructureLens] })`) and `presets.ts` (`bikePresetChanges(data)` after the traffic signs).

Test cases: the made-up scene `bicycle` (`bun run fixtures-bicycle`, `tools/fixtures/bicycle.ts`) and its browser check
`bun run check-bike-style bicycle --app bicycle` (it asks for `lens=bike-infrastructure`), which writes screenshots to `reports/bike-style/`.
