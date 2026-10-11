# iD

Source: a fork of `openstreetmap/iD` at `a427055f7` (`2.43.0-dev`). Paths are relative to that checkout. License: ISC.

## Rendering

iD draws SVG with D3.

- DOM: `.main-map` > `.supersurface` > `svg.surface` with one `g.data-layer` per layer (`modules/svg/layers.ts:66-93`). Inside `.layer-osm` (`modules/svg/osm.js:6-17`): covered, areas, lines, points (vertices, midpoints, points, turns), labels. Hit targets live in a separate `.layer-touch`.
- Areas (`modules/svg/areas.js`): fill, shadow and stroke paths, a `clipPath` per area, optional fill pattern.
- Lines (`modules/svg/lines.js`): 21 layer groups for `layer=-10..10`, each with shadow, casing and stroke. Oneway and sided markers use SVG `marker-mid`.
- Points (`modules/svg/points.js`): pin shape, shadow, and a preset icon from a sprite.
- Vertices (`modules/svg/vertices.js`): three circles (shadow, stroke, fill). Radius depends on zoom band (<17, 17, >=18). Only "important" vertices are drawn outside selection: tagged, endpoints, or shared between ways.
- Midpoints (`modules/svg/midpoints.ts`): only in select mode.
- Labels (`modules/svg/labels.js`): a priority list by feature type, collision detection with RBush, labels near the pointer are hidden.

### What happens on pan and zoom

This shapes how we have to measure iD.

- During a gesture iD only applies a CSS transform to `.supersurface` (`modules/renderer/map.js:626`). That is cheap, and the picture is stale: new areas are empty and strokes are scaled.
- The real redraw is throttled to once per 750 ms: `scheduleRedraw = throttle(redraw, 750)` (`map.js:85`). Unverified: whether the throttle fires a trailing call.
- A full redraw (`map.js:650-698`) resets the transform, runs every layer, calls `context.loadTiles`, and draws everything that intersects the viewport. It ends by emitting `drawn` with `{full: true}` (`map.js:401`).
- Edits redraw immediately, and only the changed entities (`map.js:354-359`).

So frame rate during a pan says little about iD. The honest numbers are the duration of a full redraw and the time from the end of a gesture to a correct picture.

### Limits iD sets for itself

- `minEditableZoom` is 16 (`modules/core/context.ts:389`, verified). Below that iD clears the data layer and loads nothing.
- Feature caps before auto-hiding (`modules/renderer/features.js`): 100 address points, 200 points, 250 buildings, scaled by viewport size (`features.js:354`).

These caps are part of how iD stays usable. The benchmark must record whether auto-hiding kicked in (`context.features().stats()`, `hidden()`, `autoHidden()`), otherwise iD looks fast because it drew less.

## Styling

- Tag classes: `modules/svg/tag_classes.ts` puts classes such as `tag-highway`, `tag-highway-residential`, `tag-status-*`, `tag-paved` or `tag-unpaved` on each element.
- CSS: 10 files in `css/`, about 10k lines.
  - `20_map.css`: points, vertices, base path styles, labels, hit targets
  - `25_areas.css`: area strokes and fills (landuse, natural, water at 0.3 alpha)
  - `30_highways.css`: road classes. Widths: casing 10, stroke 8, shadow 20; at low zoom 7, 5, 16
  - `45_waterways.css`, `50_misc.css` (buildings and more)
  - `70_fills.css`: the three fill modes
- Fill modes: `partial` is the default (`map.js:1098`, `70_fills.css:38`, verified). It shows the fill only as a band along the inside edge of an area. `full` fills the area, `wireframe` hides fills, casings and points.

The core subset for iteration 1 follows from this: road casing and stroke by class and zoom band, paths, area stroke and partial fill, buildings, points with pin and icon, vertices, labels with collision, oneway arrows, and hover and selection halos (iD's "shadow" paths).

## Data loading

- Path: redraw > `context.loadTiles` > `services.osm.loadTiles` (`modules/services/osm.js:849`) > one request per z16 tile to `/api/0.6/map.json?bbox=` > `parseJSON` > `history.merge`.
- iD has no importer for `.osm` XML files and no `data=` URL parameter. The custom data layer takes GPX, KML and GeoJSON only, and those are not editable OSM entities.
- API host: set at build time (`config/id.js:27-35`, env `ID_API_CONNECTION_URL` and `ID_API_CONNECTION_API_URL`) or at runtime with `context.connection().switch({url, apiUrl, client_id})` (`osm.js:1110`). `switch` resets the connection and requests the user's changesets right away.
- A mock API needs to answer:
  - `/api/capabilities.json`
  - `/api/0.6/map.json?bbox=` (JSON with `elements`)
  - `/api/0.6/node/ID.json`, `/api/0.6/way/ID/full.json`, `/api/0.6/relation/ID/full.json`
  - with CORS headers (unverified, but likely since the origin differs)
- Alternative without any API: the walkthrough turns the connection off and merges entities directly (`modules/ui/intro/intro.js:84-92`): `context.connection().toggle(false).reset()`, then `history.merge(...)`.

## Driving iD from Playwright

- Globals: `window.iD`. `window.context` is only set by the root `index.html` (line 52), not by `dist/index.html`. Serve the repo root, or add the global in our own host page.
- Ready: `context.ui().ensureLoaded()`.
- Events: map `drawn`, `move`; connection `loading`, `loaded`; history `merge`, `change`.
- Camera: `#map=zoom/lat/lng`, or `context.map().centerZoom([lng, lat], z)`. Then wait for `drawn`.
- Select: `context.enter(iD.modeSelect(context, ['w123']))` or `#id=w123`.
- Hover: no API. Move the real pointer over `.way.target.w123` or `.node.target.n1`.
- DOM ids for counting and checking: `g.node.point.n1`, `path.way.line.w123`, `path.way.area.fill.w123`, `g.node.vertex.n1`.
- Debug: `context.setDebug('tile' | 'collision' | 'target' | 'downloaded', true)`. There are no built-in render timers.

## Build and serve

- `npm ci`, then `npm run build` (CSS, data, JS). The data step downloads presets from jsDelivr and icons from GitHub. No OSM infrastructure, but it needs network once.
- `npm start` serves the repo root on port 8080.
- Unverified: a plain static server at the repo root works for the built files.
- `dist/` in the checkout is older than its `HEAD`. Always build from the pinned commit.
