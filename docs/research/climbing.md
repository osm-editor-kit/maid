# Maid Climbing: plan and prototype

Date: 2026-11-12. Tobias asked for a Maid for climbing and bouldering: analyse OpenClimbing and the climbing presets of iD (id-tagging-schema PR 2793 and the PRs it links), turn on MapLibre's 3D view (as tordans/iD PR 3 explored with Mapterhorn), prefer elevation from the editor layer index (ELI, licence cleared) and, if Mapterhorn is used, say that its sources may not be compatible with OSM. Relation editing is key, because routes are grouped in relations.

The research behind this page (four agents, read from the code and the PRs, not from the live sites, which this session could not reach) is in [climbing-sources/](climbing-sources/): [presets-pr-2793.md](climbing-sources/presets-pr-2793.md), [openclimbing.md](climbing-sources/openclimbing.md), [terrain-sources.md](climbing-sources/terrain-sources.md), [mapterhorn-licences.md](climbing-sources/mapterhorn-licences.md), and the rules of the QA site BetaWatch in [betawatch.md](climbing-sources/betawatch.md).

## Summary

- **Prototype built:** `apps/maid-climbing` (port 5181) with two new modules: `module-climbing` (a section for crags, areas and routes, and the fields of PR 2793) and `module-terrain` (relief and 3D from Mapterhorn, with a licence notice). One small core change: a module may let the map tilt (`map.view`). A made-up scene `climbing` at the Kampenwand to test it without OSM data.
- **ELI cannot drive 3D.** It has no elevation source that gives heights: its 90 elevation rows are shaded-relief, slope and contour _images_. MapLibre's `hillshade` and `setTerrain` need a `raster-dem` (Terrarium or Mapbox RGB). So the 3D view uses Mapterhorn, with a notice; the ELI reliefs stay available as overlays in Background.
- **Mapterhorn's licences** (an agent's assessment, not checked; every source needs an explicit OSM permission before it may be used for mapping; full list in [packages/module-terrain/README.md](../../packages/module-terrain/README.md#licences-of-the-elevation-sources-my-assessment-not-a-clearance)): 153 sources. About half (74) look compatible with OSM (CC0, DL-DE Zero, Etalab 2.0, …), 78 are unclear (mostly CC BY 4.0 without a known OSM waiver), none is clearly incompatible. The global base, Copernicus GLO-30, is unclear, so a warning by source would fire almost everywhere. The prototype shows one general notice: for looking, not for mapping.
- **Relations:** Maid already has the relation column (members, drag reorder, add, roles, nested relations with a path of parents). Climbing adds what is specific on top: a crag's routes in rock order with grades, a route's crag, and adding a route to a crag nearby or a new crag.

## Data model (what the editor reads and writes)

From the schema (main and PR 2793), OpenClimbing's code and the wiki:

| Object      | Tags                                                                          | Geometry                                                                                |
| ----------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Area        | `type=site`, `site=climbing`, `climbing=area`                                 | relation; members: crags, role empty                                                    |
| Crag        | `type=site`, `site=climbing`, `climbing=crag` (or `climbing=crag` on a point) | relation; members: routes or route starts, role empty                                   |
| Route       | `climbing=route` on a line (foot to top), or `type=route` + `route=climbing`  | line or relation                                                                        |
| Route start | `climbing=route_bottom`                                                       | point or vertex; OpenClimbing puts the route's tags here and makes it the crag's member |
| Route top   | `climbing=route_top`                                                          | in OpenClimbing and the wiki, not in the schema                                         |

- The **order of the members is the order of the routes** on the rock, left to right; OpenClimbing numbers routes by it. Roles are not used.
- **Grades** are `climbing:grade:<system>` (uiaa, french, saxon, yds_class; PR 2793 adds hueco, ice, mixed, dry, aid). Maid shows the first present in a fixed order and converts nothing: OpenClimbing's conversion table matches by prefix and has duplicate rows (`'5'` matches French 4c), so conversion needs its own careful table.
- **Topos** (route lines drawn on photos) are `wikimedia_commons[:N]` with `wikimedia_commons[:N]:path` on the route start, points `x,y` as fractions 0..1 with a letter for bolts and anchors (`B`, `A`, `P`, `S`, `U`), separated by `|`. Maid must keep these tags intact; drawing them is a later step.
- **Styles** are `climbing:<style>=yes`: sport, trad, boulder, multipitch, ice, mixed, dry, aid.

## Presets: PR 2793

The PR (open, by elnappo, last update 2026-11-02, no maintainer answer since) adds styles (boulder, multipitch, ice, mixed, dry, aid), pitches and five grade systems, and reorders the crag and route-start fields. Maid Climbing applies it as preset changes (`packages/module-climbing/src/presets.ts`). The wiki and this PR are the reference, more than OpenClimbing (Tobias, 2026-11-12), so the style fields follow the PR head (`defaultCheck`; an existing `no` or number still shows). One departure: the hueco options use an ASCII minus, as the data has them.

Open review points worth following (details in [presets-pr-2793.md](climbing-sources/presets-pr-2793.md)): yes/no or a number of routes as the value of a style; `climbing:rock` versus `material`; help texts of aid and dry; the hueco label. Tobias reviewed parts of the PR already.

## What OpenClimbing teaches (and what not to copy)

Copy: the crag as a relation of route starts in rock order; batch adding of routes to a crag; refetching each changed feature and merging only changed tags before saving; the topo path format.

Do not copy: grade conversion by prefix; taking the first grade tag in tag order; reordering and deleting routes that are not saved (inferred from the code); a new route drawn on a photo that probably cannot be saved (a `TODO new routes` in the code). Maid's relation column already saves member order with undo.

## Terrain

| Source                                                                        | Gives heights?                      | Licence for OSM                                                               | Used                         |
| ----------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- | ---------------------------- |
| Mapterhorn (`tiles.mapterhorn.com`, Terrarium WebP, 512 px, z0–15)            | yes                                 | mixed: 74 of 153 sources look compatible, 78 unclear, the global base unclear | 3D and relief, with a notice |
| ELI elevation rows (swisstopo, South Tyrol, Brandenburg, CUZK, basemap.at, …) | no: shaded images, slopes, contours | per layer (ELI has no OSM-permission field)                                   | as overlays in Background    |
| Copernicus GLO-30 directly                                                    | yes, but no tile service            | unclear (custom licence, "all rights reserved" notice)                        | no                           |

The tordans/iD PR 3 exploration uses the same Mapterhorn tiles with a canvas hillshade and an elevation profile (bilinear sampling at z14, Terrarium decode `R*256 + G + B/256 - 32768`). Maid uses MapLibre's own `hillshade` layer and `setTerrain`.

**The notice** (panel "Terrain", always while terrain is on): "Elevation from Mapterhorn: for looking, not for mapping. Mapterhorn combines many elevation sources. Not all of their licences are known to be compatible with OpenStreetMap. Do not derive OSM data from these heights (tracing, contours, ele tags)." with a link to mapterhorn.com/attribution.

**A better notice later:** Mapterhorn publishes a coverage index (`download.mapterhorn.com/coverage-index.pmtiles`, one JSON tile per zoom-12 macrotile, keyed by source id). The panel could name the sources in view and say "compatible" or "unclear" per source, from a table in the module. That needs a person to confirm the classification first (open question 1).

**Tilt.** The map tilts up to 60° (MapLibre's default) only in this editor. An earlier study ([rotate-and-tilt.md](rotate-and-tilt.md)) measured that move, draw, pick and measure work at pitch 45, the rotate tool's angle is off under pitch, and the OSM tile cover grows 6.5 times at zoom 16 and pitch 60. The panel says to edit with the map flat on steep ground.

## The prototype

| Part             | Where                                                        | What it does                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App              | `apps/maid-climbing`                                         | Port 5181, German by default; modules: the shared set without surface and turn restrictions, plus `terrain()` and `climbing()`; filters lock buildings, land use, water, roads and rail                                                                                                                                                                |
| Climbing section | `packages/module-climbing`                                   | A crag: its routes 1..n with grade chip (colour by difficulty for UIAA and French), length, bolts; click selects, hover lights. An area: its crags with route counts. A route: "Route 3 of 4 at Südwand" and a button to the crag; or crags within 500 m with "Add", and "New crag with this route". A crag as a point: a hint to map it as a relation |
| Presets          | `module-climbing/src/presets.ts`                             | PR 2793's fields on crags, route starts, route lines and route relations                                                                                                                                                                                                                                                                               |
| Terrain          | `packages/module-terrain`                                    | Panel Off / Relief / 3D, heights ×1, ×1.5, ×2, tilt 0°–60°, the notice; URL `terrain=relief\|3d`; nothing requested under automation                                                                                                                                                                                                                   |
| Core             | `packages/renderer` (`map.view`), `packages/shell` (MapView) | A module may raise `maxPitch`; the tilt goes into `map=` as its fifth number                                                                                                                                                                                                                                                                           |
| Scene            | `tools/fixtures/climbing.ts`, `bun run fixtures-climbing`    | Made-up area with two crags (lines with UIAA grades; route starts with French grades and a multi-pitch route), a boulder point, a route in no crag, cliffs and a path                                                                                                                                                                                  |

Checked in a browser: the crag list, adding the lonely route to the Ostgipfel ("Route 6 of 6"), and 3D with a synthetic height tile served by the test (no request left the machine). Found and fixed: 3D set at start held back MapLibre's `load`, so the OSM data never loaded; terrain now waits for the map to load.

## Next steps (proposed, in order)

1. **Tobias tests the prototype** locally (commands below) and on real data with `?api=osm` around a crag he knows.
2. **A climbing lens**: routes coloured by difficulty band, crags and boulders as clear symbols, route starts as numbered pins (the member number), so a crag reads like a topo from above.
3. **Batch add routes to a crag** (OpenClimbing's best feature): a short form "name grade" per line creates route starts along the foot of the rock, in order, as members.
4. **Validation rules**: BetaWatch's tag rules (value formats of styles, grades per system, yes/no keys, pitches, Commons tags, `climbing=area` on a point, outdated keys; see [betawatch.md](climbing-sources/betawatch.md)), plus what needs the graph: a route in no crag; a crag point with routes nearby (suggest a relation); a crag with members that are not routes.
5. **Turn a crag point into a crag relation** (OpenClimbing's convert), keeping the point's tags on the relation.
6. **Per-source terrain notice** from Mapterhorn's coverage index, once the classification is confirmed.
7. **Elevation profile of a route or path** (as tordans/iD PR 3), and `ele` of a route start read from the terrain, shown but never written.
8. **Topos**: show the photos of a crag with the drawn routes; editing them is a larger step.
9. **Fixtures**: a real climbing scene cut by a person from an extract (core rule 1), e.g. Frankenjura or the Elbsandstein, with real relations.

## Open questions for Tobias

1. ~~**Mapterhorn for OSM:** may Maid offer Mapterhorn at all?~~ **Decided (Tobias, 2026-11-12):** yes, framed as now ("for looking, not for mapping"). The editor is in beta; more research or other sources can follow.
2. ~~**Which crag model to write?**~~ **Decided (Tobias, 2026-11-12):** the wiki and id-tagging-schema with PR 2793 are the reference, not OpenClimbing. Both forms stay readable. In the schema the route start (`climbing=route_bottom`) owns the route fields and the line (`climbing=route`) inherits them, and the crag takes either as a member, so a batch add writes route starts and a drawn line stays possible.
3. ~~**PR 2793:**~~ **Decided:** follow the PR head (`defaultCheck`), done.
4. **Deploy:** add Maid Climbing to GitHub Pages now (it is in `deploy.env`) or only after the test?
