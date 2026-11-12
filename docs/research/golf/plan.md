# Maid Golf: plan and prototype

2026-11-12. Tobias asked for a Maid for golf course mapping: standard favourites, a standard style, the features it
needs, a list in the dock, presets, rules, map styles and filters that lock what a golf mapper should not touch. This
file is the plan; the prototype is `apps/maid-golf` with `packages/module-golf` on the local branch `golf`.

## Sources and what could not be read

- The gist <https://gist.github.com/tordans/74b92ca08ec2562e5036fdd786b6da99> (read as a summary through the web
  tool, not verbatim): it collects notes on **FairwayMapper** (formerly OpenCourseMaps), a closed-source, golf-only OSM
  editor (React, TypeScript, MapLibre GL, Supabase, its own Overpass mirror, a Three.js 3D view). A mapper picks a course
  and draws tees, fairways, greens, bunkers, water and the hole centre lines; the tool sets the tags. It has a scorecard
  import, a hole data dialog and achievements, and writes to the live API since v1.0 (2026-07-10). Open questions there:
  open source, and whether Azure Maps imagery may be used for tracing.
- **Not read**: the diary <https://www.openstreetmap.org/user/jgruca/diary/397731> and its images, and the OSM wiki
  pages the gist links. openstreetmap.org and the wiki are blocked from the cloud session, and core rule 1 counts them
  as OSM infrastructure that agent sessions do not call. To use them: save the diary (with its images) and the wiki
  pages as files in the project, and a later session reads those.
- What the prototype rests on instead: id-tagging-schema 7.3 (the golf presets and fields Maid already has), and the
  common golf tagging as Maid's maintainers know it. Points marked *(check)* below should be checked against the wiki
  and the diary.

## The tagging (as the prototype assumes it)

| Feature | Tags | Geometry |
| --- | --- | --- |
| Course | `leisure=golf_course`, `name`; `sport=golf` only here | area |
| Hole (line of play) | `golf=hole`, `ref` (number), `par`, `handicap`; tee to green, through the dogleg | line |
| Tee | `golf=tee`, `tee=white;yellow;red` (colours) | area (or vertex on the hole's start) |
| Fairway | `golf=fairway` | area |
| Rough | `golf=rough` | area |
| Green | `golf=green` | area |
| Pin | `golf=pin`, `ref` *(check: not in the schema)* | point |
| Bunker | `golf=bunker` + `natural=sand` | area |
| Water hazard | `golf=water_hazard` / `golf=lateral_water_hazard` + `natural=water` | area |
| Driving range | `golf=driving_range` | area |
| Cart path, path | `golf=cartpath` / `golf=path` (+ `highway=*`) | line |
| Clubhouse | `golf=clubhouse` (+ `building=*`) | area or point |

Not in the prototype, to decide *(check)*: `dist=*` or `golf:dist:<tee colour>` for the length per tee, `golf=out_of_bounds`,
`golf=practice` / putting green, `landuse=grass` on fairway and green, and the merged fairway+green multipolygon where
there is no fringe.

## What the prototype has (`bun run dev-golf`, port 5180)

1. **Standard favourites.** Maid's favourites are the person's own (settings), so the editor sets the type picker's
   defaults instead: before anything is typed, an area offers green, fairway, tee, bunker, rough, water hazard, lateral
   water hazard, driving range, golf course and clubhouse; a line offers hole, cart path and golf path; a point offers
   pin, clubhouse and course (`GOLF_DEFAULTS`, `withGolfDefaults`).
2. **Standard style.** The lens "Standard: Golf" is the editor's standard and on at the first visit (`editorDefault`):
   green `#16a34a`, fairway `#84cc16`, rough `#4d7c0f`, tee `#0d9488`, bunker `#eab308`, water `#2563eb`, lateral
   water `#0891b2`, holes red dashed (amber while they lack number or par), cart paths grey, driving range lime,
   clubhouse purple, the course outline dark green, everything else dimmed. Under automation it stays off; `?lens=golf`
   turns it on.
3. **Golf features.** The dock view "Holes" (below).
4. **List in the dock ("footer list").** "Holes": one row per `golf=hole` of the loaded data, sorted by number, with par,
   handicap, the length along the line and what is missing (number, par, handicap, a number used twice on one course).
   A row selects its hole and marks it on the map while the pointer is on it. A line under it sums the holes, the par and
   the length. Courses with `golf:course:name` *(check the key)* get a column of their own.
5. **Presets.** Bunkers add `natural=sand`, water hazards add `natural=water` when chosen; a new preset "Golf Pin".
6. **Rules** (Issues dock, each about one feature): hole without number; hole without a par from 3 to 6; handicap
   outside 1 to 18; bunker without `natural=sand` (fix adds it); water hazard without `natural=water` (fix adds it);
   generic name such as "Bunker", "Green 4", "Hole 3", "Loch 7" (fix removes it); `sport=golf` on a part of the course
   (fix removes it); golf course mapped as a point.
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

## Open questions for Tobias

- Which tagging decisions should the editor make by default: `landuse=grass` on fairway and green or not, the merged
  fairway+green multipolygon, length per tee colour?
- Should the app start in English (as now, golf mapping is international) or German like parking and lanes?
- Deploy it with the others (it is in `MAID_APP` on the branch) or keep it local until the hole section exists?
