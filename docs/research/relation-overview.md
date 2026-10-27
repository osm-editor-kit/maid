# Relation overview: a linear diagram of a route's members

Status: research and plan, 2026-10-27. No code was changed. Builds on [relation-handling.md](relation-handling.md) section 8 (Waymarked Trails' route analysis) and [route-relations-recommendations.md](route-relations-recommendations.md) (roles per route type). The plan for Tobias, in German: `relation-overview/plan.md` in the project files.

## The question

Can the relation column show a route the way Wikipedia's track diagrams (Streckenverlauf) show a railway: one vertical line with the line sections and the point members (stops, platforms, guideposts) in travel order, junctions beside the line, and a switch between equal spacing and spacing by length? Should the order come from the member list or from the geometry? Route types: hiking, bicycle and bus, all three (Tobias, 2026-10-27).

## Sources

- **OSM wiki**, read once with Tobias's OK for this purpose (core rule 1 exception, 2026-10-27): Relation:route (to about 100,000 of 117,283 characters), the proposal Recreational_route_relation_roles (Role:approach, Role:excursion and Role:alternative redirect there). Relation:route/hiking, /bicycle, /bus and Role:forward, Role:backward returned client errors and were not retried. Read through WebFetch summaries, not verbatim.
- **Waymarked Trails** on GitHub (GPL-3.0): `waymarkedtrails-website` `src/RouteAnalyzeView.svelte`, `src/map/styles.js`, `src/i18n/de/messages.yaml`, `src/i18n/de/helppages.yaml` (`route_order`); `waymarkedtrails-backend` `wmt_db/geometry/route_builder.py`, `route_types.py`, `member_loader.py`. Nothing was requested from waymarkedtrails.org.
- **iD** (`openstreetmap/iD` develop, `id-tagging-schema` main) on GitHub.
- **German Wikipedia**: Vorlage:Routemap; Tobias's screenshot of the sidebar of Bahnstrecke Hürth-Kalscheuren–Ehrang. Modul:Flusssymbole/Doku, Vorlage:Infobox Verkehrsbetrieb and Vorlage:Buslinie could not be fetched.
- **Maid**: `packages/shell/src/modules/relations-*.ts(x)`, `packages/renderer/src/tile-loader.ts`, `packages/model/src/data/OsmRelation.ts`.

## Roles that the overview must place

New compared with route-relations-recommendations.md [read, wiki summaries]:

| Role                                                                    | Member               | Meaning                                                                      | Where          |
| ----------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------- | -------------- |
| `guidepost`                                                             | node                 | a guidepost that refers to the route                                         | Relation:route |
| `milestone`                                                             | node                 | a signed km, mile or stage marker                                            | Relation:route |
| `information`                                                           | node, area, relation | an information board about this route only                                   | Relation:route |
| `station`                                                               | node, area           | a trail station (fitness, educational, stations of the cross)                | Relation:route |
| `start`, `stop`, `start_stop`                                           | node                 | start and end of a fitness trail                                             | Relation:route |
| `hail_and_ride`, `reverse`                                              | way                  | public transport sections; `reverse` is not PTv2                             | Relation:route |
| `main` (or empty), `alternative`, `excursion`, `approach`, `connection` | way, relation        | sections of a waymarked recreational route; vote closed 2020-06-17, approved | the proposal   |

- The proposal says roles for node members are not defined there. The node roles above come from Relation:route only.
- The proposal: `alternative` branches off and rejoins the main route; `excursion` is a side track that rejoins (route-relations-recommendations.md: returns to the same point); `approach` leads to or from transport; `connection` links two routes.
- Not found on the pages read: shelters as a role (a bus shelter is a property of the platform, not a member), waymarks as a role (`route_marker` is in route-relations-recommendations.md for hiking).
- iD's route presets define no member roles; iD suggests roles from taginfo at runtime. Maid cannot copy that (core rule 1), so the role list is ours: the table above plus the existing `ROLES_BY_TYPE` in `relations-logic.ts`.

## What Waymarked Trails' "Analyse relation" view shows

Adds detail to relation-handling.md section 8 [read in code; the weights are arithmetic from the code, not run]:

- The view draws the precomputed route tree from the API; nothing is computed in the browser except the dots (`RouteAnalyzeView.svelte`, `traverse_segments`).
- The view walks only the main route (`route.main`). Appendices (every non-empty role other than forward and backward) are not drawn there. Node members are not used at all.
- Dots: each point gets a weight (0.6 per inner way coordinate, -0.2 at a segment start, +0.4 at a segment end). Red below 0.5 is an open end; grey 0.7 to 0.9 is an interruption ("not sorted" in the legend); cyan above 0.9 is "more than two sections meet". Dots appear only at the ends of gaps. Points match by exact coordinates, no tolerance.
- So WMT's "junction" is a gap end on a way of the route, not a junction with the street network. The help text (`route_order`): member order is kept where possible; an unsorted relation is reordered only if the result is one line without gaps; forward and backward are respected; other roles are ignored for sorting.
- Licence: GPL-3.0. Maid writes its own code from the behaviour (relation-handling.md section 8, decision c).

## What Maid has

- One `/relation/{id}/full.json` call brings every member way with its nodes, so the geometry is available; a member that was not loaded is id, type and role only (`relations-logic.ts` 308-320), loaded on demand (`memberLoadPath`).
- The column has two groups for `type=route`: "Stops" (nodes, or a stop/platform role) and "Ways", each in data order. No chain order, no position of a stop on a way.
- `routeJoins` and `routeGaps` compare neighbours in data order; `travelOf` gets the direction from the shared node.
- The chain check of relation-handling.md section 8 (pieces, linear state yes/sorted/no, order against gap) is planned, not built. The overview needs the same chain and should share it.

## Order from the member list or from the geometry

|                                 | Member list only     | Geometry (ways with nodes)                    |
| ------------------------------- | -------------------- | --------------------------------------------- |
| Extra data                      | none                 | the `/full` call Maid already has             |
| Order of the ways               | as mapped, unchecked | chained; the list order is checked against it |
| Where a stop or guidepost lies  | unknown              | nearest point on the chain, with a distance   |
| Lengths, km column, scaled view | no                   | yes                                           |
| Junctions with other streets    | no                   | yes, for the loaded network                   |
| Behaviour on a wrong order      | wrong diagram        | a "sorted" state and an order warning         |

Recommendation: the geometry is the basis and the member list is the tie-breaker and the reference, as WMT does it: chain the ways starting from the list order, keep the list order where it chains, reorder only into one gapless line, and say so. Points are placed by projection onto the chain. The list order of the points (PTv2: stops in timetable order) becomes a check: a stop whose projected position is out of sequence is reported.

## The diagram

- **Rows.** One vertical line; each row is a point member, a junction or a gap. Line sections sit between the rows with their length. A km column on the left, as in the Wikipedia sidebar.
- **Point kinds.** Stop and platform (bus), guidepost, milestone, information, other node members; the symbol by role and preset. A point more than a threshold (to measure, about 30 m) away from the chain is listed beside the line with its distance.
- **Spacing switch.** Schematic (equal rows, the default) or scaled (section height proportional to length, with a minimum height). The scaled view shows long stretches without a guidepost.
- **Branches like a git graph.** `alternative`, `excursion`, `approach` and `connection` sections are lanes beside the main line, leaving and rejoining at their junction rows. Without roles, a way that touches the main chain at two points is drawn the same way and marked "no role".
- **Junctions.** A node of the chain shared with a way that is not a member (in the loaded data) is a junction row. A junction without a guidepost within a threshold (to measure, about 50 m) is marked "guidepost missing?" for hiking and bicycle routes. Only as complete as the loaded tiles; the panel says so.
- **Gaps and states.** WMT's states yes, sorted, no; gaps as a broken line with both ends named.
- **Interaction.** A row selects the member (as the column does today) and flies to it; later reordering from the diagram.

## Steps

About an hour each, each with a test for Tobias. Steps 1 and 2 are the headless chain check of relation-handling.md section 8; the rest is new.

1. Chain from geometry: pieces, linear state, order against gap, on synthetic graphs (unit tests).
2. Count the route relations per type in the `relations` fixture (a read-only script) and choose a hiking, a bicycle and a bus test route; if one type is missing, name it for Tobias (a fixture is cut by a person).
3. Project point members onto the chain: position, distance, out-of-sequence stops (unit tests).
4. The diagram in the relation column, schematic, read only; `check-relation-column` extended.
5. The spacing switch and the km column.
6. Branch lanes from roles and from topology.
7. Junctions with the loaded network and the "guidepost missing?" hint.
8. Interaction: select, fly to, later reorder.

## Open

- Thresholds for "on the way" and "guidepost missing" are guesses until measured on the fixture.
- Whether the fixtures contain a hiking route with guideposts as members is not measured.
- Relation:route/hiking, /bicycle, /bus were not read this time (client errors); route-relations-recommendations.md covers them from 2026-10-17.
- Whether the diagram replaces the "Stops" and "Ways" groups or sits above them: a design question for Tobias after step 4.

## Built so far (2026-10-27)

Package `packages/route-analysis` (plain data in and out, no model classes): `analyzeRoute(input)` classifies every member (a fallback kind `other` with a hint for roles it does not know), chains the main ways from the geometry (relation order where it joins, one gapless reordering otherwise, `forward`/`backward` strands beside the line), places points, stops and platforms on the line, builds side lines, finds junctions with the loaded network and lists the issues with a place on the line. `layoutOverview(analysis, 'schematic' | 'scaled')` gives the rows, sections and lanes of the diagram; every member is in some row or section, every issue on exactly one row. The shell adapter `routeInputOf(graph, relation)` (`packages/shell/src/modules/route-overview/route-input.ts`) reads the staging graph, so unsaved edits count.

Tests: 106 in the package, among them a fuzz test: 180 generated routes (hiking, bicycle, bus) with one to four random mutations each (removed ways, shuffled blocks, reversed ways, duplicates, unloaded members, unknown roles, a far guidepost, swapped stops, no guideposts, a detached branch, a sub-route, an area member). Each mutation names the issues it must cause; order and stop sequence are judged only on a line without gaps (with a gap, the gap must be reported). Generated routes need no download (core rule 1).

### Performance

`bun run bench-route-analysis` writes `reports/route-analysis-bench.json` (median of 5, this container):

| Ways | Analysis, ms | Layout (both modes), ms |
| --- | --- | --- |
| 100 | 0.6 to 1 | 0.2 to 0.5 |
| 1,000 | 7 to 12 | 3 to 4 |
| 5,000 | 49 to 81 | 19 to 21 |
| 20,000 | 274 to 351 | 78 to 92 |

The 274 route relations of the fixtures take at most 1.3 ms each, because the fixtures hold only the members inside their box (EuroVelo 2: 51 of 1,567). Real large routes: see the decision on a full fixture in the thread. At 20,000 ways the time goes to the line index (about 125 ms, 150,000 segments), the chain (about 50 ms) and the junctions (about 60 ms); a first fix (a 100 m search before the 2 km one) cut placing 10,000 guideposts from about 190 to 40 ms.

### Worker or WebAssembly

Decision: neither yet. A single route relation rarely has more than about 2,000 ways (long trails are superroutes of stages), which takes about 15 ms here, within a frame. The analysis runs once per change of the relation's data, memoised, not per frame. A worker would have to receive the node positions by structured clone (a copy of every coordinate), which for 20,000 ways costs a good part of what it saves; WebAssembly would add that copy too, and the time is in map lookups and haversine, not in arithmetic that WebAssembly speeds up much. Because input and output are plain data, a worker can be added without changing the analysis: the trigger is a measured analysis over 50 ms on a real relation. Next cheap gains, if needed: compute segment lengths once (the chain and the index both compute them), and integer node ids instead of strings.
