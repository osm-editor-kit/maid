# Benchmark scenarios: what they cover, what they miss, and where Maid should cap

Date: 2026-10-13. Status: inventory and proposal. Nothing here has been fixed in the code; no
fixture has been cut and no benchmark has been run for this document. Figures come from the
committed fixtures (`fixtures/*.meta.json`, `fixtures/*.json.gz`), read locally. Editor limits come
from the pinned checkouts in `.reference/` (read-only), cited by file and line.

## 1. The three scenes

| | small | medium | dense |
|---|---|---|---|
| Place | Residential streets, Lichtenrade | Inner city around Hackescher Markt, Mitte | Neukölln, detailed street-space and parking mapping |
| bbox (W, S, E, N) | 13.393, 52.385, 13.407, 52.393 | 13.390, 52.516, 13.415, 52.530 | 13.418, 52.476, 13.448, 52.493 |
| Area | 0.9 km² | 2.8 km² | 4.1 km² |
| Elements (nodes / ways / relations) | 12,196 / 1,914 / 67 | 61,510 / 8,879 / 550 | 119,678 / 20,896 / 289 |
| Fixture size | 2.6 MB JSON, 346 KB gzip | 15.2 MB JSON, 2.3 MB gzip | 19.1 MB JSON, 2.9 MB gzip |
| z16 tiles covering the bbox | 12 | 36 | 49 |
| Tagged nodes per km² | about 1,700 | about 5,500 | about 6,800 |
| Buildings | 1,148 | 1,758 | 3,531 |
| Ways with parking tags | 145 | 1,114 | 1,949 |
| Largest relation (members in the fixture / in the relation) | 3 / 3,388 (train route) | 24 / 3,142 (train route) | 24 / 1,552 (bicycle route) |
| Load zoom / start zoom | 16 / 18 | 16 / 17 | 16 / 17 |

Element counts are those of the meta files (the whole bbox). What a run holds after loading is
smaller: `reports/2026-10-13-13-10-settled-fixed/results.json` shows about 10,600 nodes in memory
for `small` at load, because only the tiles in view are loaded.

### Which editing each one stands for

- **small**: a street-by-street survey in a quiet area. Mostly footways, service roads and
  residential streets, few features per screen. The common case for a single fix.
- **medium**: the inner city. Dense footways and pedestrian areas, tram and bus routes, and many
  tagged points. Typical of a mapper working on a block at a time.
- **dense**: the parking mapping that the parking app (`apps/maid-parking`) exists for. It has the
  most tagged features per km², the most parking tags and the most buildings of the three. It is the
  realistic worst case for editing; how many features its screens hold was not counted.

## 2. What the scenes do not cover

Each item below was checked against the fixtures unless it says "not checked".

1. **A very large multipolygon** (a forest or a lake with thousands of members). No scene has one.
   The largest multipolygon has 3 members in `small`, 33 in `medium` and 16 in `dense` (Hermannplatz).
   The five largest relations by member count are routes, plus one TMC location relation in
   `small`, one boundary in `medium` and one street relation in `dense`.
2. **A long route relation with its members loaded.** The biggest relations have 1,500 to 3,400
   members, but only 3, 24 and 24 of them are in the fixtures (`small`, `medium`, `dense`), because
   the members outside the bbox were not cut. So the relation is loaded as a stub. The Members
   section and the loading of relation members have never been measured at a realistic size.
3. **A motorway junction.** No way with `highway=motorway`, `motorway_link`, `trunk` or
   `trunk_link` in any scene.
4. **A dense city centre at the load zoom with all buildings.** `medium` is the nearest, with 1,758
   buildings in 2.8 km². The centre of Mitte (Alexanderplatz) was not checked and is likely denser.
5. **A rural area with few features and a huge extent.** The biggest scene covers 4 km² and 49
   tiles. Nothing asks the editors for hundreds of tiles, so the cost of many tile requests and of
   panning into new tiles across a large area is not measured.
6. **Zooming far out with data loaded.** The zoom phase goes two levels in and back to the start
   zoom. What each editor draws when the view is zoomed out below 16 with data already loaded was
   not measured. Loading stops below 16 in Maid and iD (see section 4), but Rapid loads from 15.

## 3. Further fixtures (for a person to cut)

Three proposals, each chosen for one of the uncovered situations. The bboxes are **estimates
from memory**: no map viewer was used and this machine has no network. Check each bbox in a map
viewer before cutting it, and check the extract's date.

| Scene | Situation | bbox (W, S, E, N) | Area | z16 tiles | Note |
|---|---|---|---|---|---|
| `grunewald` | A very large multipolygon: a forest with thousands of members | 13.2000, 52.4560, 13.2600, 52.4900 | about 15 km² | 144 | Mostly forest; few other features, so the size is set by the outline |
| `motorway-funkturm` | A motorway junction with its links and the roads under it | 13.2650, 52.4960, 13.2900, 52.5130 | about 3 km² | 42 | Around the A100 near the Funkturm. Small, so it is dense in motorway ways |
| `brandenburg-rural` | A rural area with few features and a huge extent | 13.6000, 52.9500, 13.8000, 53.0500 | about 148 km² | 1,178 | Tests many tile requests and panning into new tiles |

A long route relation with its members loaded is not in the list: it needs a bbox that covers the
whole route, which is large. Add it when the first three are measured.

### The commands a person runs

The fixture builder (`tools/fixtures/build.ts`) cuts every scene in `SCENES`
(`tools/fixtures/scenes.ts`) from one local extract. So the three new scenes are added to `SCENES`
first, and the build then rewrites all scenes. Nothing here is run by an agent (core rule 1).

1. Add the three entries to `SCENES` in `tools/fixtures/scenes.ts`:

   ```ts
   {
     name: 'grunewald',
     description: 'Grunewald forest, south-west Berlin: a large multipolygon',
     bbox: [13.2, 52.456, 13.26, 52.49],
     center: [13.23, 52.473],
     zoom: 16,
   },
   {
     name: 'motorway-funkturm',
     description: 'A100 junction near the Funkturm',
     bbox: [13.265, 52.496, 13.29, 52.513],
     center: [13.2775, 52.5045],
     zoom: 17,
   },
   {
     name: 'brandenburg-rural',
     description: 'Uckermark countryside, few features over a large extent',
     bbox: [13.6, 52.95, 13.8, 53.05],
     center: [13.7, 53.0],
     zoom: 16,
   },
   ```

2. Download the extract yourself, to a folder of your choice. Check that it is the one you intend:

   ```sh
   # by hand, outside this repository's scripts; the extract is not committed
   curl -L -o ~/extracts/berlin-latest.osm.pbf https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf
   ```

3. Cut the fixtures. Needs `osmium` on the PATH:

   ```sh
   bun run fixtures-build ~/extracts/berlin-latest.osm.pbf
   ```

4. Check that only the new files changed, and that the three existing scenes did not:

   ```sh
   git status --short fixtures/
   ```

   The existing scenes are rewritten by the same command. With the same extract and osmium they
   come out byte for byte, which their `sha256` in the meta files confirms. If they change, stop:
   that is a fixture change, and it needs its own reviewed commit. A `--only <name>` option in
   `tools/fixtures/build.ts` would avoid this; it is a follow-up outside this task.

5. Measure, once the fixtures are reviewed (the orchestrator runs this on a quiet machine):

   ```sh
   bun run bench --scene grunewald,motorway-funkturm,brandenburg-rural --repeat 3
   bun run bench-report <run-id>
   ```

## 4. Where Maid should cap instead of trying to be fast

The aim is that nobody ends up in a state in which no one can work: a map that holds so much data
that every edit takes seconds, or a tab that runs out of memory. Speed alone does not prevent it.
The three editors' current limits, all with the lines checked:

- **iD.** Loads and edits only from zoom 16: `minEditableZoom` is 16 (`.reference/id/modules/core/context.ts:390`),
  and data is loaded only when editable (`context.ts:300-306`, `renderer/map.js:1046-1048`). Requests
  are z16 tiles (`services/osm.js:45`, `:853`). Above a count, iD hides features rather than refusing
  to load: points are capped at 200, address points at 100 and buildings at 250, each scaled by the
  viewport area (`renderer/features.js:81-97`, `:353-354`), and hidden ones are listed as
  auto-hidden. iD keeps every loaded tile: no eviction and no cap on the number of entities were
  found in `services/osm.js`.
- **Rapid.** Loads from zoom 15 (`.reference/rapid/modules/Context.ts:23`, `:478-481`, with the
  comment "this would fire off too many API requests"). Draws OSM data from zoom 12
  (`modules/pixi/PixiLayerOsm.ts:19`, `:204`). Requests z16 tiles covering the view
  (`modules/services/OsmService.ts:283`, `:1563-1580`) and cancels those that leave the view. No
  eviction and no entity cap were found.
- **Maid.** Loads from `minDataZoom`, which defaults to 16 (`packages/shell/src/url/params.ts:92`).
  Asks for every z16 tile in view, with no count (`packages/renderer/src/engine.ts:413-436`). Tiles
  are forgotten only after an upload reload (`packages/renderer/src/engine.ts:763-778`) and when the
  engine is destroyed (`engine.ts:2132-2139`, `tile-loading.ts:216`). No entity cap.

So Maid's zoom gate already matches iD's, and Maid has no cap at all, like the other two. The
proposals, in the order I would take them (the numbers are proposals to decide, not measurements):

1. **Keep the zoom gate at 16.** This is iD's, and it is what Maid has now. Rapid's 15 is the
   exception, and it is the one that fires off the most requests.
2. **An entity cap with a notice.** Stop asking for new tiles once the editor holds about 250,000
   entities, which is about twice the densest fixture (`dense`, 140,863 elements). Show a notice
   (`packages/shell/src/components/MapNotices.tsx` already shows one for the zoom) that says why
   nothing more loads and what to do (zoom in, or start a new session). Loaded data stays, and
   edits are never refused. This is the cap that protects the person's session.
3. **A tile budget with eviction, for the cases in section 2.** Keep at most about 200 z16 tiles
   (about four times `dense`), and forget the tiles farthest from the view. Never forget a tile
   holding an entity the history touches (an edit refers to it). iD and Rapid do not do this, so
   it would be a Maid-only behaviour. It needs a decision before it is built.
4. **A member cap on relations.** Load at most about 500 members of a relation when the person
   opens it, and say so in the Members section. Not checked: how iD and Rapid load the members of a
   relation of this size. Check before proposing this as a difference between editors.

Each cap has to be measurable: the `brandenburg-rural` scene should reach the tile budget, and the
`dense` scene should stay under the entity cap, so that a benchmark run shows where each one
applies.

## 5. What is not verified

- No benchmark was run for these scenes or for the new edit phases; the three proposed fixtures
  do not exist.
- The bboxes in section 3 are estimates, not checked against a map or an extract.
- The entity and tile numbers in section 4 are proposals based on the fixture sizes above, not
  measurements of memory or frame time.
- Whether Maid draws loaded data below zoom 16 was not checked.
