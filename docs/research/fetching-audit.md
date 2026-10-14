# Fetching audit

Date: 2026-10-13. Read-only audit, asked for by the owner: rate limits for the OSM server, Wikidata and the other services, applied to Maid; TanStack Query with cache keys and long cache lifetimes; a check of every request Maid makes.

Method: the call-site grep from the brief, then the call sites and their callers. Maid's own `osm-api` and street-imagery packages were read from `node_modules`. iD and Rapid were read from `.reference/id` and `.reference/rapid` (pinned commits in `.reference`). Service rules come from public documentation fetched on this date, or from the code of iD and Rapid. Nothing was run in a browser. No OSM host was contacted.

Source marks: **[code]** a file in this repo or in `.reference`. **[doc]** public documentation fetched on 2026-10-13. **[memory]** from memory, to be confirmed by a person.

## Summary

- Maid makes about twelve kinds of request. Only the street-imagery package uses TanStack Query (`packages/module-street-imagery/package.json`). Everything else is hand-written `fetch`.
- The map data path is the riskiest. A failed OSM tile is removed from the loaded set and asked again on the next throttled move (every 100 ms while the map moves). A tile fetch has no timeout and no abort. There is no 429 or 509 handling anywhere in Maid.
- Maid is more careful than iD or Rapid for the wiki (click only, one at a time, 10 s timeout, 30-day cache) and for automation (every remote feature is off under `navigator.webdriver`).
- The fixes that matter most: one host gate per service with a pause on 429 and 509, a state machine for map tiles with timeout and backoff, abort of tiles that leave the view, and per-page wiki keys shared between tags.

## Part 1: every request Maid can make

### 1a. What, where, when

| # | What | Host (default) | Where [code] | Trigger | How often | Concurrency | Dedup |
|---|---|---|---|---|---|---|---|
| R1 | OSM map data tiles, `/api/0.6/map.json?bbox=` | `apiUrl`: mock on localhost; `api.openstreetmap.org` only with `?api=osm`; `master.apis.dev` with `?api=dev` | `packages/renderer/src/engine.ts` `loadVisibleTiles`, `loadTile`; called from `apps/maid/src/components/MapView.tsx` `handleMove` (throttled to 100 ms), `handleMoveEnd`, and `attach` | Every map move, and once at attach | Up to every 100 ms during a move. One request per tile not in the set | None. All missing tiles are sent at once (about 6 to 9 per view at OSM zoom 16) | `this.tiles` set, keyed `x/y`, kept for the session. A failed tile is removed from the set |
| R2 | One relation in full, `/api/0.6/relation/{id}/full.json` | `apiUrl` | `engine.ts` `loadRelation` and `fetchRelation`; called from `apps/maid/src/modules/relations.tsx` (around line 376) | One click on a relation's "load in full" | Once per click | One per relation (`relationLoads`) | Only while in flight. A second click after success asks again |
| R3 | OSM notes, `/api/0.6/notes.json?bbox&closed&limit=100` | `apiUrl` | `packages/module-notes/src/model.ts` `notesUrl`; `packages/module-notes/src/store.ts` `requestCells`; effect in `packages/module-notes/src/notes.tsx` (around line 92) | Notes switched on (off by default), then every map `moveend` with missing cells at zoom 16 or more | One request per move that has missing cells. Missing cells share one box | None: each move starts its own request; nothing waits | Per cell state (`loading`, `loaded`, `truncated`) for the session |
| R4 | Changeset upload: create, upload, close | `DEV_API` only | `apps/maid/src/save/save.ts` `uploadEdits` via `osm-api` `uploadChangeset` | One click on Save, dev only (`config.dev`) | Three requests per save | One save at a time (the button) | None |
| R5 | Login and own user details | `DEV_API` only | `apps/maid/src/auth.ts` `login`, `api`; `getUser('me')` | One click on "Log in" | Once per login | One | None |
| R6 | Wiki page of a tag, `wbgetentities` (key page and tag page in one call) | `wiki.openstreetmap.org` | `apps/maid/src/reference.ts` `requestUrl`, `fetchAnswer`, `loadReference`; called from `packages/ui/src/InfoPopover.tsx` `ReferenceBody` when the popover opens | Click on an "i" button | One per tag that is not cached | One at a time (`queued`) | In memory per tag page (`remembered`), and in `localStorage` for 30 days. The key page is not reused for a second tag |
| R7 | Wiki image shown in the popover | `commons.wikimedia.org` or `wiki.openstreetmap.org` | `reference.ts` `fileUrl`; `<img>` in `InfoPopover.tsx` | Same as R6 | One per popover opening (browser HTTP cache) | Browser | Browser HTTP cache only |
| R8 | Imagery index (ELI) | none | `packages/module-imagery/src/eli.ts`: the data is bundled, and the code has no `fetch` (checked in `node_modules/@osm-editor-kit/maplibre-editor-layer-index/dist`) | Map move (panel list) | No request | n/a | n/a |
| R9 | Background raster tiles of the chosen imagery layer | the layer's own server | MapLibre, from the source that `eli.ts` `drawLayer` returns; drawn by `ImageryLayers.tsx` | Map move, only for a chosen layer | Per tile in view | MapLibre's | MapLibre's |
| R10 | Data layers a person adds by URL: a probe, then MapLibre loads the layer | the URL typed | `packages/module-data-layers/src/add.ts` `probe`, `checkRemote`; then `layers.ts` (the source-spec builder) and MapLibre | Submit of the "add layer" form; then every view (vector tiles), once per source (GeoJSON), range reads (PMTiles) | One probe per add. Then MapLibre's | The probe has none | `pmtiles.ts` `readPmtilesLayers` caches per address; a failed read is forgotten |
| R11 | Fonts and sprites | same origin | `apps/maid/src/images.ts` `loadSprite` (`/sprites/*.svg`); glyph URL `/fonts/...` in `apps/maid/src/components/MapView.tsx` `EMPTY_STYLE` | Icon drawing; MapLibre's glyph loading | One per sprite file (memoised) | Browser | `loadSprite` memo |
| R12 | Street imagery, Panoramax tiles, `api.panoramax.xyz/api/map/{z}/{x}/{y}.mvt` (photos at zoom 15; sequences at 10 to 15) | `api.panoramax.xyz` | Package: `street-imagery/dist/chunk-3ZSPMGIR.js` (`fetchPanoramaxTile`, `fetchPhotos`). Maid: `packages/module-street-imagery/src/map.tsx` `StreetImageryLayers` | Map move (`moveend` through `useMapView`), only with Panoramax switched on and zoom 13 or more (`MIN_ZOOM`) | One query per distinct bbox and zoom; tiles per the tile list | Per query, not capped; `fetchTileCached` shares pending tiles | Tile cache (`chunk-2H2IMTDO.js`, 60 entries or 800 000 items). Query key uses the raw bbox |
| R13 | Street imagery, Mapillary tiles, `tiles.mapillary.com/maps/vtp/...` at zoom 14 (photos, sequences, map features) | `tiles.mapillary.com` | Package: `chunk-L3BO5HTJ.js`, `chunk-3BF52D6N.js`, `chunk-OHQUAQ5W.js`. Token from `VITE_MAPILLARY_TOKEN` (`apps/maid/src/maid.config.ts` line 77) | As R12, with Mapillary switched on and a token | As R12 | As R12 | As R12 |
| R14 | Street imagery, Mapillary Graph: photo by id (click), thumbnails, radius and bbox searches | `graph.mapillary.com` | Maid: `packages/module-street-imagery/src/image-actions.ts` `openImageById` (click). Package: `index.js` `fetchMapillaryThumbnail`, `fetchMapillaryImagesNearPoint`, `fetchMapillaryMapFeaturesInBbox`. Which hooks the dock calls is not traced | Click on an image id; dock views | Per click; thumbnails once per photo for 24 h (`staleTime`) | Per query | Query cache (package) |
| R15 | Panoramax item detail (thumbnail) | `api.panoramax.xyz` | Package: `index.js` `fetchPanoramaxThumbnail` via `usePhotoThumbnail` (`staleTime` 24 h) | Photo shown in the dock | Once per photo for 24 h | Per query | Query cache |
| R16 | Photo viewers: `mapillary-js` and `@panoramax/web-viewer` | the providers' own servers | Package `street-imagery-react/dist/chunk-SGIB7AVC.js`, `panoramax-web-viewer.js` | A photo opened in the dock | Not traced | Not traced | Not traced |

Not called from Maid: Nominatim, taginfo, Wikidata search, Wikipedia. A search for these names in `apps` and `packages` finds no call site. The one mention of taginfo is a comment with snapshot counts in `packages/ui/src/inspector/related-logic.ts`. Wikidata appears only as the text of a non-ported feature in `packages/presets/src/presets.ts`.

### 1b. Cache, cancel, errors, headers, automation, TanStack

| # | Cache today | Cancel | Errors and retry | Headers that identify Maid | Automated runs | TanStack |
|---|---|---|---|---|---|---|
| R1 | Engine memory, unbounded. Raw JSON is merged and then dropped. Nothing persisted | None: no `AbortController`, no `signal` | `console.error` only. A failed tile is removed from `tiles` and asked again at the next `loadVisibleTiles`, so up to 10 times a second during a move. A 429 or 509 is treated like any error. **No timeout**: a request that never answers keeps its key in `tiles` and is never asked again | None (`fetch` default headers) | Live refused (`apps/maid/src/config.ts` `readConfig`, `isAutomated()`); tests use the mock | No |
| R2 | None after success | None | Error shown to the person (`relations.tsx`). No retry, no timeout | None | Same as R1 | No |
| R3 | Session, per cell. Truncated cells (100 notes) are not asked again | `abortRequests` on unmount only (`notes.tsx` around line 98 and the module teardown around line 228). Switching notes off does not abort | Failed cells are dropped, and the next move asks again. No backoff | `Accept: application/json` only | Off by default. `moduleStorage()` returns nothing under automation, so the setting cannot come back on | No |
| R4 | None | None | None. Not retried, so no duplicate changesets | `created_by=Maid <version>` in the changeset tags (`save/osm-change.ts` `changesetTags`) | Dev only | No |
| R5 | `osm-api` keeps the token in `localStorage` (`__osmAuth`). Maid stores the display name under `maid:osm-dev-user` (`auth.ts`) on a click | None | Error text shown | `osm-api` sets `User-Agent: https://github.com/osmlab/osm-api-js` (`osm-api` `dist/index.js`, `osmFetch`). Browsers do not send that header | Login refused under automation (`auth.ts` `unavailable`) | No |
| R6 | Memory per tag page, for the session. `localStorage` `maid.reference:<key>` for 30 days (`MAX_AGE_MS`). "No item" is cached as `null` | 10 s `AbortController` timeout. Closing the popover does not abort (a late answer is dropped by the `current` flag) | No retry. A failed answer is not cached, so the next opening asks again. One at a time through `queued` | `origin=*` in the URL. `credentials: 'omit'`. No `Api-User-Agent`, no `maxlag` | `loadReference` returns before any request or storage read (`isAutomated`). Note: `readStored` and `writeStored` call `localStorage` directly, not `moduleStorage()` | No |
| R7 | Browser cache | Browser | Browser | n/a | Shown only when the popover opens | No |
| R8 | n/a | n/a | n/a | n/a | n/a | n/a |
| R9 | MapLibre's | MapLibre's | MapLibre's. No Maid retry or timeout | None | Chosen layers are not drawn under automation (`ImageryLayers.tsx` `automated`) | No |
| R10 | `localStorage` for the layer list (`module-data-layers/src/store.ts`, through `moduleStorage()`). PMTiles header per address | None. The probe has no timeout and no abort on closing the form | No retry. The GeoJSON probe downloads the whole file to check it | None | Layers added by URL are hidden under automation (`layers.ts` `allowedWhenAutomated`) | No |
| R11 | Memo per sprite | Not needed | Not needed | n/a | Same origin | No |
| R12 | Tile cache (package), 60 entries or 800 000 items, least recently used. Query cache with the package's own options | Query `signal` passed to the tile fetch. Tile fetches are abandoned when no subscriber remains | Maid sets `retry: 1` (`packages/module-street-imagery/src/query.ts` `photoQueries`). No 429 handling | None | `AUTOMATED` (`store.ts` line 14): `activeProviders` returns nothing | Yes (package and `photoQueries`) |
| R13 | As R12 | As R12 | As R12. A token in the URL | None | As R12 | Yes |
| R14 | Query cache, 10 min or 24 h `staleTime` | Signal | Retry 1 | None | Click-only; `openImageById` refuses under automation | Yes |
| R15 | Query cache, 24 h | Signal | Retry 1 | None | As R12 | Yes |
| R16 | Not traced | Not traced | Not traced | Not traced | Not traced | Not traced |

## Part 2: iD and Rapid, same kinds of request

Source of every row: `.reference/id` (iD) and `.reference/rapid` (Rapid). Rapid's `OsmService.ts` is named `OsmService.ts` below.

| Kind | iD [code] | Rapid [code] |
|---|---|---|
| Map data tiles: zoom | `modules/services/osm.js` line 45, `_tileZoom = 16` | `OsmService.ts` line 283, `_tileZoom = 16` |
| Tiles: loading trigger | `modules/renderer/map.js` line 679 calls `context.loadTiles` on each redraw. `scheduleRedraw` is `throttle(redraw, 750)` (line 85) | `OsmService.ts` `loadTiles` (around line 1567). Exits early when `viewport.v` is unchanged |
| Tiles: in flight | `_tileCache.inflight[tile.id]` (`osm.js` `loadTile`). No cap on count | `NetworkSystem.ts`: `DEFAULT_MAX_INFLIGHT = 100` (line 93), FIFO queue above it. `setMaxInflight` is never called in Rapid |
| Tiles: cancel when leaving the view | `osm.js` `abortUnwantedRequests` (lines 79 to 88), called in `loadTiles` | `OsmService.ts` `loadTiles` calls `network.abortMatching` for `osm-data-tile` ids not needed |
| Tiles: timeout | None in `osm.js` | `NetworkSystem.ts` `DEFAULT_TIMEOUT = 30_000` (line 90) for every request |
| Tiles: dedupe | `_tileCache.loaded`, `inflight`, and `seen` | `network.isCompleted` and `isInflight` by request id `osm-data-tile-<id>` (`OsmService.ts` `loadTile`); `NetworkSystem.ts` returns the existing promise for a known id |
| Tiles: failure | `tileCallback` deletes `inflight` and, after **8 s**, calls `loadTile` again. This applies to every error, including 429 | `done` calls `network.forget(requestID)`, so the next `loadTiles` asks again. No timer |
| 429 and 509 | `osm.js` `tileCallback` (around line 905): `_rateLimitError = err`, then `dispatch.call('change')` and `reloadApiStatus()`. The 8 s retry still runs for each tile. The status shows "rateLimited" (`modules/ui/status.js`, text `osm_api_status.message.rateLimited`). The rate-limit flag is cleared when no tile is in flight | `OsmService.ts` `loadFromAPI` (around line 628): duration is the number in the body ("N seconds"), default **10 s**. `setRateLimit` (around line 1488) aborts `osm-data-tile` and `osm-note` requests and clears the note queue. `loadTile` returns at once while `getRateLimit()` is set (every tile gate) |
| Login expiry (400, 401, 403 while logged in) | `osm.js` `loadFromAPI`: the code calls `reloadApiStatus()` and retries the request | `OsmService.ts` `loadFromAPI` (around line 616): `logout()` then one retry |
| Status poll | `osm.js` `status` calls `/api/capabilities.json`. `reloadApiStatus` is throttled to 500 ms | `OsmService.ts` `reloadApiStatus` throttled by `scheduler.throttle` (500 ms) |
| Notes: zoom and limit | `osm.js` `loadNotes`: tiles at `_noteZoom = 12` (line 46), `limit=10000`, `closed=7` (line 963) | `OsmService.ts` `_noteZoom = 12` (line 284) |
| Notes: failure | Tile marked loaded only on success; `throttleLoadUsers` (750 ms) loads note authors | Note tiles forgotten on error |
| Wiki docs ("i") | `services/osm_wikibase.js` `getDocs`: all the user's locales, `languagefallback=1`, `origin=*`. Results cached per sitelink (`_wikibaseCache`, line 11): a key page is reused by every tag with that key (lines 212 to 238). `request` dedupes by URL (line 17). `debounce` 500 ms (line 15) when asked. `ui/tag_reference.js` `load` runs once per opened reference | `services/OsmWikibaseService.ts`: `apibase` line 66. Cache `_cache` (line 53), keyed by sitelink, same as iD. Locale ids cached as `false` after a miss |
| Wikidata search | `services/wikidata.js` `itemsForSearchQuery`: `wbsearchentities`, `limit: 10`, `origin: '*'`, retries once without a region subtag. No debounce in this function; `ui/fields/wikidata.js` uses the combobox (debounce not checked) | `services/WikidataService.ts` line 78 to 88: same request. Entity cache `Map` (line 22) cleared on reset (line 62) |
| Taginfo | `services/taginfo.js`: `_taginfoCache` (line 20), never trimmed except on `init`. `debounce` 300 ms (line 149). Prefix reuse in `checkCache` | `services/TaginfoService.ts`: `TAGINFO_API` (line 8). Cache `_cache` (line 93). `scheduler.debounce` 300 ms |
| Nominatim | `services/nominatim.js` `reverse` and `search`: `_inflight` by URL. Reverse cached in `_nominatimCache` | `services/NominatimService.ts`: `apibase` line 31. Reverse results kept in the spatial system (200 m box) |
| Mapillary | `services/mapillary.js`: tiles at zoom 14 (`loadTiles` lines 296 to 308). `loadTile` dedupes by `loaded` and `inflight`; a failure removes `inflight` and sets nothing, so the next view asks again. No 429 handling. The file ships a token in code. Maid must not copy it (AGENTS.md rule 1) | `services/MapillaryService.ts` (not read in detail) |
| Panoramax | `services/panoramax.js`: `apiUrl` line 17, `imageMinZoom = 15` (line 32), `lineMinZoom = 10` (line 33). Dedupe by `loaded` and `inflight`. No 429 handling | `services/GeoScribbleService.ts` and others not read |
| Wikipedia | `services/wikipedia.js`: `origin=*`. Search when 8 or more characters, else suggestions (`ui/fields/wikipedia.js`) | `services/WikipediaService.ts`: `origin=*`. Not used by Maid |

## Part 3: the services' rules

| Service | Rule | Source |
|---|---|---|
| Wikimedia API | Send requests in series: "should result in a safe request rate". Use `maxlag` for non-interactive tasks; it is optional for a person clicking. Value 5 s is the recommended value. A `maxlag` refusal is HTTP 200 with error code `maxlag`; wait at least 5 s (`Retry-After`) and back off | [doc] mediawiki.org API:Etiquette; Manual:Maxlag parameter |
| Wikimedia User-Agent | Requests need a meaningful User-Agent. A browser cannot set `User-Agent`, so use `Api-User-Agent`. Without it the IP may be blocked "without notice" | [doc] API:Etiquette |
| Wikimedia caching and verbs | Cache what you can. Use GET for reads. Reads have no hard speed limit. `ratelimited` errors: exponential backoff | [doc] API:Etiquette |
| Wikidata REST and `wbsearchentities` | Not fetched. Use only the Wikimedia etiquette above | Not checked |
| Mapillary Graph, entity | 60 000 per minute per app | [doc] mapillary.com/developer/api-documentation, "Rate limits" |
| Mapillary Graph, search | 10 000 per minute per app | [doc] same |
| Mapillary tiles | **50 000 per day** (not per minute). The limit is per app, so every Maid user shares it. Tiles need a token; the page prefers `?access_token=` | [doc] same, "Rate limits" and "Authentication" |
| Mapillary errors | Throttling returns "Application request limit reached" (code 4, transient). No HTTP 429 and no `Retry-After` documented. A tile over the limit gets a 4xx | [doc] same |
| Panoramax | No rate limit, usage policy or caching rule found. `docs.panoramax.fr/backend/` and `docs.panoramax.fr/api/` were read: nothing relevant. `docs.panoramax.xyz` has a certificate error | [doc], partial |
| OSM API | Bulk calls have size limits. Notes and map calls have element and area limits. Rate limits per IP and per user, with 429 and 509 for overload | [memory] to be confirmed by a person. The limit numbers are not stated here |
| OSM API, what iD and Rapid do | 429 and 509 are overload signals. Both pause or slow the whole connection; Rapid's pause is global, iD's is a fixed 8 s per tile | [code] `osm.js` and `OsmService.ts` |
| Nominatim | One request per second, and no autocomplete on the public server | [memory] to be confirmed by a person. Maid does not call Nominatim |
| Taginfo | Public API, no published limit found. Maid does not call it at runtime | [memory] |
| MapLibre `transformRequest` | Runs before each request. It can change the URL and headers, not timing. Default `null` | [doc] maplibre.org MapOptions |
| MapLibre `maxParallelImageRequests` | Not on the MapOptions page. Default 16 | [memory] to be confirmed |
| TanStack Query defaults | `gcTime` 5 min. `retry` 3 with exponential delay. `persistQueryClient`: `maxAge` 24 h, `buster`, `dehydrateOptions`, saves at most once per second | [doc] tanstack.com query guides |
| TanStack Query `staleTime`, focus and reconnect defaults, dedupe | `staleTime` 0; `refetchOnWindowFocus` and `refetchOnReconnect` true; `networkMode` `online`; identical keys share one in-flight promise | [memory] to be confirmed. The doc page did not state them |

Maid's own rule (AGENTS.md, rule 1) is stricter than all of these: zero requests from automated runs, no OSM host outside the mock, and never a second fetch of a wiki tag.

## Part 4: side by side, and the gaps

Verdicts: **Maid is more careful**; **Maid is less careful (fix)**; **different by design (say why)**.

### 4a. Map data tiles (R1)

| | iD | Rapid | Service rule | Maid today | Difference | Proposal |
|---|---|---|---|---|---|---|
| Zoom | 16 | 16 | iD and Rapid match the editable zoom | 16 (`minDataZoom`) | Same | Keep |
| Retry after an error | 8 s per tile, any error | On next viewport change, after a pause | Back off | Next throttled move, which is up to 10 per second | **Maid is less careful (fix)** | State per tile: `failed` until `retryAt`. Backoff 2, 4, 8 ... up to 60 s |
| 429 and 509 | Status "rateLimited"; retries still run | Global pause for the Retry-After (default 10 s); aborts the others | Back off | Nothing | **Maid is less careful (fix)** | Host gate: pause for Retry-After (default 10 s), doubling |
| Timeout | None | 30 s | Not stated | None | **Maid is less careful (fix)**: a hung tile is never asked again | 30 s per tile with `AbortController` |
| Cancel on pan | Yes | Yes | Not stated | No | **Maid is less careful (fix)** | Abort tiles not in view that are not loaded |
| Concurrency | No cap | Cap 100, not set | Serial is not required for reads | No cap | Same as iD and Rapid. Browsers cap connections per host on HTTP/1.1 (from memory) | Queue of 6 per host |
| Pan back | Loaded tiles kept | Loaded tiles kept | n/a | Loaded tiles kept | Same | Keep |
| Identify the editor | Browser, OAuth | Browser, OAuth | Identify app | Browser, none | Same | Keep; `created_by` on changesets |

### 4b. Relation in full (R2)

| | iD | Rapid | Maid today | Verdict | Proposal |
|---|---|---|---|---|---|
| Asked again on a second click | Not checked | Not checked | Yes | **Maid is less careful (fix)** | Query key `['osm-api', origin, 'relation', id, 'full']`, `staleTime: Infinity` |
| Timeout and retry | None | 30 s | None | **Maid is less careful (fix)** | 30 s; no retry on 4xx |

### 4c. Notes (R3)

| | iD | Rapid | Maid today | Verdict | Proposal |
|---|---|---|---|---|---|
| Zoom | 12 | 12 | 16 (`minDataZoom`) | **Maid is more careful** | Keep |
| Limit per request | 10 000, closed 7 days | Not checked | 100, `closed=0` or `-1`, truncated flag | **Maid is more careful** | Keep |
| Off by default | No | No | Yes | **Different by design**: notes are off until a person asks | Keep |
| Failure | Tile not marked loaded | Forgotten | Dropped, asked at the next move, no backoff | **Maid is less careful (fix)** | Backoff; host gate |
| Abort on leave | Yes (`abortUnwantedRequests`) | Yes | Only on unmount; switching off does not abort | **Maid is less careful (fix)** | Abort cells no longer in view |
| Requests per move | Per redraw, throttled | Per viewport change | One per move with missing cells, not throttled | **Maid is less careful (fix)**: no throttle, though `moveend` is rarer than a frame | Debounce 300 ms |

### 4d. Wiki and "i" (R6, R7)

| | iD | Rapid | Maid today | Verdict | Proposal |
|---|---|---|---|---|---|
| When asked | On open | On open | On click on "i" | **Maid is more careful** | Keep |
| Concurrency | Many, deduped by URL | Many | One at a time | **Maid is more careful** | Keep, through the gate (maxConcurrent 1) |
| Key page reused for another tag | Yes (sitelink cache) | Yes | No. The key page is asked again for every tag | **Maid is less careful (fix)** | Per-page keys: `['wiki', 'page', 'Key:x']` and `['wiki', 'page', 'Tag:x=y']` |
| Session lifetime | Session, no limit | Session | Session | Same | `gcTime: Infinity`, `staleTime: Infinity` |
| Between sessions | Not kept | Not kept | 30 days in `localStorage` | **Different by design**: kept, because wiki pages change slowly. Owner decision | Persister for the `wiki` prefix only, `maxAge` 30 days |
| Timeout | None | 30 s (default) | 10 s | **Maid is more careful** | Keep |
| Retry | None in iD's wiki path | Not checked | None | Same | Keep |
| Storage through `moduleStorage()` | n/a | n/a | No: `localStorage` direct | **Maid is less careful (fix)**: breaks the rule that stores go through `moduleStorage()` | Use the persister on `moduleStorage()` |
| `maxlag` and `Api-User-Agent` | Neither | Neither | Neither | Same as the services; optional for a person | Add `maxlag=5` (cheap). `Api-User-Agent` needs a CORS check: from memory, to be confirmed by a person in a draft |
| Language | All the user's locales | Same | English only | **Different by design**: the popover is in English, like the presets | Keep |
| Cancel on close | Not needed | Not needed | Not aborted; result dropped | **Maid is less careful (fix)** | Abort on close |

### 4e. Taginfo, Nominatim, Wikidata search, Wikipedia

Maid calls none of them. This is **different by design** (no search box, no reverse geocoder). If they are added, use the rules in Part 5.

### 4f. Street imagery (R12 to R15)

| | iD | Rapid | Maid today | Verdict | Proposal |
|---|---|---|---|---|---|
| Panoramax tile zoom | Photos 15, sequences 10 | Not checked | Same (package) | Same | Keep |
| Mapillary tile zoom | 14 | Not checked | 14 (package) | Same | Keep |
| Minimum zoom for the layer | Photos from 15, lines from 10 | Not checked | 13 (`MIN_ZOOM`, `map.tsx`) | **Different by design**: the package's table still applies | Keep, but check the sign layers too |
| Query key | Tile-based | Not checked | Raw bbox string and zoom (`bboxKey`, package `index.js`) | **Maid is less careful (fix)**: each move makes a new query; a changed float makes a new key | Key by the tile list, `['mapillary', 'tile', layer, z, x, y]` |
| Refetch on window focus | Not checked | Not checked | Default true; `staleTime` 0 on view queries | **Maid is less careful (fix)** | `refetchOnWindowFocus: false` for the shared client |
| Retry | Not checked | Not checked | 1 (`query.ts`) | **Maid is more careful** than the default of 3 | Keep 1, but not for a 429 |
| Mapillary daily budget (50 000 tiles per app) | Not checked | Not checked | Not counted | **Maid is less careful (fix)** against the service rule | Count tiles per session in memory and warn; default Mapillary off |
| Automated | Not checked | Not checked | Off (`AUTOMATED`) | **Maid is more careful** | Keep |

### 4g. Changeset upload and login (R4, R5)

| | iD | Rapid | Maid today | Verdict |
|---|---|---|---|---|
| Upload retry | Guard against a second upload while one is in flight (`_changeset.inflight`) | Same guard ("Changeset already inflight") | No retry, one click | **Maid is more careful**: a failed save is never repeated by code |
| Login expiry | Reload status | Logout and retry once (`OsmService.ts`) | Error text | **Different by design**: a dev-only feature |
| Upload only on the dev server | n/a | n/a | Yes | **Different by design** (rule 1) |

### 4h. Data layers and imagery (R8 to R11)

| | iD | Rapid | Maid today | Verdict | Proposal |
|---|---|---|---|---|---|
| Layer probe | Not applicable | Not applicable | Full GeoJSON download, no timeout, no abort | **Maid is less careful (fix)** | Timeout 30 s; abort on close; refuse above a size limit (owner decision) |
| Imagery index | Bundled data | Bundled data | Bundled (ELI) | Same | Keep |
| Imagery tiles | Browser | Browser | MapLibre | Same | Keep; they are drawn only for a chosen layer |
| Added layers under automation | n/a | n/a | Hidden | **Maid is more careful** | Keep |

## Part 5: the design

### 5.1 Where the client lives

- `packages/core` creates the one `QueryClient`, from `@tanstack/query-core` only. It is the framework-free client. It also holds `remoteFetch`, `HostGate` and `RemoteError`. `packages/core` already holds `isAutomated` and `moduleStorage`.
- `packages/renderer` and the headless packages (`packages/presets`, `packages/validation`, `packages/operations`) depend on `@osm-editor-kit/maid-core` already. They call `remoteClient.fetchQuery` or `ensureQueryData`, or `remoteFetch`, from plain TypeScript. They do not depend on `@tanstack/react-query`.
- `apps/maid/src/main.tsx` wraps the React tree in `QueryClientProvider client={remoteClient}` from `@tanstack/react-query`. Only the app and packages with components (`packages/ui`, `packages/module-*`) depend on `@tanstack/react-query`.
- `packages/module-street-imagery/src/query.ts` (`photoQueries`) is replaced by the shared client. The package's own queries then use Maid's defaults. Keep the package's per-query `staleTime` (10 min, 24 h). Do not set a global `staleTime: Infinity`: it would stop the package's view queries from ever refreshing.

### 5.2 Defaults

| Option | Value | Why |
|---|---|---|
| `queries.staleTime` | 0 | Views (bbox, zoom) must refresh. Reference data sets `Infinity` per query |
| `queries.gcTime` | 5 min, and `Infinity` for `['wiki', …]` and `['osm-api', …, 'relation', …]` | Reference data stays for the session |
| `queries.retry` | Function: never a 4xx except 408; never a 429 or 509 (those go to the host gate); at most 2 retries | A 4xx will not change on retry; 429 and 509 mean "stop" |
| `queries.retryDelay` | `min(30 s, 1 s · 2^n)` with jitter | Bounded backoff |
| `queries.refetchOnWindowFocus` | false | Focus is not a reason to call a server again |
| `queries.refetchOnReconnect` | false, except notes (true) | Reference data is never stale; a reconnect is no reason to re-ask |
| `queries.networkMode` | `online` | Queries wait offline and do not fail |
| Abort | `signal` from TanStack passed to `fetch`; for the engine, an `AbortController` per tile | Leaving a view stops the work |

### 5.3 The host gate

One gate per service: `osm-api` (the configured `apiUrl` origin), `wikimedia`, `mapillary`, `panoramax`, `data` (added layers). Each gate:

- Limits concurrent requests (OSM 6, Wikimedia 1, Mapillary 6, Panoramax 6, data 2; the OSM 6 is from memory of the browser connection limit).
- Holds a `pausedUntil` time. A 429 or 509 sets it to `now + Retry-After` (default 10 s, the value Rapid uses); a second 429 doubles the pause, up to 60 s. Every waiting request waits for the same pause.
- Is the only way to call `fetch` for that service. `remoteFetch(gate, url, init)` checks `isAutomated()` first and checks the host. Under automation it throws for any host that is not `localhost`, `127.0.0.1` or `[::1]`. A unit test stubs `navigator.webdriver` and checks that `fetch` is not called.

Sketch (for the implementer, not final code):

```ts
class HostGate {
  private active = 0
  private waiting: (() => void)[] = []
  private pausedUntil = 0
  constructor(private max: number) {}
  async run<T>(task: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal) {
    while (this.active >= this.max || Date.now() < this.pausedUntil) {
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    }
    this.active++
    try { return await task(signal ?? new AbortController().signal) }
    finally { this.active--; this.waiting.shift()?.() }
  }
  pause(seconds: number) { this.pausedUntil = Math.max(this.pausedUntil, Date.now() + seconds * 1000) }
}
```

The real version needs a timer to wake waiters when the pause ends, and a timeout per task.

### 5.4 Query keys

Convention: `[service, origin, resource, ...params]`. The origin keeps the mock, live and dev data apart.

| Request | Key | Options |
|---|---|---|
| R2 relation in full | `['osm-api', origin, 'relation', id, 'full']` | `staleTime: Infinity`, `gcTime: Infinity` |
| R3 notes | Not a query. Cells keep their store, and fetches go through the gate | Cell key `['osm-api', origin, 'notes', mode, i, j]` as the record key |
| R4 upload | Not a query (a command) | None |
| R5 user | `['osm-api', origin, 'user', 'me']` | `staleTime: 1 h` |
| R6 wiki page | `['wiki', 'page', title]` for `Key:x` and `Tag:x=y` separately | `staleTime: Infinity`, `gcTime: Infinity`, persisted (5.6) |
| R6 tag reference | Built from the two page queries. No query of its own | Fetch only the missing page |
| R7 wiki image | Browser cache | None |
| R10 layer probe | Not a query. One request, with timeout and abort | None |
| R12, R13 map tiles (street imagery) | `['mapillary' or 'panoramax', 'tile', layer, z, x, y]` | `staleTime: Infinity` on the tile; the package's `fetchTileCached` keeps its own bound (60 entries) |
| R14, R15 photo details | Package keys, unchanged | Package options |
| Future Wikidata search | `['wikidata', 'search', lang, query]` | `staleTime: Infinity`, `gcTime: 1 h` |
| Future Taginfo | `['taginfo', 'keys', query, rp]` | `staleTime: 1 h` |

With these keys, two fields asking for `Key:building` share one request. The key page is only fetched once per session, and once per 30 days across sessions.

### 5.5 What does not go through TanStack

- **MapLibre's own loads**: raster tiles of imagery (R9), vector tiles and GeoJSON of data layers (R10), glyphs and sprites (R11). MapLibre loads these itself. Maid decides which sources exist, and when. `transformRequest` is the one hook: use it to add headers, never to change timing.
- **OSM map data tiles (R1)**: keep them in the engine, not in the query cache. The engine already merges each tile into the model, and a query cache would keep the raw JSON a second time in memory. Recommendation: the engine keeps `tiles` as a `Map<key, { state: 'inflight' | 'loaded' | 'failed', retryAt, controller }>`. Requests go through the `osm-api` gate with a 30 s timeout. Tiles that leave the view are aborted. A pan back to a loaded tile sends nothing. A pan back to a failed tile waits for `retryAt`. On 429 or 509 the gate pauses; the engine does nothing extra.
- **Notes (R3)**: the view batching stays in the store. The fetch goes through the gate; a failed cell gets `retryAt`.
- **Upload (R4) and login (R5)**: commands, not reads.

Rule for those: a request that is part of a view or a render stays with its owner (MapLibre or the engine), but goes through the same gate, timeout and automation check. Only reads that can be asked again for the same key go through TanStack.

### 5.6 Persistence across sessions

| Cache | Kept between visits? | How |
|---|---|---|
| Wiki pages | Yes, 30 days | A TanStack persister on `moduleStorage()`. `dehydrateOptions.shouldDehydrateQuery` keeps only `['wiki', …]`. `maxAge` 30 days. `buster` `wiki-v1` |
| Relation, tiles, notes, street imagery | No | Session only. OSM data should not come from an old visit |
| Street imagery tiles | No | Session only |
| Notes settings, layer list, imagery choice | Yes | Existing stores, through `moduleStorage()` (unchanged) |

Storage rules: a link never writes storage (a link opens the page and asks no reference data; the wiki is asked only on a click). Automated runs read and write nothing: `moduleStorage()` returns nothing when `isAutomated()` (`packages/core/src/storage.ts`), and the persister uses `moduleStorage()`, so automation writes nothing. The wiki's direct `localStorage` calls in `reference.ts` are replaced by this.

### 5.7 Typing-driven requests (future)

No Maid feature searches today. If a Wikidata or Taginfo search is added:

- Debounce 300 ms (iD and Rapid use 300 ms for taginfo; iD uses 500 ms for wiki).
- Minimum 3 characters (iD switches Wikipedia to a search at 8; Maid picks 3).
- Each query string is a key. A new keystroke cancels the previous `signal`.
- The Wikimedia gate runs one at a time, with `origin=*` and `limit=10`.
- Results stay cached for the session (`staleTime: Infinity`, `gcTime: 1 h`).

### 5.8 Automated runs at zero

- One switch: `isAutomated()` in `packages/core/src/automated.ts`. `remoteFetch` throws for any non-local host under automation. Every hook sets `enabled: !isAutomated()`. `moduleStorage()` already returns nothing.
- Unit tests: a Vitest test stubs `navigator` with `webdriver: true`, calls each `remoteFetch` path, and checks that `fetch` is not called and that `localStorage` has no calls.
- Browser checks: `tools/bench/check-page.ts` already blocks every non-local request (`context.route`, line 46) and reports "no request outside localhost" (line 93). The benchmark (`tools/bench/run.ts` line 219) does the same. Those are the checks that prove it.

### 5.9 Per-request budget: a ten-minute session on the dense scene

Assumptions: the mock or a live session on the dense fixture. 40 map moves. 10 clicks on "i" that name 7 different tags. 15 selections. Notes off. Street imagery off, except a 2-minute trial with both providers on. Estimates come from the code and the tile geometry (about 6 to 9 tiles per view at OSM zoom 16). None were measured. To measure, read the mock's `/requests` log (the mock keeps a log, see `tools/mock-osm-api/server.ts`) before and after.

| Kind | Today (estimate) | After the design (estimate) | Basis |
|---|---|---|---|
| R1 map tiles, successful | 10 to 25 | 10 to 25 | New tiles only. The fixture is small |
| R1 map tiles, retries after failure | 0 normally; up to 10 per second for a failing tile, 30 to 100 in a bad minute | 0 to 1 per tile per minute, paused during 429 | `loadVisibleTiles` retries every move |
| R2 relation loads | 0 to 3 | 0 to 3 (one per relation) | One per click today; a repeat is free after |
| R3 notes | 0 (off) | 0 (off); when on, one per move with missing cells, debounced | Off by default |
| R4 and R5 | 0 to 1 save (dev), 1 login | Same | Commands |
| R6 wiki page requests | 7 tags, so 7 calls (key page asked again each time): about 7 to 10 | About 4 to 5 (key pages shared), 0 on a repeat | Key page reuse |
| R7 wiki images | 7 | 7 | Browser cache |
| R9 imagery tiles | 0 (off) to 100 to 200 with a layer on | Same | MapLibre |
| R10 layer probes | 0 to 2 | 0 to 2 | One per add |
| R12, R13 street imagery tiles | Panoramax on: 30 to 60; Mapillary on: 50 to 100 for the 2 minutes | Same count; tile-keyed, so repeats in the session are free longer | Per move, per layer; tile cache of 60 entries |
| R14, R15 photo details | 0 to 5 | 0 to 5 | Per photo |
| R16 viewers | Not traced | Not traced | |

Mapillary's 50 000 tiles per day per app is the number to watch: a few hundred Maid sessions with Mapillary on would use it. The design counts tiles and warns; it cannot raise the limit.

### 5.10 Implementation steps (each small enough for one agent)

1. **Core gate.** `packages/core/src/remote/gate.ts`: `HostGate`, `RemoteError` (status, Retry-After), `remoteFetch`. Test: concurrency cap, pause doubles on repeated 429, Retry-After parsed, automation refusal. Check: `bun test packages/core` and `bun run check`.
2. **Core client.** `packages/core/src/remote/client.ts`: `remoteClient` from `@tanstack/query-core` with the 5.2 defaults. Test: no retry on 4xx, two retries on 5xx, no retry on 429.
3. **Engine tiles.** `packages/renderer/src/engine.ts`: replace the `tiles` set with the state map (5.5). Gate, 30 s timeout, abort unwanted tiles, `retryAt` backoff. Test with a fake `fetch`: failed tile is not asked before `retryAt`; 429 pauses the gate; a hung request times out; a pan back to a loaded tile sends nothing. Check: `bun run check`, then `bun run check-undo`: its report must show "no request outside localhost" with no blocked requests.
4. **Notes.** `packages/module-notes/src/store.ts`: `requestCells` through the gate, failed cells get `retryAt`, abort cells no longer in view. Test: a failed cell is not asked before its time. Check: `bun run check`.
5. **Wiki.** `apps/maid/src/reference.ts`: per-page keys (`Key:` and `Tag:`) in the client, one fetch per missing page, `maxlag=5` added. Remove the direct `localStorage` calls. Test: a key page shared by two tags is fetched once. Check: `bun run check`.
6. **Persister.** `packages/core/src/remote/persist.ts`: `persistQueryClient` on `moduleStorage()`, `shouldDehydrateQuery` for `wiki` only, `maxAge` 30 days, buster. Test: under a stubbed `webdriver`, nothing is written. Check: `bun run check`.
7. **App shell.** `apps/maid/src/main.tsx`: `QueryClientProvider client={remoteClient}`. `packages/module-street-imagery/src/dock.tsx` and `map.tsx`: use the shared client; delete `query.ts`. Test: the street-imagery state tests still pass. Check: `bun run check`.
8. **Street-imagery keys and budget.** Count Mapillary tiles per session in memory; warn at 40 000 of 50 000 per day (in memory, so the count restarts per page visit); default Mapillary off. Test: the counter. Check: `bun run check`.
9. **Relation.** `engine.ts` `loadRelation` through the client, key `['osm-api', origin, 'relation', id, 'full']`. Test: second call sends nothing. Check: `bun run check`.
10. **Layer probe.** `packages/module-data-layers/src/add.ts` `probe`: gate `data`, 30 s timeout, abort on form close. Test: abort stops the request. Check: `bun run check`.
11. **Automation proof.** A Vitest test for every `remoteFetch` path under a stubbed `webdriver`. Then `bun run check-filters` and `bun run check-undo` (both must print "no request outside localhost").

## Open questions for the owner

1. The wiki: keep 30 days across visits (this audit recommends it), or session only as the brief reads? Owner decision.
2. Mapillary: 50 000 tiles per day per app is shared by all users. Off by default? Ask Mapillary for more? Who holds the token?
3. OSM tiles: keep them in the engine (recommended) or in the query cache? The query cache doubles the memory of the raw JSON.
4. Should OSM data ever persist between visits? This audit says no.
5. Wiki `Api-User-Agent`: a CORS preflight for a custom header. To be tested by a person in a draft, not by an agent against the wiki.
6. Layer probe: a size limit for GeoJSON that is downloaded only to check it. What number?
7. Notes: move the cells into the query cache, or keep the store with the gate (recommended)?
8. Retry policy: this audit proposes at most two retries and no retry on 4xx. Accept?
9. The pause for 429 and 509: Rapid uses Retry-After or 10 s; iD retries each tile after 8 s. Accept Rapid's behaviour?

## Not checked

- No browser checks were run, and no server was started or stopped. The counts in 5.9 are estimates from code, not measurements.
- The street-imagery hooks the dock calls (R14), and the photo viewers (R16), were not traced.
- iD's `ui/fields/wikidata.js` debounce and the combobox: not traced. iD's Mapillary and Panoramax error paths were read for the tile fetch only.
- Rapid's `MapillaryService.ts`, `GeoScribbleService.ts` and Wikipedia were not read in detail.
- Panoramax's rules: the docs read had no rate-limit statement; the `docs.panoramax.xyz` host had a certificate error.
- Wikidata's own REST and `wbsearchentities` limits: not fetched.
- TanStack Query `staleTime` default, focus and reconnect defaults, `networkMode` and request deduplication: from memory. The TanStack QueryClient page returned a server error.
- MapLibre `maxParallelImageRequests` default (16): from memory.
- OSM API policy numbers, and Nominatim's rule: from memory, to be confirmed by a person.
- Live mode (`?api=osm`, `?api=dev`) was not run. Dev-server behaviour was not tested, per AGENTS.md.
- The `reference.ts` file changed on disk during the audit (an `itemId` link was added). The audit reads the current version. The change adds a link only, not a request.
