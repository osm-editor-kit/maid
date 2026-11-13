# The route sidebar: what it shows, what changed, what is open

Status: 2026-11-13. Tobias could not explain what the relation column shows for a route: the overview (the line with
the km column) had rows only for points, junctions and gaps, the ways were just the stroke between two rows, nothing on
the line could be clicked except points, and a selected way was nowhere on it. The German version for Tobias, with the
proposals to discuss: `route-sidebar/vorschlaege.md` in the project files.

## Before

- **Route overview**: rows for start, end, points (guideposts, stops), junctions, gaps and side lines. Ways had no row.
- **"Stops"**: every node member in data order (guideposts of a hiking route under "Stops").
- **"Ways"**: every way in data order, the list that edits (drag, remove, load).

The same members twice, in two orders, and only the lower list named the ways.

## JOSM, from memory

Not read again (josm.openstreetmap.de is OSM infrastructure, core rule 1). The relation editor is a table with one member
per row and a "linkage" column that draws a piece of line beside each row (continuous, arrow, broken at a gap, two lanes
for forward/backward, loop for a roundabout): the list is the diagram. Buttons sort by geometry, reverse, move, select in
the map, mark the map's selection in the list, zoom, download incomplete members, insert the selection before/after.
PT_Assistant numbers the stops on the map and offers fixes for order, gaps and stops off the way. Weak: a modal, dense
table, ids and tag text instead of names, one row per way (as endless as ours), glyphs to learn, no overview.

## Done

- **Stretches**: the ways between two rows are a row of their own (`data-stretch`): names (name, ref or preset, each
  once, travel order), length, number of ways. Hover lights the ways on the map and the other way round; a click selects
  a single way or opens the list of the stretch's ways with their lengths. The layout gives such a section
  `LayoutOptions.waySectionHeight` in schematic mode (`STRETCH_HEIGHT`, 24 px); to scale keeps the heights by length and
  shows the text only where it fits.
- **The selected member** is marked: its stretch (white, with a wide halo on the line, "Freiheit · Way 3 of 202") or its
  row; the overview's box scrolls to it on every selection and shows as many rows as needed to reach it.
- **Previous / next way** along the line (`neighboursOnLine`, across gaps), above the line; the map follows when the way
  is out of view.
- **In the map view**: a bar beside the stretches whose ways meet the map's bounds (`engine.inView`, again on every
  `moveend`, cached per layout). The line "In the map view: km a to b · Go there" was taken out again (Tobias,
  2026-11-13: not understood).
- **Head and km column** (Tobias, 2026-11-13): the km column only to scale, with the unit ("3.1 km", tooltip "from the
  start"); the state only as an icon for gaps or another order, its tooltip says what it means; the length with a
  tooltip that it is the loaded ways from start to end without gaps and side lines.
- **Gaps and junctions** are buttons: a gap fits the two ways around it and selects the first; a junction selects its
  node. The ways beside a gap are drawn whole up to the gap's row (before, the whole section next to a gap was drawn as
  a red dashed gap, 8 km on the Müggel-Spree-Weg preview); `OverviewSection.gap` now means "touches a gap row".
- A guidepost without a name is "Guidepost", not "tourism=information"; the role is not repeated beside it. The "Stops"
  group is "Points" when no member has a stop or platform role.

Checks: `check-route-overview` 70 of 70 (seven new: stretches, a single way selects and is marked, previous/next, the
list of several ways opens and closes), `check-relation-column` 31 of 31; unit tests in `overview-logic.test.ts` and
`layout.test.ts`.

## Open, for Tobias

1. One list instead of three: stretches open in place into their ways (role, drag, remove), the data-order groups fold
   away to the end for reordering.
2. Long stretches (where guideposts are missing or not loaded): split at name changes or every 5 km, or a switch
   "Overview / All ways".
3. Objects beside the route that are not members (stops, guideposts, signs, shelters, benches), grey at their place on
   the line with "Add", filtered per route type.
4. Km marks or stretch numbers on the map; "List follows the map".
5. "Close the gap" handing over to the reroute module (another thread reworks it).
6. Hints (junctions without a guidepost, points far from the line) behind a switch; gaps and order always shown.
