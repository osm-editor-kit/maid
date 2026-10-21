# Indoor and levels: research overview

Research for a Maid variant that focuses on building levels and interiors, done on 2026-10-20 by five agents (Haiku, high effort). Each file marks what it read and what it inferred; treat the details as leads and check them before building. Spot-checked here with read-only `gh`: iD PR 12605 and iD issue 11894 are open, OSM2World is MIT, maplibre-gl-indoorequal is BSD-3-Clause. The OSM wiki pages were read once, with Tobias's permission (core rule 1).

| File                                             | Topic                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [volker-krause.md](volker-krause.md)             | Volker Krause's indoor mapping work (KDE KOSMIndoorMap, Transitous), the problems he sees in the data              |
| [tagging-model.md](tagging-model.md)             | Simple Indoor Tagging, level syntax and edge cases, vertical connections, validation rules (wiki)                  |
| [id-and-mapcomplete.md](id-and-mapcomplete.md)   | iD (PR 12605 "Focus the selected indoor level", older PRs, id-tagging-schema 563) and MapComplete's floor selector |
| [editors-and-viewers.md](editors-and-viewers.md) | JOSM IndoorHelper and its level filter, OsmInEdit, iD-indoor, indoorequal, OpenLevelUp                             |
| [renderer-hooks.md](renderer-hooks.md)           | Where Maid's renderer can dim features by level, block picking and add a fill-extrusion layer                      |
| [3d-osm2world.md](3d-osm2world.md)               | OSM2World, its object viewer and web build, iD issue 11894, the ways to show 3D in Maid                            |

## What the sources agree on

- **The data model is Simple Indoor Tagging**: `indoor=room|area|corridor|wall|door|level`, a `level` on everything, `level:ref` for the label on the signs, and `repeat_on` for things on many floors. IndoorOSM (building relations with `level_N` roles) is dead: 110 of 106,606 `type=building` relations use it (id-tagging-schema 563).
- **Levels are the hard part, more than the geometry**: ranges (`0-3`), lists (`0;1`), negatives, `0.5`, `repeat_on`, and objects with no level. Routers fail where a door, stair or elevator lacks the right level (Krause). Each tool has its own parser with its own bugs, so Maid needs one parser with edge-case tests.
- **No editor solved it yet**: JOSM's level filter (ticket 16523, open since 2018) ignores `min_level`/`max_level`. The dedicated editors (OsmInEdit, iD-indoor) faded. iD has no level UI in `main`; PR 12605 would add an opt-in "focus this level" that dims the other levels. MapComplete has the most complete floor selector.

## Building blocks for Maid

1. **One level parser and a level state**: the floors in view (MapComplete takes them from the features in view, `0` always included), the chosen floor in the URL, and other floors dimmed rather than hidden (iD 12605). The parser follows MapComplete and the wiki edge cases.
2. **Editing on a level**: a new feature gets the chosen level (MapComplete asks for confirmation), plus copying to another level or `repeat_on`. Snapping and crossing checks only within one level (iD's validations already ignore different levels).
3. **Validation**: missing `level`, a door not on a wall or room outline, stairs or an elevator without a level list, and gaps that make a floor unreachable (tagging-model.md lists 20 rules).
4. **3D**, from cheap to costly:
   - (a) MapLibre `fill-extrusion` per level, live with unsaved edits. Rapid does this for buildings.
   - (b) A floating panel with OSM2World's web build, like the photo panel.
   - (c) A full view like the junction editor.

   OSM2World renders rooms, walls with doors and elevator cabins. It does not yet render stairs between levels (issue 197, open since 2022) or `indoor=door`. Its object viewer converts in the browser and shows tag edits without saving them; whether it can follow geometry edits is not known yet.

## Questions for Tobias

- **Licences**: Maid is ISC. KDE's code is LGPL, and the indoorequal app and OpenLevelUp are AGPL, so only ideas can come from them, no code. maplibre-gl-indoorequal (BSD-3) and OSM2World (MIT) could be used directly.
- **Scope of a first step**: (1) and (3) without 3D, then (a)?
- **Follow `door=*`**: the July 2026 indoor workshop moves from `indoor=door` toward `door=*` (Krause). Should Maid follow that, or iD's presets?
- **Unchecked**:
  - The wiki and blog quotes came through a summarising fetch.
  - Several KDE and indoorequal source files returned 404.
  - The MapComplete source read is from February 2025.

## Next

Parked by Tobias on 2026-10-20. Three prototypes are listed in [steps.md](../../build-out/steps.md) under "Indoor and levels": MapLibre `fill-extrusion` per level, OSM2World in a floating panel, and a level mode like the relation column, with MapComplete's floor picker.
