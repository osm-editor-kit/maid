# Maid Golf: plan and prototype

2026-11-12. Tobias asked for a Maid for golf course mapping: standard favourites, a standard style, the features it
needs, a list in the dock, presets, rules, map styles and filters that lock what a golf mapper should not touch. This
file is the plan; the prototype is `apps/maid-golf` with `packages/module-golf` on the local branch `golf`.

## Sources

- The gist <https://gist.github.com/tordans/74b92ca08ec2562e5036fdd786b6da99> (read as a summary through the web
  tool): notes on **FairwayMapper** (formerly OpenCourseMaps), a closed-source, golf-only OSM editor (React, MapLibre,
  Supabase, its own Overpass mirror, a Three.js 3D view): a mapper picks a course and draws tees, fairways, greens,
  bunkers, water and the hole lines, the tool sets the tags; scorecard import, a hole data dialog, achievements.
- The diary of jgruca (<https://www.openstreetmap.org/user/jgruca/diary/397731>), saved by Tobias as a PDF: how OSM
  Carto 5.4 draws golf courses, and the comments on it.
- The OSM wiki pages, saved by Tobias as PDFs (agent sessions do not call the wiki, core rule 1): `leisure=golf_course`,
  `golf=hole`, `tee`, `fairway`, `green`, `pin`, `bunker`, `water_hazard`, `lateral_water_hazard`, `rough` (DE),
  `out_of_bounds`, `cartpath`, `golf:course`, `golf:course=driving_range|pitch_and_putt` and the common mapping pitfalls.

## The tagging, checked against the wiki

| Feature | Tags | Geometry | Wiki says |
| --- | --- | --- | --- |
| Course | `leisure=golf_course`, `name`, `golf:course=9_hole\|18_hole\|27_hole\|pitch_and_putt\|driving_range`, `golf:par` | area | Draw it around everything incl. clubhouse and car park; a node only when the border is unknown. `sport=golf` is implied. |
| Hole | `golf=hole`, `ref`, `par`, `handicap` (1–18) | line | Tee to green along the line of play, one node fewer than par (par 4: tee, dogleg, green). Never share nodes with features on the ground. `golf_hole=*` is a mistake for `ref`; names are rare. |
| Tee | `golf=tee`, `tee=<colours>` | area, or the hole's first node | Tee markers per colour: `golf=tee_markers` (rare). |
| Fairway, rough, green | `golf=fairway\|rough\|green` | area | Butt them and share nodes, do not overlap; where there is a fringe, a multipolygon. Rough only where it helps ("weniger ist mehr"). |
| Pin | `golf=pin`, `ref` | point, best the hole's last node | |
| Bunker | `golf=bunker` + `surface=sand` | area | The wiki's useful combination is `surface=sand`; `natural=sand` is disputed. |
| Water hazards | `golf=water_hazard\|lateral_water_hazard` + `natural=water` (or `waterway=*` for a stream) | area or line | Do not map the water twice: add the golf tag to the existing water. |
| Out of bounds | `golf=out_of_bounds`, `ref` | line along the white stakes | Proposed, in use. |
| Cart path | `highway=path\|service` + `golf_cart=designated`; `golf=cartpath` only where no highway is mapped | line | Do not draw a cart path on top of a highway. |
| Driving range | `golf=driving_range` in a course, `leisure=golf_course` + `golf:course=driving_range` alone | area | |
| Courses in a facility | relation `type=sport` + `golf=course` with the holes, or `golf:course:name` on the holes | | |

**`landuse=grass`, Tobias's question:** not needed and not added. iD added `landuse=grass` to fairway and green in 2021
(the diary mentions it); the current schema does not. OSM Carto 5.4 draws `golf=*` itself, so a fairway without
`landuse=grass` renders. The editor leaves `landuse=grass` alone where someone set it, and adds none.

**Common pitfalls the rules catch:** generic names ("bunker", "fairway 1", "18th Hole", "Loch 7"), `golf_hole=*`,
holes whose points do not match par, holes glued to greens or fairways, `sport=golf` on every part. Not yet caught:
overlapping green, fairway and rough, cart paths on top of highways, water mapped twice, `natural=wood` for one tree.

## What the prototype has (`bun run dev-golf`, port 5180)

1. **Standard favourites.** `favourites` in the app config (`GOLF_FAVOURITES`: hole, tee, fairway, green, pin, bunker,
   rough, water hazard) are suggested while a person has no favourites: on the first visit, and again after they removed
   all of theirs. Then they are the person's own to change. Note: the deployed apps share one origin, so the favourites
   of another Maid count as "has some". Also the type picker's defaults: before anything is typed, an area offers green, fairway, tee, bunker, rough, water hazard, lateral
   water hazard, driving range, golf course and clubhouse; a line offers hole, cart path and golf path; a point offers
   pin, clubhouse and course (`GOLF_DEFAULTS`, `withGolfDefaults`).
2. **Standard style.** The lens "Standard: Golf" is the editor's standard and on at the first visit (`editorDefault`),
   in OSM Carto 5.4's colours from the diary: tee, fairway, driving range grass `#cdebb0`, rough `#b5d99a`, green
   `#88e0be` with a darker outline `#4c9c7e` (the diary's comments find it too close to water otherwise), bunker sand
   `#f5e9c6`, water `#aad3df`, the course `#def6c0`; holes thin grey with their number on the line (amber dashed while
   they lack number or par), out of bounds dashed grey. Everything else is drawn as usual. Under automation it stays off; `?lens=golf`
   turns it on.
3. **Golf features.** The dock view "Holes" (below).
4. **List in the dock ("footer list").** The data comes from the `golf=hole` ways of the loaded data and their tags,
   no relations. "Holes": one row per `golf=hole` of the loaded data, sorted by number, with par,
   handicap, the length along the line and what is missing (number, par, handicap, a number used twice on one course).
   A row selects its hole and marks it on the map while the pointer is on it. A line under it sums the holes, the par and
   the length. Courses with `golf:course:name` *(check the key)* get a column of their own.
5. **Presets.** Bunkers add `surface=sand`, water hazards add `natural=water` (from the schema); new presets "Golf
   Pin" and "Out of Bounds"; the course has fields for `golf:course` and `golf:par`, the hole for `golf:course:name`.
6. **Rules** (Issues dock): hole without number; hole without a par from 3 to 6; handicap outside 1 to 18;
   `golf_hole` instead of `ref` (fix moves it); points of a hole not par − 1; a hole sharing a node with a golf feature
   on the ground; bunker without `surface` (fix adds `surface=sand`); water hazard without `natural=water` or a waterway
   (fix adds it); generic name such as "Bunker", "Green 4", "18th Hole", "Loch 7" (fix removes it); `sport=golf` on a
   part of the course (fix removes it); golf course mapped as a point.
7. **Filters** (`GOLF_FILTER_STATES` in the config): roads, service roads, rail, buildings, power, shops and past/future
   features read-only; address points, building parts, indoor, boundaries, pistes and aerialways hidden; landuse,
   natural, water, paths, points and the rest editable (golf features without a landuse tag fall under "others").
8. **Drawing tools** of the parking editor that fit a course: right angles (Shift), rectangles (a tee box), merge two
   areas, cut an area along a line (rough around a fairway), resize. Divide and extrude are left out.
9. **Test scene** `golf` (`bun run fixtures-golf`, made up, not OSM data): three holes with every feature above and the
   mistakes the rules find. `?scene=golf` in development.
10. **Overview page**: the app's tile (`overview.json`, opens St Andrews, Old Course *(check the position)*) and a row
    "Golf courses" in the comparison.

## Next steps, in the order I would do them

1. **A "Hole" section above the fields** of a selected hole, green, tee or pin, as FairwayMapper's hole data dialog:
   par buttons 3/4/5, handicap, number, the length per tee colour, and the parts that belong to the hole (tee, fairway,
   green, pin) with a "missing" mark. Needs the decision on `dist` (step above).
2. **Draw a hole in one go**: a mode that asks for the tee, the dogleg and the green and writes the line of play, then
   offers to draw the green and tee around its ends. The order a mapper traces in (diary *(check)*): course outline,
   holes, greens, tees, fairways, bunkers, water, rough.
3. **Rules that compare features**: a pin outside every green, a hole whose start is not on a tee or whose end is not on
   a green, a green without a hole, overlapping fairways, a part of a course outside every `leisure=golf_course`. The
   validator gives neighbours (`RuleContext`); these need a spatial look-up per course.
4. **Scorecard import**: paste the par and handicap of 18 holes (a CSV line or a table) and write them onto the holes in
   order, one undo step.
5. **Browser check `check-golf`** for the dock view, the lens and the rules on the `golf` scene, and a row in
   `check-all` (the filters check skips golf, as it skips lanes).
6. **Style beyond the lens**: course areas drawn as fills under the iD style in the normal look too (today only the lens
   colours them), and labels with the hole number at the tee.
7. **Imagery**: which aerial imagery may be used for tracing (the gist's Azure Maps question); Maid's imagery index is
   iD's, so the licence follows iD.
8. **3D / elevation**: the climbing thread plans a terrain module (`module-terrain`, raster DEM, hillshade); green slopes
   could use it later.
9. **A fixture from real data**: a real course cut by Tobias from an extract (`fixtures-build --scene golf-…`, core
   rule 1), for the render check and the benchmark.

## Decided by Tobias

- 2026-11-12: favourites from the config, suggested while a person has none (done).
- 2026-11-12: English and German (English is the default, German when the browser or the person's choice says so).
- 2026-11-12: on `main` as one app, with a tile on the overview page.
- `landuse=grass`: answered by the wiki and Carto (above), not added.

## Open questions for Tobias

- The merged fairway+green multipolygon where there is no fringe: should the editor offer it (a "merge" that keeps the
  shared border), or leave it to the mapper?
- Length per tee colour (`dist:<colour>` or `golf:dist:*`): the wiki documents neither; leave it out until the hole
  section needs it?
