# 0014: Below zoom 18 the map is for finding your way: no nodes on shapes, small hint dots

Date: 2026-11-08. Asked for in issue 6 ("hide or de-emphasize nodes, they clutter the view on farther zoom levels")
and decided by Tobias in the project thread "Reduce vertex clutter when zoomed out".

## Context

From OSM zoom 16 Maid drew every node that iD calls important (tagged nodes, junctions, ends of ways) and every
standalone point as a white dot with an outline, plus the house number plaques. In a micro-mapped area (the `medium`
scene, Mitte) that is about 12,000 nodes on ways and 11,000 points: kerbs, sidewalk ends, street lamps, trees,
manholes. At zoom 16 and 17 the map was covered in dots. Maid also counted any node shared by two ways as a junction,
so the shared corners of row houses and garages were drawn too; iD does not.

## Decision

- **Below OSM 18 (`VERTEX_ZOOM`) the map is for finding your way.** The lines and areas already show the shapes, so
  the nodes on them that only carry geometry (junctions, ends of ways) are not drawn. They show when their way is
  selected, and from OSM 18 on as before.
- **What would otherwise not be seen is a hint**: a standalone point, an address, or a node with tags on a way is a
  small grey dot without outline (radius 1.5) below OSM 18. You do not work with it there, you only see that
  something is there. House number plaques start at OSM 18.
- **Junctions as iD** (`isConnected`): a node shared by several ways is a junction only when one of them is a line with
  tags. Corners that only buildings or other areas share are not drawn at any zoom.

## Consequences

- At OSM 16 and 17 a click on a way and then on its node is the way to an untagged node. Snapping while drawing or
  dragging still finds every node of a line under the pointer (`snap-aim.ts`), drawn or not.
- The browser checks that look for "a corner nobody else draws" now also need the corners well apart
  (`interactions-check.ts`), because untagged corners are no longer drawn and `alone` cannot see them.
