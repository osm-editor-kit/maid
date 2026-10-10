# iD reference: notes

iD `v2.42.2` (`0194f3926a59d8db8993892880f2a25d366c7099`, see `pin.json`), built in `.reference/id`, served on `PORTS.id` (8081) with our own host page, reading from the mock OSM API. All line references are to that commit. Everything below was run on 2026-10-10 with system Chrome through Playwright, viewport 1600x1000, device scale factor 1.

## Commands

```sh
bun tools/refs/id/setup.ts            # clone + build, skips when built at the pin (--force rebuilds)
bun tools/refs/id/serve.ts            # http://localhost:8081/?scene=small|medium|dense
bun tools/refs/id/smoke.ts            # scene small, zoom 17 -> smoke.png, smoke-selected.png, smoke.json
bun tools/refs/id/smoke.ts --scene dense   # -> smoke-dense.*   (also: --zoom 18, --build dev, --headed)
bun tools/refs/id/smoke.ts --cull 0         # with ?cull=0 -> smoke-cull0.*
bun tools/refs/id/smoke.ts --scene medium --validation 1   # validator on, expects issues -> smoke-medium-validation.*
```

`smoke.ts` needs the mock API on 8090 and starts the static server itself when 8081 is not answering. The root scripts `refs-setup` and `refs-serve` from `AGENTS.md` are not wired to these files yet.

Host page parameters: `?scene=` (default `small`), `?cull=0` (see "Auto-hiding"), `?validation=1` (see "Validation and background work"), `?build=dev` loads the unminified `dist/iD.js` instead of `dist/iD.min.js`, and iD's own hash, for example `#map=17/52.389/13.4`. Without `map=` the page starts at the scene's `center` and `zoom` from `tools/fixtures/scenes.ts`.

## What is where

| File | Role |
| --- | --- |
| `pin.json` | repo, tag, commit |
| `setup.ts` | clone at the tag, `npm ci`, `build:css`, `build:data`, then `build:js` and `dist` with `BUILD_ENV` |
| `serve.ts` | Bun static server: `/` host page, `/adapter.js`, `/frame-sync.js` (the shared `tools/refs/frame-sync.js`, unchanged), `/bench-config.js` (ports and scenes), `/dist/**`, `/cdn/<package>/**` from iD's `node_modules`, `/blackhole/**` answers 404 and is logged at `/requests` |
| `index.html` | host page, modelled on iD's `index.html` |
| `adapter.js` | `window.__bench` |
| `smoke.ts` | end-to-end check, exits non-zero on failure |

## Research notes checked (`docs/research/id.md`)

| Claim | Result |
| --- | --- |
| `scheduleRedraw = throttle(redraw, 750)`; unverified whether there is a trailing call | Verified, and it is more than a plain trailing call. `throttle` is es-toolkit's (`node_modules/es-toolkit/dist/function/throttle.mjs`, built on its `debounce`), edges leading and trailing. The first call runs `redraw` synchronously. A call inside the window is queued and **restarts the 750 ms timer**, so the trailing redraw runs 750 ms after the *last* call. If 750 ms have passed since the last actual run, a call runs synchronously instead. Measured on scene dense: merges at 819 to 1060 ms, first redraw at 819 ms (leading, in the first merge), the redraw with all data finished at 2500 ms. |
| A full redraw ends with `drawn {full: true}` | True (`map.js:391`), but the same event is also emitted for edits that only redraw a difference and by `editOff()` below zoom 16 (`map.js:422`). `{full: false}` comes from vertex hover and the quick selection redraw. |
| Data path: redraw > `context.loadTiles` > one request per z16 tile > merge | True. `context.loadTiles` defers to `requestIdleCallback` (`core/context.ts:300`). At zoom 17 and the 1600x1000 map this is 8 tiles for small and 12 for medium and dense. Every tile response is one `history.merge` and one `scheduleRedraw()`. |
| `connection().switch()` requests the user's changesets right away | It calls `userChangesets`, which goes through `oauth.xhr`. Not signed in and with osm-auth's `auto: false` this makes **no request**. Verified: the only requests to the mock API are 1x `/api/capabilities.json` and the `/api/0.6/map.json` tiles. |
| A mock API needs `capabilities.json`, `map.json`, entity calls, CORS | For loading and drawing only `capabilities.json` and `map.json` were requested. CORS is needed (8081 to 8090), `Access-Control-Allow-Origin: *` is enough: iD uses plain `fetch` GETs, the mock API saw no `OPTIONS` preflight. The mock API was not changed. |
| "Unverified: a plain static server at the repo root works" | Verified in a narrower form: serving `dist/` under `/dist/` plus our own host page with `assetPath('dist/')` is enough. Nothing outside `dist/` is needed at runtime, except the files iD would take from jsDelivr (see below). |
| `window.context` only exists with the root `index.html` | True. Our host page sets `window.context` and `window.id` the same way. |
| `minEditableZoom` 16, fill mode `partial` by default | True, left untouched. |
| Feature caps 100 address points, 200 points, 250 buildings, scaled by viewport | True, and they matter a lot here, see "Auto-hiding". |
| Camera: `map.centerZoom`, then wait for `drawn` | Works, with a detail that is easy to get wrong: see "Programmatic camera moves". |
| Hover has no API, move the real pointer over `.target` | True. `hovered()` reads the `.hover` class. |
| `dist/` in a checkout is older than `HEAD` | The tag has a committed `dist/` too. `setup.ts` always rebuilds. |

## Keeping iD off the network

No request left localhost in any run (Playwright blocks and logs every non-localhost request, `smoke.ts` fails on one). This is what iD would do otherwise and how each call is switched off. The "tries" column was measured by removing one measure at a time, with the Playwright block still in place.

| What iD tries | Host | Switched off by |
| --- | --- | --- |
| OSM API: capabilities, map tiles | `api.openstreetmap.org`, `www.openstreetmap.org` | Build env `ID_API_CONNECTION_URL` / `_API_URL` make the mock API the bundle default (`config/id.js`). The host page then calls `context.connection().apiConnections([c])` and `context.preauth(c)` (= `osm.switch`) with `http://localhost:8090/s/<scene>` **before** `context.init()`. The first request already goes to the right scene. |
| Taginfo, popular keys on init and values when a field opens | `taginfo.openstreetmap.org` | Build env `ID_TAGINFO_API_URL` points at `/blackhole/taginfo/`, and `iD.services.taginfo` is deleted before init. |
| Nominatim (search, country code on save) | `nominatim.openstreetmap.org` | Build env `ID_NOMINATIM_API_URL` points at `/blackhole/nominatim/`, and `iD.services.geocoder` is deleted. |
| Presets, fields, preset translations | `cdn.jsdelivr.net` | Build env `ID_PRESETS_CDN_URL` points at `/cdn/id-tagging-schema/`, served from iD's own `node_modules` (the version in `package-lock.json`). Presets must load: they decide which closed ways are areas. |
| Community index (only on the upload success screen) | `cdn.jsdelivr.net` | Build env `ID_OCI_CDN_URL`, served locally. |
| Name suggestion index, several MB on init | `cdn.jsdelivr.net` | `iD.services.nsi` is deleted. Build env `ID_NSI_CDN_URL` as a second line. |
| Wikipedia language list, when a selected feature shows the wikipedia field | `cdn.jsdelivr.net` | `iD.fileFetcher.cache().wmf_sitematrix = []`. |
| Imagery: Bing metadata, the "best" imagery for Berlin, the locator overlay | `dev.virtualearth.net`, `tiles.codefor.de` (60 tiles), `osmlab.github.io` | `#background=none` plus `iD.fileFetcher.cache().imagery = []` before init, so iD has no imagery sources except its built-in "none" and "custom". With `background=none` alone iD still turns on the default locator overlay (`renderer/background.js:488`). |
| Wikidata lookup for a selected feature with a `wikidata` tag | `www.wikidata.org` | The services `wikidata`, `wikipedia` and `osmWikibase` (`wiki.openstreetmap.org`, tag documentation) stay, because `ui/fields/wikidata.js:189` uses them unguarded and throws without them. Their fetching methods are replaced by a stub that calls back with an "offline" error. |
| Street-level photo services | `graph.facebook.com` seen (Mapillary); Kartaview, Mapilio, Panoramax, Vegbilder, Streetside not triggered | Services deleted. Their layers are off by default anyway. |
| Osmose QA, vector tiles, maprules | not triggered by default | Services deleted. |
| Notes layer | OSM API `/notes` | Off by default, left alone. No notes request was seen. |
| User details, changesets | OSM API | Never requested without a sign-in. The client id in the bundle is the dummy `maid-bench-no-auth`; no id or secret from iD is used. |
| Splash screen, walkthrough | none | `localStorage.clear()` on every load, then `sawSplash` and `sawPrivacyVersion` are set. `walkthrough` is removed from the hash. Without this the splash modal covers the map. |

Rendering is left at iD's defaults: fill `partial`, feature filters default, boundaries disabled as in iD's own `index.html`, minified production bundle. `context.locale('en')` pins the UI language. Two deliberate differences from a stock iD are described below: the collapsed sidebar and the opt-in `?cull=0`.

Strings such as `api.openstreetmap.org` are still present in the bundle as unused defaults (`config/id.js`, osm-auth). `setup.ts` checks that the configured endpoints were replaced.

## `settled()`: the exact definition

`settled()` resolves when all of these hold. The reasoning with line references is in the comment in `adapter.js`.

1. `!map.isTransformed()`: a redraw ran after the last gesture or eased camera change. During a gesture iD only sets a CSS transform (`map.js:614`) and resets it in the next `redraw()`.
2. No throttled redraw is queued. The throttle is a closure, so `adapter.js` wraps every reachable `scheduleRedraw()` call site (iD's `merge.map` and `enter.map` listeners, `map.centerZoom`, `map.zoom`, `map.center`, `map.dimensions`) and compares the number of complete draws before and after the call. No draw during the call means a trailing redraw is queued. The next complete draw clears the flag.
3. `services.osm.caches('get').tile.inflight` is empty.
4. Every z16 tile the current view needs is in `tile.loaded`. The needed tiles are computed like `osm.loadTiles` does (`utilTiler().zoomExtent([16, 16]).getTiles(context.projection)`). This also covers the gap between a redraw and the idle callback that issues the requests.
5. After 1 to 4 hold, one frame was produced (`requestAnimationFrame`, then a task after that frame's style, layout and paint), and 1 to 4 still hold with no draw or trigger in between.

Below zoom 16 or with the OSM layer off, 3 and 4 are skipped: iD loads nothing there.

A "complete draw" is `drawn {full: true}` outside of a `change` dispatch that carried a difference. Those partial redraws do not cancel the throttle.

Timeout: 30 s by default (`settled(ms)` overrides it). The rejection names the unmet conditions, for example `transformed=false pendingRedraw=false inflight=9 missingTiles=9/9 [35214,21504,16 ...]`.

Safety net: if `pendingRedraw` is still set 1250 ms after the last trigger, it is cleared and counted in `__bench._id.counters.watchdogClears`. `smoke.ts` asserts that this never happens, and that no full redraw occurs in the 1.2 s after `settled()` resolved (after the first load and after a mouse drag).

Not waited for: idle work that does not change the picture. The validator is switched off (see "Validation and background work"), so only the feature match cache warm-up after each merge is left (`renderer/features.js:627`). It is not waited for by `settled()`.

### Consequences for measuring

- **Initial load and every move into unloaded data include a fixed 750 ms wait.** The data of the last tiles is only drawn by the trailing redraw, 750 ms after the last merge. This is iD's behaviour, not an artefact of the adapter.
- **Programmatic camera moves** (`setCamera` = `map.centerZoom`, no duration) do not go through the CSS-transform phase: `zoomPan` returns early for them (`map.js:463`). On an idle map the redraw runs synchronously inside the call. Within 750 ms of the previous redraw it is queued for the trailing edge instead.
- **`setCamera()` once per animation frame, then `settled()`** (what `tools/bench/run.ts` does) stays honest. Every call is one `scheduleRedraw()`. The first draws synchronously, the following ones are queued and each restarts the 750 ms timer, and once 750 ms have passed since the last run a call draws synchronously again. After the last call one redraw is still queued; the adapter has `pendingRedraw` set from the first queued call on and only a complete draw clears it. Then conditions 3 and 4 wait for the tiles of the final view and for the trailing redraw after their merges. `smoke.ts` runs this pattern (45 frames) and asserts that nothing is queued or missing afterwards, that no full redraw follows in the next 1.2 s and that the watchdog never fired. Measured: 1 full redraw during the 45 frames (2 once on dense), settled 0.86 to 0.95 s after the last call on small, 1.1 to 1.4 s on medium, 3.7 to 8 s on dense (new tiles, several redraws of about 1 s each).
- What this pattern shows on screen is not what a mapper sees while dragging. With a real gesture iD moves the old picture with a CSS transform on every event and redraws at most every 750 ms. With per-frame `setCamera()` there is no transform phase, so the picture stands still between redraws. Frame times in that phase measure iD's full redraws, not its gesture feedback. A real mouse drag is covered by `smoke.ts` as well.
- The frame after a redraw is expensive on big scenes: on dense, about 200 ms passed between the end of the redraw and the end of the next frame.
- `select(id)` uses `context.enter(iD.modeSelect(context, [id]))`. iD draws the selection in a partial redraw and then calls `scheduleRedraw()`; on an idle map that is a synchronous full redraw. `select()` resolves one frame later, so it usually contains a full redraw (small about 0.2 s, medium 0.5 to 0.9 s, dense 1 to 2 s). It also builds the sidebar editor, which stays hidden.

## Sidebar

The map has to be the same size in every editor, so the host page collapses iD's sidebar at startup and the map fills the viewport (checked by `smoke.ts`: `.main-map` is 0,0 1600x1000 and the camera center projects to 800,500). Top bar and controls are untouched.

How: `collapseSidebar()` in `adapter.js` sets the end state of iD's own `sidebar.toggle()` (`ui/sidebar.js:356-403`: width in px, `margin-left` of minus that width, class `collapsed`), calls `context.ui().onResize()` so iD re-measures, and then `map.centerZoom()` with the camera from before, because `onResize` keeps the top-left corner and not the center. iD's own `sidebar.collapse()` was not used because it runs a 250 ms transition that resizes the map step by step, which would put redraws and tile requests for intermediate sizes into the load measurement. The collapse runs in the microtask chain of iD's first render, before the idle callback that requests the first tiles, and before `ready()` resolves. The sidebar toggle (key `` ` ``, the Inspect button) still works. As in a stock iD with a collapsed sidebar, the 10 px resize handle stays over the left edge of the map and takes pointer events there.

## Auto-hiding

At zoom 17 with the 1600x1000 map (cull factor 1.6, so the limits are 160 address points, 320 points, 400 buildings) iD auto-hides points, address points and buildings in **all three scenes**. `stats().hidden` reports them with the number of matching entities in the view. Keys are prefixed: `auto:` for iD's own culling, `off:` for features disabled by configuration (boundaries, as in iD's `index.html`). `__bench._id.features()` has the raw lists.

Default, zoom 17:

| Scene | Entities (n / w / r) | Drawn lines / areas / points / vertices / labels | DOM nodes in `svg.surface` | Hidden |
| --- | --- | --- | --- | --- |
| small | 10627 / 1636 / 66 | 506 / 135 / 9 / 840 / 55 | 9591 | auto: buildings 966, points 657, address_points 387; off: boundaries 3 |
| medium | 38890 / 5398 / 426 | 1809 / 532 / 86 / 3402 / 66 | 37754 | auto: buildings 622, points 3274, address_points 417; off: boundaries 15 |
| dense | 51049 / 8527 / 162 | 2214 / 1372 / 60 / 7059 / 31 | 72799 | auto: buildings 879, points 3676, address_points 285; off: boundaries 27 |

The few "points" still drawn are exempt from the filter. A default comparison at zoom 17 is iD without buildings and points against editors that draw them.

### `?cull=0`

Opt-in, for a like-for-like workload. In `index.html`, right after `context.init()` and before the first draw, the three rules that have a limit get it removed through iD's own rule objects:

```js
var rules = context.features().features();   // renderer/features.js:246, returns the rule map
['address_points', 'points', 'buildings'].forEach(function (key) {
  rules[key].defaultMax = Infinity;
  rules[key].currentMax = Infinity;
});
```

`rule.hidden()` is `count > currentMax * cullFactor` (`features.js:93`), so it is never true for an enabled rule, iD draws everything, and `features.hidden()` / `autoHidden()` keep describing what really happens. No other rule has a limit. Turning a feature off and on in iD's UI still works (`disable()` sets `currentMax = 0`, `enable()` restores `defaultMax`). The page throws if these rules lose their `defaultMax` in a later iD version. `stats().hidden` then only has `off:boundaries`; `smoke.ts --cull 0` asserts that nothing is auto-hidden and that buildings are in the DOM.

`?cull=0`, zoom 17:

| Scene | Drawn lines / areas / points / vertices / labels | DOM nodes in `svg.surface` | Hidden |
| --- | --- | --- | --- |
| small | 507 / 1098 / 1044 / 848 / 254 | 27733 | off: boundaries 3 |
| medium | 1877 / 1044 / 3691 / 3550 / 46 | 70218 | off: boundaries 15 |
| dense | 2238 / 2212 / 3961 / 7594 / 47 | 115468 | off: boundaries 27 |

## Time to settled

Zoom 17, scene center, viewport and map 1600x1000, minified build, mock API without latency, cold page load each time. Milliseconds since navigation start. The machine was running other jobs (other editors' builds and benchmark runs) at the same time, so these are rough; the spread within a scene shows it.

| Scene | ready | settled, default (3 runs) | median | settled, `?cull=0` (1 run) |
| --- | --- | --- | --- | --- |
| small | 350 to 610 | 1838, 1860, 1997 | 1860 | 1792 |
| medium | 340 to 560 | 2158, 2932, 3617 | 2932 | 2648 |
| dense | 410 to 510 | 2544, 2882, 4235 | 2882 | 3595 |

The last merge was at about 0.7 to 1.2 s in these runs. From there, 750 ms is the throttle wait and the rest is the final redraw and its frame. Earlier runs with the sidebar open (map 1200x1000, 6 or 9 tiles) had medians of 1559, 2358 and 2687 ms.

These numbers were taken with iD's validator running. It is off now (see "Validation and background work"), so they are stale. Single runs after the switch-off, on a busy machine: small 1525 ms, medium 3777 ms to settled. Not re-measured as a table.

## Validation and background work

**Validation is off by default.** Maid has no validator, so iD must not run one. `index.html` switches it off right after `context.init()`, before any data can arrive: the first tile request is made in an idle callback that `context.ts:300` schedules, and that runs only after the script has finished. `?validation=1` keeps iD's validator as it is.

What iD's validator does (`modules/core/validator.js`, v2.42.2). `context.init()` builds it (`context.ts:707`), and its constructor registers these listeners:

- `merge.validator` (`validator.js:563`): every merged tile validates the base graph's entities, in idle callbacks of 100 entities each (`validateEntitiesAsync`, `validator.js:704`). Most of the validation work during loading.
- `restore`, `undone`, `redone`, `reset` on history (`validator.js:550-553`) and `exit` on the context (`validator.js:561`): validate the edit diff.
- Provisional results are validated again after 5 s (`validator.js:759-768`).

Modes, operations and panels also call `context.validator().validate()` directly (`modes/select.js`, `operations/*.js`, `ui/entity_editor.js`, `ui/sections/*.js`).

How it is switched off (`index.html`, after `context.init()`):

- The five history listeners and the context's `exit` listener are removed with `on(name, null)` (`validator.js:550-553, 561, 563`).
- `context.validator().validate` is replaced by a function that returns `Promise.resolve()` (`validator.js:470`). This covers the direct calls. Nothing else in iD writes to the validator's caches.
- `getIssues()` stays empty, because the base cache never gets an entry. Selection, hover and dragging work the same. One visible difference: `ui/inspector.js:98` opens the editor for a selected vertex only when it has issues (`getEntityIssues`). With the validator off, a selected plain vertex always gets the preset list. Smoke passes with it off, and both the pan drag and the vertex drag work.

Measured with `smoke.ts` (`getIssues({what:'all', where:'all'}).length`):

| Scene | Validator | Merges | Issues |
| --- | --- | --- | --- |
| small | off | 8 | 0 (read 3 s after settled) |
| medium | off | 12 | 0 (read 3 s after settled) |
| medium | on (`--validation 1`) | | 149, the same in two runs; stable from about 23 s after the check started |

With `--validation 1`, smoke waits until the count has not changed for 3 s. Early reads (before that wait) showed 12 to 16 issues, which were partial counts: the validator needs about 23 s on medium. The drag checks in those runs happen after the validator has finished.

Other periodic or idle work in iD (v2.42.2), and what was done with it:

| Work | Where | When | Switched off? |
| --- | --- | --- | --- |
| Validator (above) | `core/validator.js` | after every merge, edit, mode change | yes |
| Feature match cache warm-up | `renderer/features.js:627-640` | idle callback after every merge, fills the match cache the next redraw reads | no. It changes no picture, but it is the rendering's own preparation. Switching it off would move the cost into the measured redraw. |
| Session lock renewal | `util/session_mutex.js:24` (every 4 s), started by `core/history.js:66-69` | a cookie write while the lock is held | no. No request, no drawing, and it is the edit-session check iD uses through `history.lock()`. |
| API status poll | `ui/status.js:86` (every 90 s), `services/osm.js:821` | a GET on `/api/capabilities` on the mock API | no. Its only handle is `osm.reloadApiStatus`, which the error paths also use (`services/osm.js:438`, `:863`, rate limit in `loadTile`). Switching it off would hide rate limit and offline states. A run is shorter than 90 s, so the poll never fires during one (the log shows only the initial request). |
| Debounced save | `core/context.ts:451-456` | 100 ms after an edit | only after edits. The smoke drags make edits, so it runs there. |
| Tile retry | `services/osm.js:911` | 8 s after a failed tile request | only on errors, none in the runs |
| Data load and parse | `core/context.ts:300`, `services/osm.js:197, 238` | idle callbacks per tile and per response | no. This is loading. |
| Drag nudge | `modes/drag_node.js:52`, `modes/move.js:84` | while dragging at the viewport edge | no. It is part of the gesture. |
| Imagery tile queue | `renderer/background_source.js:286` (`IntervalTasksQueue`) | imagery only | imagery is off (`background=none`, no sources) |
| Services that poll or fetch | taginfo, Nominatim, NSI, photo layers, QA | removed at startup | yes, see "Keeping iD off the network" |

## Dragging a vertex

`smoke.ts` drags one drawn vertex in browse mode with the real mouse and checks that iD moved it. The steps:

1. Pick a `g.node.vertex` in `.points-group.vertices`, take its entity id from the class list, and check that its projected position is at least 150 px from every viewport edge. Skip vertices connected to a hidden feature (see below). The press point must hit the vertex's own touch target: `document.elementFromPoint` returns an element with `__data__.properties.entity.id` equal to the id. Neighbouring vertices' targets overlap in streets, and pressing on one of those would drag the neighbour.
2. Hold Alt (`keyboard.down('Alt')`), `mouse.move` to the vertex, `mouse.down`, `mouse.move` 60 px right in 20 steps, `mouse.up`, release Alt.
3. Check that `nodeLoc(id)` changed, that the on-screen displacement (from `project()`) is 60 px and within 5 px of the pointer offset, that the drag is an edit (`history.hasChanges()`), and that `settled()` resolves with nothing queued and no full redraw in the 1.2 s after it.

What iD needs for the drag to move the vertex (`modes/drag_node.js`, `behavior/drag.js`):

- **Press target.** The drag binds to touch targets, selector `.layer-touch.points .target` (`drag_node.js:453`). The visible circle (`g.node.vertex > .stroke`) is not the target. The target is larger than the drawn vertex. In `small` 158 of 840 vertices in view had a neighbour's target over their centre.
- **Minimum movement.** 1 px for a mouse (`behavior/drag.js:33`), 4 px for a pen (`:34`). The smoke moves 60 px in 20 steps of 3 px.
- **Shift cancels.** `drag_node.js` `start()` sets `_isCancelled` when `shiftKey` is down. Do not hold Shift.
- **Alt turns snapping off.** `datum()` returns no target when `altKey` is down, so the node is not snapped. Without Alt, every touch target under the pointer during the move becomes the snap target: a way's edge (`geoChooseEdge` in `doMove`) or another vertex. Each 60 px path in these scenes crossed one. A probe found none of the roughly 680 vertices in `small` with a clear path in 16 directions. So the smoke holds Alt.
- **Hidden connections refuse the drag.** `start()` calls `features.hasHiddenConnections` (`renderer/features.js:541`) and cancels with a flash message. At zoom 17 iD auto-hides buildings in all three scenes, so vertices of buildings cannot be dragged. Use vertices of highways and paths. `small` had 33 of 840 vertices refused this way.
- **No selection first.** The drag works straight from browse mode. After the drop iD is in browse mode, and the edit is in `history`.
- **Playwright.** Mouse events take modifiers from the keyboard state, so Alt must be down before `mouse.down` and released after `mouse.up`.

Timing. Each `mouse.move` is one CDP round trip, so the whole gesture takes 2.4 s (`small`) to 6 to 13 s (`medium`) of wall time. The frame intervals are measured in the page with `requestAnimationFrame` from before `mouse.down` until after `mouse.up`:

| Run | Validator | Frames | Median interval | Max interval |
| --- | --- | --- | --- | --- |
| small | off (2 runs) | 65, 134 | 16.7 ms | 250, 467 ms |
| medium | off (4 runs) | 59, 80, 58, 58 | 16.7 ms | 950, 1200, 600, 1183 ms |
| medium | on, idle before the drag (2 runs) | 89, 84 | 16.7 ms | 1533, 1550 ms |

The median is the 60 Hz frame cadence in every run. Each run had one or more long frames (250 to 1550 ms), which I did not analyse. The two `medium` runs with the validator on had longer maxima than the four with it off. Two samples is not enough to say the validator causes it. Each number is one run of `smoke.ts`, on a machine that was also running other work.

## Pitfalls

- `project()` returns viewport pixels: `context.projection` plus the `.main-map` offset, which is 0,0 with the collapsed sidebar. Checked against the DOM position of a vertex, error below 0.01 px. If someone opens the sidebar again, the map shrinks and `setCamera` centers on the smaller map; `project()` stays correct. While a gesture is in progress `project()` is off by the CSS transform.
- The page must be served from localhost. A document that Playwright fulfils itself (`route.fulfill`) is not treated as a loopback origin, and Chrome's local network access check then blocks the requests to `localhost:8090` ("Permission was denied for this request to access the loopback address space"). `settled()` then times out with all tiles missing.
- The mock API and its `/requests` log can be shared with other runs. `smoke.ts` counts requests on the browser side and never resets the log.
- The base graph keeps its entities on the prototype of `history.base().entities`. `Object.keys` returns nothing; `stats()` walks inherited keys.
- Deleting all services but `osm` breaks selection of features with a wikidata field (see the table above).
- Dragging in browse mode moves nodes when the drag starts on a vertex. `smoke.ts` starts its drag where `elementFromPoint` is the bare `svg.surface` and checks `history.hasChanges()` afterwards.
- A failed tile request is retried by iD after 8 s (`services/osm.js:917`); until then the tile stays in `inflight` and `settled()` keeps waiting.
- The build rewrites tracked files in the checkout (`dist/`, `svg/fontawesome`), so `.reference/id` is dirty after `setup.ts`. That is expected. The stamp `.reference/id/.maid-build.json` records pin and build env.
- npm 11 skips dependency install scripts during `npm ci` (it prints a notice for esbuild and fsevents). The build works regardless.
- The bundle has the ports from `tools/ports.ts` baked in. After changing `PORTS.id` or `PORTS.mockApi`, run `setup.ts` again; it rebuilds because the env in the stamp no longer matches.

## Not verified

- Wheel zoom and eased moves (`zoomIn`, `transformEase`) were not exercised. They go through `zoomPan`, which condition 1 is meant to cover; only a mouse drag and per-frame `setCamera()` were tested.
- `frame-sync.js` is served and loaded, but the compare page itself (iframes, camera relay) was not run from here.
- Zoom below 16 (`editOff`) was reasoned from the code, not run.
- Firefox and WebKit.
- `?build=dev` was not part of the final smoke runs.
