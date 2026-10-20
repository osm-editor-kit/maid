# Indoor tagging model (OSM wiki)

Research for the indoor and building-levels Maid variant. Read on 2026-10-20 from the OSM wiki, 17 pages, one fetch each (list at the end). No edits, no contact.

**Reliability note.** The wiki pages were read through a summarising fetch, not as verbatim text. Tag names and values below are as the summaries returned them. Quotes are the summariser's wording. Before implementing a rule, a person should check it on the live page, especially the rows marked **conflict** or **not documented**.

## Summary

- **Simple Indoor Tagging (SIT) is the consensus schema.** Elements are `indoor=room|area|corridor|wall|door|level|column`. `level=*` is mandatory on indoor elements; `level:ref=*` is the signage label and may differ from `level`.
- **Multi-level features** use semicolon lists (`0;1`) or hyphen ranges (`-2-32`). `repeat_on=*` marks identical copies on other floors (doors, windows, lift doors). Buildings use `building:levels`, `building:levels:underground`, `roof:levels`, `min_level`, `max_level` and `non_existent_levels`.
- **Vertical connections:** staircases are `indoor=room|area` + `stairs=yes` + level list; lifts are `highway=elevator` areas with door nodes (`indoor=door` or `entrance=*`, `repeat_on`, `door=*`); linear stairs are `highway=steps` with a level list; escalators use `conveying=*`. Indoor ramps are not documented.
- **The pages disagree or are silent on several points:** the negative-range syntax examples, the meaning of `building:min_level` vs `min_level`, whether the starting level of `repeat_on` is included, decimal levels (0.5 is only an example), objects without `level`, nodes shared by ways on different levels, overlapping rooms, and footway level ranges. An editor needs its own rules for these and should mark them as such.
- **IndoorOSM (2011, GIScience UniHD)** modelled buildings as relations with `level_N` members, `buildingpart=*` ways and `connector:ids` lists of OSM IDs. It was replaced because of tag collisions, heavy relation use and unstable IDs. Do not use it for new work.

## Schema

### Elements (SIT, Key:indoor, Indoor Mapping)

| Tag                               | Element                       | Meaning                                | Notes                                                                                               |
| --------------------------------- | ----------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `indoor=room`                     | area                          | Enclosed space with walls on all sides | Inner rings of multipolygons allowed; `room=*` gives purpose                                        |
| `indoor=area`                     | area                          | Covered, not fully enclosed            | Walls only where mapped (`indoor=wall`) or shared                                                   |
| `indoor=corridor`                 | area                          | Walkway connecting rooms               | Key:indoor's wall guidance is self-contradictory ("walled" but "without walls"). Treat as ambiguous |
| `indoor=wall`                     | way (or area with `area=yes`) | Non-passable wall                      | Centreline way preferred                                                                            |
| `indoor=door`                     | node                          | Interior door                          | Used with `door=*`; shared by connected rooms and the wall                                          |
| `indoor=level`                    | area (outline)                | Outline of one level                   | Holds `level`, `level:ref`, `name`, `height`, `level:usage` (IndoorOSM)                             |
| `indoor=column`                   | area                          | Structural column                      | Listed in Key:indoor; not described in SIT summary                                                  |
| `indoor=yes`                      | any                           | Generic indoor element                 | Used when no SIT value fits                                                                         |
| `indoor=highway`, `indoor=stairs` | -                             | **Wrong**, listed as tagging mistakes  | Use `indoor=yes` or the proper element                                                              |

Wrong alternatives mentioned: `highway=corridor` (de facto since 2019, per Indoor Mapping), `highway=footway` + `indoor=yes`, `building:part=*` for rooms (not part of SIT; Key:indoor says not to use it for rooms).

### Level tags

| Key                                                         | Where                                                                         | Meaning                                                                                                                             | Source                                                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `level=*`                                                   | node, way, area, multipolygon                                                 | Zero-based floor number; 0 = ground, -1 = first basement. **Mandatory** on indoor elements (SIT). Other relations must not carry it | SIT, Key:level                                                                                                            |
| `level:ref=*`                                               | node, way, area, multipolygon, level outline                                  | Local floor label (`LG`, `G`, `1`, `B1`, `UK 1`, `1. verdieping`). No fixed list                                                    | Key:level:ref                                                                                                             |
| `repeat_on=*`                                               | node (page icons also show ways, areas, multipolygons; relations unspecified) | Floors where identical copies exist at the same position                                                                            | Key:repeat_on, SIT                                                                                                        |
| `min_level=*`, `max_level=*`                                | building=* or building:part=* outline or multipolygon                         | Minimum/maximum indoor level of the building. See conflict below                                                                    | SIT, Key:min_level                                                                                                        |
| `non_existent_levels=*`                                     | building                                                                      | Levels that do not exist (e.g. `4;13`, `12`), so floor numbers above a gap are not miscounted                                       | Key:level (via Indoor Mapping summary)                                                                                    |
| `height=*`                                                  | indoor element; level outline                                                 | Element height, or height of a level. Default metres                                                                                | SIT                                                                                                                       |
| `building:levels=*`                                         | building=* or building:part=* (nodes, areas, multipolygons; not ways)         | Positive integer, above-ground levels, excluding roof and underground                                                               | Key:building:levels                                                                                                       |
| `building:levels:underground=*`                             | building                                                                      | Levels below ground. Full definition not on the page                                                                                | Key:building:levels (See also only)                                                                                       |
| `roof:levels=*`                                             | building                                                                      | Levels inside the roof                                                                                                              | Key:building:levels                                                                                                       |
| `building:min_level=*`                                      | building part                                                                 | Count of skipped levels below a part that does not start at ground. Must be less than `building:levels`                             | Key:building:levels. **Conflict:** Key:min_level calls `building:min_level` a Simple 3D Buildings key about external look |
| `building:levels:ref=*`, `building:levels:ref:equivalent=*` | building                                                                      | Local floor names and their equivalents                                                                                             | Key:building:levels, Tag:highway=elevator                                                                                 |
| `addr:floor=*`                                              | any                                                                           | Floor name with address meaning, close to `level:ref`                                                                               | Key:level:ref                                                                                                             |

### `level` on specific features (Key:level)

- Ways may carry `level` when tied to one floor (multilevel parking, station platforms, airport concourses). Ordinary bridges and tunnels use `layer`, not `level`.
- `tunnel=building_passage` for roads through buildings; add `level` only if the passage serves a specific floor.
- Shops, entrances and similar points carry `level`. A point may list several levels (`level=0;1`) when it is present on each.

## Levels syntax and edge cases

### Value syntax

| Form                                   | Example                      | Documented?                                                                                               | Notes                                                                                   |
| -------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Integer                                | `0`, `-1`, `111`             | Yes                                                                                                       | 0 = ground; -1 = first basement                                                         |
| Semicolon list                         | `0;1`, `-1;0;1;2`, `-4;0;4`  | Yes                                                                                                       | Feature is present on each level; not necessarily accessible from each                  |
| Hyphen range, positive                 | `1-11`, `2-4`, `-1-5`        | Yes (SIT and Key:level examples; `-1-5` as stated by the SIT summary)                                     | Range covers every integer between ends ("no missing values")                           |
| Range, negative to negative            | `-4--2`, `-3--1` (repeat_on) | Yes, as examples                                                                                          | Examples list the lower number first                                                    |
| Range `-1--3`                          | -                            | **Not documented.** Key:level says it has no example. Read as descending                                  | Editor should normalise to `-3--1` or warn. Do not write it                             |
| Mixed                                  | `-2;-1;0;0.5;1-11;13`        | Key:level combined example                                                                                | Lists, ranges and a decimal in one value                                                |
| Decimal                                | `0.5`                        | **Not formally defined.** Key:level calls it under discussion and cites a US lift example for a mezzanine | Allow with a warning. Do not invent a rule                                              |
| Combined range and list in `repeat_on` | -                            | **Not documented**                                                                                        | Key:repeat_on asks whether a feature's own level must appear in its value: not answered |

### Numbering conventions

- Level 0 is the lowest level with any part above ground, to match `building:levels`. A partly buried floor counts as above-ground. A fully buried structure gets `building:levels=0` + `building:levels:underground=1` (the page's tomb example).
- `building:levels=0` alone is usually a mistake for `level=0`; it is meaningful only with `building:levels:underground` > 0.
- Roof levels continue the numbering (page example: roof level A = `level=3`).
- Some countries skip level 0 (Kazakhstan, Korea, Mongolia, per Key:level). Some one-based data exists from older versions of the page. A consumer may shift values when features exceed `building:levels` and none is tagged 0.
- Non-standard floor heights: use `height=*` and `roof:height=*`, not fractional levels (Key:building:levels). The page assumes about 3 m per floor for estimates.
- Skipped floors: `non_existent_levels=*` on the building.

### `level:ref` and `level`

- `level` gives the order; `level:ref` gives the label. They may differ (example: `LG` = `level=0`, `G` = `level=1`, `1` = `level=2`).
- Use both where possible. Shops with `level:ref` only make vertical order hard to determine.
- **Not documented:** what to do when only one of the two is set, and whether `level:ref` must sort. Order comes from `level`.

### `repeat_on`

- Use only when the feature is exactly at the same position on other levels (Key:repeat_on). Examples: doors, windows, lift and stair doors.
- Range and list forms: `1-3` (includes 1, 2 and 3), `-3--1`, `-4;0;4`.
- **Conflict on the starting level.** The Key:repeat_on summary says the start level is included. The SIT summary says "the starting level is not included", with the example `level=0` + `repeat_on=1;3` giving levels 0, 1 and 3. Both readings agree that the feature's own `level` applies. The editor should ensure the feature's own level is not duplicated in the output. Check the live page.
- Consumers should expand `repeat_on` into one object per level (SIT). OpenLevelUp, indoor= and OpenIndoor support it.
- Relations: "use on relations unspecified" (Key:repeat_on).

### Objects without a level

- SIT: `level` is mandatory on indoor elements. Not documented for POIs in a building that has `min_level`/`max_level`: the SIT summary says rough POI visualisation works with building `min_level`/`max_level` plus POI `level`.
- Entrance pages say `level=0` is the default for `entrance=*` (Key:entrance summary). Treat that as a default, not a rule for every object.

### A node shared by ways on different levels

- **Not documented.** Closest guidance:
  - A staircase lists every level it passes, even when not accessible from each (SIT, Key:level).
  - A shop spanning two floors may be tagged with both levels. An entrance reachable only from ground level is tagged `level=0` (Key:level).
  - Door nodes sit in the wall or elevator outline, and the connecting way has its own level.
- Suggested editor rule (not from the wiki): a node is a connection point on one level. Ways of different levels must not share a node unless the node is a documented connector (stair/lift door, `repeat_on` door). Flag the rest for review.

### Entrances reached from several levels

- **Not documented.** Key:entrance says it is a node on the building outline, `level=*` gives its floor, and internal doors use `indoor=door`.

### Overlapping rooms, walls and doors

- SIT: rooms are assumed walled. Adjacent spaces share nodes with the wall. An explicit wall replaces the implied one for that section.
- Doors are placed in walls mapped as ways, or in room outlines. Not in walls mapped as areas (SIT summary).
- Overlap checks between rooms on the same level: **not documented**.

## Vertical connections

| Connection                          | Tags (documented)                                                                                                                                                                | Source                        | Editor notes                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| Staircase (area)                    | `indoor=room` (or `indoor=area` without walls), `stairs=yes`, `level` listing every spanned floor (e.g. `2;3;4` or `2-4`), a `door=*` node per floor (`door=no` if open)         | SIT, Key:stairs, Key:level    | Key:stairs gives no level-range syntax                           |
| Escalator inside a staircase        | `conveying=yes` + `stairs=yes` + `indoor=room                                                                                                                                    | area` (no highway tag needed) | Key:conveying                                                    |                         |
| Escalator (linear)                  | `highway=steps` + `conveying=yes                                                                                                                                                 | forward                       | backward                                                         | reversible`+`incline=up | down`                                                                                           | Tag:highway=steps, Key:conveying |     |
| Moving walkway                      | `highway=footway` + `conveying=*`                                                                                                                                                | Key:conveying                 |                                                                  |
| Linear steps                        | `highway=steps` way; `level=0;1` (levels it connects or passes); `area:highway=steps` polygon optional                                                                           | Tag:highway=steps             | "Stairs serving more than two levels": no rule given             |
| Elevator (area, usual)              | `highway=elevator` + `area=yes`; `level=-1;0;1;2` (all served floors); hoistway `indoor=room`, per-level hoistway wall `indoor=wall` if needed                                   | Tag:highway=elevator          | Distinguishes from inclined lifts                                |
| Elevator door (node)                | `indoor=door` or `entrance=*`, `repeat_on=*`, `door=*`, `automatic_door=*`; inside the elevator area                                                                             | Tag:highway=elevator          |                                                                  |
| Elevator with different outer doors | Each level gets `indoor=wall` and an `indoor=door` node; connected to the inner door via `highway=footway` or `highway=path`; `automatic_door=no` or `locked=yes` where relevant | Tag:highway=elevator          |                                                                  |
| Inclined lift                       | Open way `highway=elevator`; endpoints may carry `level` and `door`                                                                                                              | Tag:highway=elevator          | Some funiculars are mapped as `railway=funicular`                |
| Elevator dimensions                 | Cage only (not hoistway): `height`, `maxheight:physical`, `door:width`, `door:height`; rectangular `length`, `width`; circular `diameter` (unit mm default)                      | Tag:highway=elevator          | Stated rule: dimensions refer to the cage                        |
| Ramp on steps                       | `highway=steps` + `ramp=yes                                                                                                                                                      | no                            | separate`; `ramp=separate`object as`highway=footway`+`incline=*` | Key:ramp                | Ramp types: `ramp:bicycle`, `ramp:stroller`, `ramp:wheelchair`, `ramp:luggage`, `ramp:portable` |
| Standalone ramp                     | `highway=footway` + `incline=*`                                                                                                                                                  | Key:ramp                      | Key:ramp does not cover indoor levels                            |
| Entrance                            | `entrance=*` node on building or area outline; `level=*` (default 0); `door=*` for door type                                                                                     | Key:entrance, Key:door        | Key:entrance: `entrance=gate` is a mistake (use `barrier=gate`)  |
| Footway between levels              | **Not documented**                                                                                                                                                               | -                             | Gap. Editor needs its own rule                                   |

## Building relations

| Concept                         | Documented in                                                | Notes                                                                              |
| ------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Building above and below ground | `building:levels`, `building:levels:underground`             | Positive integer. Underground levels do not count in `building:levels`             |
| Roof                            | `roof:levels`, `roof:height`                                 | Roof levels number after the top floor                                             |
| Skipped floors below a part     | `building:min_level` (count, Key:building:levels)            | Must be < `building:levels`. Conflict with Key:min_level                           |
| Lowest and highest indoor level | `min_level`, `max_level` on the building outline or relation | Required for `building=*` or `building:part=*`. `max_level` has no definition page |
| Floors with no level            | `non_existent_levels`                                        |                                                                                    |
| Level outline                   | `indoor=level` + `level`, `level:ref`, `name`, `height`      | Gives vertical order when POIs carry only `level:ref`                              |

**Conflict on `min_level`.** The SIT summary has `min_level=-1` as the lowest indoor level (for example a basement). Key:min_level agrees: "Minimum indoor level (floor) in the building as used in the Simple Indoor Tagging scheme". `building:min_level` means a count of skipped levels (Key:building:levels) or a 3D-building key (Key:min_level). Do not reuse the names; check the live pages.

## Validation rules for an editor

Each rule is marked **doc** (stated on a wiki page) or **proposed** (editor rule drawn from the docs; not stated on any page).

| #   | Rule                                                                                                                         | Basis                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Indoor element without `level` is an error                                                                                   | doc (SIT: level mandatory)                                          |
| 2   | Staircase `level` must list every spanned floor; a missing intermediate floor is a warning                                   | doc (SIT, Key:level)                                                |
| 3   | `door=*` only on nodes; a door node carries `indoor=door` or `entrance=*`                                                    | doc (Key:door, Key:indoor, Key:entrance)                            |
| 4   | Interior door placed on a wall way or room outline, not on an area-wall                                                      | doc (SIT summary)                                                   |
| 5   | `repeat_on` only on features at the same position on other levels; warn on other use                                         | doc (Key:repeat_on)                                                 |
| 6   | Elevator area: `highway=elevator` + `area=yes`; `level` lists all served floors; no elevator without `level`                 | doc (Tag:highway=elevator)                                          |
| 7   | `conveying=*` only on ways (`highway=steps` for escalators, `highway=footway` for moving walkways)                           | doc (Key:conveying)                                                 |
| 8   | `stairs=yes` only on areas, with `indoor=room                                                                                | area`and`level`                                                     | doc (Key:stairs) |
| 9   | `min_level`, `max_level`, `building:levels` only on `building=*` or `building:part=*`, nodes/areas/multipolygons, never ways | doc (Key:min_level, Key:building:levels)                            |
| 10  | `building:levels` is a positive integer; `building:levels=0` alone flagged as likely `level=0`                               | doc (Key:building:levels)                                           |
| 11  | `building:levels` > `building:min_level`                                                                                     | doc (Key:building:levels)                                           |
| 12  | `indoor=highway` and `indoor=stairs` flagged as mistakes                                                                     | doc (Key:indoor)                                                    |
| 13  | `entrance=gate` flagged, suggest `barrier=gate`                                                                              | doc (Key:entrance)                                                  |
| 14  | Level value must parse: integer, semicolon list, or range with lower bound first; decimal allowed with a warning             | doc for syntax, decimal treated as warning by the editor (proposed) |
| 15  | Range `-1--3` (descending) flagged and offered `-3--1`                                                                       | proposed (examples use lower first)                                 |
| 16  | `level:ref` set without `level` (or the reverse) flagged for review                                                          | proposed (not defined on Key:level:ref)                             |
| 17  | Rooms overlapping on the same level flagged                                                                                  | proposed (not documented)                                           |
| 18  | Ways of different levels sharing a node flagged unless the node is a documented connector                                    | proposed (not documented)                                           |
| 19  | Gaps in the level sequence without `non_existent_levels` flagged                                                             | proposed (suggested by Key:level's skipped-floors note)             |
| 20  | Osmose QA item 1300 exists for indoor checks; its rules are not on the pages read                                            | doc (Indoor Mapping summary)                                        |

## Tools named on the wiki

Names and URLs only, from the Indoor Mapping page and OSM Indoor Map page. Not fetched.

| Tool                       | URL                                                                                                                                                         | Status per wiki                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| indoor=                    | https://indoorequal.org                                                                                                                                     | active; renders indoor data with a level selector |
| MapComplete indoors        | https://mapcomplete.org/indoors                                                                                                                             | active                                            |
| MapGL Indoor Plugin        | https://map-gl-indoor.github.io/                                                                                                                            | active; rendering and routing                     |
| OpenLevelUp                | https://openlevelup.net/                                                                                                                                    | active; level viewer (Overpass-based)             |
| OSM Indoor Mapping Browser | https://clement-lagrange.github.io/osmtools-indoor/                                                                                                         | active                                            |
| OsmInEdit                  | https://osminedit.pavie.info/                                                                                                                               | active; web indoor editor. Replaces ID-indoor     |
| OpenIndoor                 | no URL on the page read                                                                                                                                     | renderer (MapLibre-based)                         |
| OSM Indoor Map             | https://wiki.openstreetmap.org/wiki/OSM_Indoor_Map (live site https://yopaseopor.github.io/osmindoormap, source https://github.com/yopaseopor/osmindoormap) | shows any key=value; GPL                          |
| ID-indoor                  | https://projets.pavie.info/id-indoor/                                                                                                                       | deprecated; replaced by OsmInEdit                 |
| Poliba Maps                | https://sisinflab.poliba.it/polibaindoor/                                                                                                                   | deprecated; small area                            |
| openindoor.io              | https://app.openindoor.io/                                                                                                                                  | marked abandoned                                  |
| OpenStationMap             | https://www.openstationmap.org                                                                                                                              | marked abandoned                                  |
| indrz                      | https://indrz.com                                                                                                                                           | other project                                     |
| indoorOSM (Heidelberg)     | no URL on the page read                                                                                                                                     | other project                                     |
| KDE kosmindoormap          | no URL on the page read                                                                                                                                     | other project                                     |

Not supported yet (per the Indoor Mapping page): Organic Maps, OsmAnd, Every Door, CoMaps (under development), StreetComplete ("won't support").

## Sources

Read on 2026-10-20, one fetch per page, through the summarising fetch (see the reliability note).

1. https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging
2. https://wiki.openstreetmap.org/wiki/Indoor_Mapping
3. https://wiki.openstreetmap.org/wiki/OSM_Indoor_Map
4. https://wiki.openstreetmap.org/wiki/Key:level
5. https://wiki.openstreetmap.org/wiki/Key:repeat_on
6. https://wiki.openstreetmap.org/wiki/Key:level:ref
7. https://wiki.openstreetmap.org/wiki/Key:indoor
8. https://wiki.openstreetmap.org/wiki/Tag:highway%3Delevator
9. https://wiki.openstreetmap.org/wiki/Key:door
10. https://wiki.openstreetmap.org/wiki/IndoorOSM
11. https://wiki.openstreetmap.org/wiki/Key:building:levels
12. https://wiki.openstreetmap.org/wiki/Key:min_level
13. https://wiki.openstreetmap.org/wiki/Tag:highway%3Dsteps
14. https://wiki.openstreetmap.org/wiki/Key:entrance
15. https://wiki.openstreetmap.org/wiki/Key:conveying
16. https://wiki.openstreetmap.org/wiki/Key:stairs
17. https://wiki.openstreetmap.org/wiki/Key:ramp

Not fetched: Key:min_level's linked Simple 3D Buildings page, Key:indoor's linked pages, Indoor/use_cases, Indoor/Projects, OpenLevelUp, OpenIndoor and every tool listed above.
