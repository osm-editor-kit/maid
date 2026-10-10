/**
 * `window.__bench` for Rapid 3 (bhousel/Rapid). Contract: tools/refs/bench-api.d.ts.
 * Background and verification: tools/refs/rapid/NOTES.md.
 *
 * Plain script, no build step. It reaches into a few of Rapid's protected fields
 * (`_appPending` and friends). The Rapid bundle does not mangle property names, and the
 * commit is pinned, so that is stable. Every such access is in `blockers()` or `stats()`.
 */
;(function () {
  'use strict'

  const config = window.__benchConfig
  const query = new URLSearchParams(location.search)
  const sceneName = query.get('scene') || 'small'
  const scene = config.scenes.find((s) => s.name === sceneName)
  const apiRoot = `${config.mockApi}/s/${sceneName}`
  // Rapid's validation runs in the background after every load. Off unless `?validation=1`.
  const validationOn = query.get('validation') === '1'

  /** @type {any} */ let context = null
  /** @type {any} */ let sys = null
  let seq = 0 // one counter orders draws, merges and camera changes
  const seen = { draw: 0, merge: 0, camera: 0, select: 0 }
  const lastSettle = { ms: 0, pictureMs: 0, frames: 0 }

  let resolveReady, rejectReady
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  readyPromise.catch(() => {}) // the caller of ready() gets the rejection; avoid an unhandled one

  function fail(message) {
    const error = new Error(`[bench rapid] ${message}`)
    document.documentElement.dataset.benchError = error.message
    rejectReady(error)
    throw error
  }

  // ---------------------------------------------------------------- start-up

  const refused = {}
  const refusedSamples = []
  const allowedOrigins = new Set([location.origin, new URL(config.mockApi).origin])
  function isLocal(url) {
    try {
      const parsed = new URL(String(url), location.href)
      return parsed.protocol === 'data:' || parsed.protocol === 'blob:' || allowedOrigins.has(parsed.origin)
    } catch {
      return false
    }
  }
  function refuse(url) {
    let host = 'invalid-url'
    try {
      host = new URL(String(url), location.href).host
    } catch {}
    refused[host] = (refused[host] ?? 0) + 1
    // Without the query string: Rapid's imagery URLs carry vendor access tokens.
    if (refusedSamples.length < 50) refusedSamples.push(String(url).split('?')[0].slice(0, 200))
    const error = new Error(`[bench rapid] refused request to ${host}: the reference runs offline`)
    error.name = 'BenchOfflineError'
    return Promise.reject(error)
  }

  if (!scene) fail(`Unknown scene "${sceneName}". Known: ${config.scenes.map((s) => s.name).join(', ')}`)

  // Rapid reads its parameters from the URL fragment at init. Keep what the caller passed,
  // default the camera to the scene centre, and always switch the imagery off:
  // `background=none` is Rapid's built-in empty source, so no imagery tile is requested
  // and only OSM data is drawn. `datasets`, `note`, `photo_overlay`, `maproulette` and
  // `walkthrough` are removed so that no caller can switch an external layer on.
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
  if (!hash.has('map')) hash.set('map', `17/${scene.center[1]}/${scene.center[0]}`)
  hash.set('background', 'none')
  hash.set('locale', 'en') // same UI language in every editor, whatever the browser prefers
  for (const key of ['datasets', 'note', 'photo_overlay', 'photo', 'detection', 'maproulette', 'walkthrough', 'data', 'gpx', 'overlays']) {
    hash.delete(key)
  }
  history.replaceState(null, '', `${location.pathname}${location.search}#${decodeURIComponent(hash.toString())}`)

  // Every run starts from Rapid's defaults: no stored settings, no edit backup (which would
  // open the "restore your changes" dialog), no remembered imagery. This origin only ever
  // serves Rapid, so clearing all of it is safe.
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {}

  const script = document.createElement('script')
  // The same bundle Rapid's own index.html loads. WorkerSystem derives the worker URL
  // from this URL: js/rapid-worker.min.js.
  script.src = 'js/rapid.min.js'
  script.onload = () => start().then(resolveReady, (e) => {
    document.documentElement.dataset.benchError = String(e?.message ?? e)
    rejectReady(e)
  })
  script.onerror = () => fail('js/rapid.min.js did not load. Run: bun tools/refs/rapid/setup.ts')
  document.head.appendChild(script)

  /** Milliseconds since navigation start at which each start-up step finished. */
  const boot = { scriptRequested: Math.round(performance.now()) }
  const mark = (name) => (boot[name] = Math.round(performance.now()))

  async function start() {
    mark('scriptLoaded')
    const Rapid = window.Rapid
    context = new Rapid.Context()
    window.rapidContext = context
    context.containerNode = document.getElementById('rapid-container')

    // Assets from this origin only. With 'local', the four assets that default to
    // cdn.jsdelivr.net resolve to data/modules/* (serve.ts maps those to node_modules).
    context.assetPath = ''
    context.assetOrigin = 'local'

    // OsmService is constructed with openstreetmap.org as its default roots but sends
    // nothing in its constructor or initAsync. Context.initAsync applies `preauth` through
    // osm.switchAsync() after all services are initialised and before any is started, so
    // the first OSM request (GET /api/capabilities.json, from switchAsync) already goes to
    // the mock. No access_token: Rapid stays logged out and never asks for user details.
    context.preauth = { url: apiRoot, apiUrl: apiRoot }
    context.apiConnections = [{ id: 'mock', url: apiRoot, apiUrl: apiRoot }]

    await context.prepareAsync()
    mark('prepared')

    // --- Keep Rapid offline -------------------------------------------------------------
    // (1) A guard at Rapid's two exits. Almost every request goes through NetworkSystem
    //     (fetch / fetchEnvelope / fetchRaw; the worker only fetches what NetworkSystem
    //     dispatches to it). A few places call the global fetch directly. Both now refuse
    //     anything that is not this origin or the mock API, before a request exists.
    //     Refused URLs are counted in `__benchRapid.refused` (host -> count).
    const network = context.systems.network
    for (const method of ['fetch', 'fetchEnvelope', 'fetchRaw']) {
      const original = network[method].bind(network)
      network[method] = (url, options) => (isLocal(url) ? original(url, options) : refuse(url))
    }
    const nativeFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input?.url ?? String(input))
      return isLocal(url) ? nativeFetch(input, init) : refuse(url)
    }

    // (2) Start-up code that would otherwise fail on such a refusal, or retry forever:
    const { esri, overture, taginfo, wayback } = context.services
    //  - EsriService.initAsync fetches its dataset catalogue from openstreetmap.maps.arcgis.com
    //    (an Esri host, despite the name); a failure rejects Rapid's whole start-up. The
    //    fetch is guarded by `_datasetsPromise`, so pre-resolving it skips it.
    if (esri) esri._datasetsPromise = Promise.resolve(esri._datasets)
    //  - OvertureService.initAsync fetches stac.overturemaps.org. No guard; replace the loader.
    if (overture) overture._loadStacCatalogAsync = () => Promise.resolve()
    //  - TaginfoService.startAsync fetches the popular keys from taginfo.openstreetmap.org
    //    (OSM infrastructure) and rejects start-up on failure. Mark it started instead.
    if (taginfo) {
      taginfo._startPromise = Promise.resolve()
      taginfo._started = true
    }
    //  - The background pane asks WaybackService for imagery dates at the map centre
    //    (wayback.maptiles.arcgis.com) and asks again after every draw until it has an answer.
    if (wayback) wayback.getLocalDatesAsync = () => Promise.resolve(wayback.allDates)
    if (query.get('nsi') === '0') delete context.services.nsi // not the default, see ready below
    // Everything else that can call out is off by default and stays off: notes, QA layers
    // (KeepRight, Osmose, MapRoulette, GeoScribble) and photo layers (Mapillary, KartaView,
    // Streetside) have `autoStart = false` and are only started when their layer is enabled;
    // Nominatim, Wikidata, Wikipedia and the OSM wiki are only asked from sidebar fields.

    await context.initAsync()
    mark('initialised')

    // --- Background work that does not draw -------------------------------------------
    // Validation (ValidationSystem, pinned at modules/core/ValidationSystem.ts) validates every
    // merged tile in the scheduler's idle queue, 5 to 25 s on medium, and our editor has no
    // validator to compare with. Off by default; `?validation=1` keeps it. Replaced on the
    // instance, before the first tile can merge (tiles load in APP, which needs startAsync):
    //  - 'merge' listener -> _validateBaseEntitiesAsync (registered in initAsync, line ~180)
    //  - 'stablechange' listener -> validateAsync (the listener calls `this.validateAsync()`
    //    at call time, so the instance property is used; also UI toggles, line ~539/553)
    //  - _validateEntitiesAsync is the only job queue (line ~760); the RETRY timer and
    //    revalidateUnsquare go through it too, so it is replaced as well.
    // The `validator.disabledRules` setting would not do this: it only filters getIssues
    // (lines ~327-328) and _validateEntity (line ~705) still runs every validator.
    const validator = context.systems.validator
    if (validator && !validationOn) {
      const skip = () => Promise.resolve()
      validator._validateBaseEntitiesAsync = skip
      validator.validateAsync = skip
      validator._validateEntitiesAsync = skip
    }
    // Two timers in UiApiStatus (ui/UiApiStatus.ts:54 every 1 s, :61 every 90 s). They refresh the
    // API status chip in the footer. Nothing else reads that state except OsmService's rate limit,
    // which only an HTTP 429 sets, and the mock API never sends one. Cancelled. The UI re-renders
    // that remain (footer chips, URL hash, two panes) are listed in NOTES.md, not switched off.
    const scheduler = context.systems.scheduler
    if (scheduler) {
      scheduler.cancel('ui-check-rate-limit')
      scheduler.cancel('ui-check-api-status')
    }

    // Mark the welcome/privacy and the what's-new dialog as seen, so that UiSystem.startAsync
    // opens neither. (The walkthrough only starts from the welcome dialog or `walkthrough=true`.)
    const settings = context.systems.settings
    settings.set('ui.sawPrivacyVersion', String(context.privacyVersion))
    settings.set('ui.sawWhatsNewVersion', String(context.whatsNewVersion))
    // Start with the sidebar collapsed, through Rapid's own preference (UiSidebar reads it
    // when it first renders), so that the map fills the whole viewport like in the other
    // editors. Rapid does not expand it on selection (Rapid#1562).
    settings.set('ui.inspector.collapsed', 'true')
    // Rapid/Overture/Esri datasets: keep the menu empty and nothing enabled.
    settings.set('rapid.addedDatasetIDs', [])
    settings.set('rapid.enabledDatasetIDs', [])
    const rapid = context.systems.rapid
    if (rapid) {
      rapid.addedDatasetIDs = new Set()
      if (rapid.enabledDatasetIDs instanceof Set) rapid.enabledDatasetIDs = new Set()
    }

    // ImagerySystem switches the "locator overlay" (place names, raster tiles from
    // api.mapbox.com) on by default when it loads the imagery index during initAsync,
    // independent of `background=none`. Switch every overlay off before anything is
    // drawn: only OSM data is to be shown, and nothing is to be fetched.
    const imagery = context.systems.imagery
    for (const source of imagery.overlayLayerSources()) imagery.toggleOverlayLayer(source)

    if (query.has('profile')) {
      // ?profile: when each system's and service's startAsync resolved (ms since navigation start)
      boot.parts = {}
      for (const [id, part] of [...Object.entries(context.systems), ...Object.entries(context.services)]) {
        if (!part?.autoStart) continue
        const original = part.startAsync.bind(part)
        part.startAsync = () => {
          const promise = original()
          if (!(id in boot.parts)) {
            boot.parts[id] = null
            promise.then(() => (boot.parts[id] = Math.round(performance.now())), () => {})
          }
          return promise
        }
      }
    }
    // ready() waits for the whole of Context.startAsync, and has to: UrlHashSystem emits its
    // first `hashchange` (which puts the map at `map=`) only after context.startAsync() has
    // resolved. Until then the map sits at zoom 1 and a camera set earlier would be overwritten.
    // About 2.5 s of this is NsiService.startAsync loading and indexing the
    // name-suggestion-index (7 JSON files); all other systems and services are up ~0.1 s
    // after initAsync. `?nsi=0` removes that service to show the difference; the default
    // keeps it, because that is how Rapid starts.
    await context.startAsync()
    mark('started')
    for (const source of imagery.overlayLayerSources()) imagery.toggleOverlayLayer(source) // should be none left

    sys = context.systems
    sys.gfx.on('draw', () => (seen.draw = ++seq))
    sys.editor.on('merge', () => (seen.merge = ++seq))
    seen.camera = ++seq
  }

  // ------------------------------------------------------------------ settle

  /**
   * What still stands between now and a final picture. Empty array = nothing.
   *
   * How Rapid gets data on screen (all verified in the source at the pinned commit):
   *  1. GraphicsSystem._tick runs once per animation frame from SchedulerSystem. A tick does
   *     either DRAW (if `_drawPending`) or APP (if `_appPending` and the 250 ms THROTTLE since
   *     the last DRAW has passed), never both. APP = PixiScene.render (build the scene);
   *     DRAW = pixi.render (WebGL) and then `emit('draw')`.
   *  2. APP calls PixiLayerOsm.render -> context.loadTiles() -> OsmService.loadTiles, which
   *     requests every z16 tile of the view that is neither completed nor in flight, as
   *     NetworkSystem requests named `osm-data-tile-<x,y,z>`. `_tileCache.lastv` remembers
   *     the viewport version it ran for.
   *  3. Fetch and parse happen in a worker. The result is handed back through a
   *     scheduler task of priority 'normal'; only then does the request leave
   *     NetworkSystem's in-flight map. Its callback runs EditSystem.merge (synchronous,
   *     `emit('merge')`) and gfx.deferredRedraw() (`_appPending = true`).
   *  4. Label text is rasterised outside of render: PixiLayerLabels queues `_pendingRasters`,
   *     a scheduler task drains them and calls immediateRedraw(). Icons are rasterised
   *     through an <img> load per icon (`PixiTextures._svgIcons` holds null while pending)
   *     and then call deferredRedraw().
   *
   * So the picture is final when all of this holds:
   *  - gfx is started and the pattern textures are loaded (APP is a no-op before that);
   *  - no APP and no DRAW is pending, no camera ease runs, no temporary CSS transform is
   *    applied, and the last DRAW used the current camera (`_prevTransform`);
   *  - at data zoom (>= 15): loadTiles ran for the current viewport version, every tile it
   *    needs is completed, and no `osm-data-tile` request is in flight;
   *  - no worker request is pending (a parsed tile waiting to be merged);
   *  - the scheduler's urgent and normal queues are empty (merge hand-over, label raster drain);
   *  - (unless `includeIdle` is false) the scheduler's idle queue is empty and no one-shot
   *    scheduler timer is pending. That is where Rapid validates merged data and re-renders
   *    sidebar panes. It does not change the map, but it is queued work that would compete
   *    with whatever is measured next, and it takes seconds: see `lastSettle.pictureMs`
   *    for when the picture alone was final;
   *  - no label raster and no icon image is pending;
   *  - the last DRAW came after the last merge and after the last camera/selection change.
   */
  function blockers(includeIdle = true) {
    const { gfx, network, worker, scheduler } = sys
    const viewport = context.viewport
    const osm = context.services.osm
    const out = []

    if (!gfx._started) out.push('gfx not started')
    if (gfx._paused) out.push('gfx paused')
    if (!gfx.textureManager?.loaded) out.push('pattern textures not loaded')
    if (gfx._appPending) out.push('app pending (scene prep, throttled 250ms)')
    if (gfx._drawPending) out.push('draw pending')
    if (gfx._transformEase) out.push('camera ease running')
    if (gfx._isTempTransformed) out.push('temporary CSS transform applied')

    const drawn = gfx._prevTransform
    const now = viewport.transform.props
    if (!drawn || drawn.x !== now.x || drawn.y !== now.y || drawn.z !== now.z || drawn.r !== now.r) {
      out.push('last draw used another camera')
    }

    const osmLayer = gfx.scene?.layers.get('osm')
    if (osmLayer?.enabled && osm?.started && now.z >= 15) {
      if (osm._paused) out.push('osm service paused')
      if (osm.getRateLimit?.()) out.push('osm service rate limited')
      if (osm._tileCache.lastv !== viewport.v) {
        out.push('tiles not yet requested for this view')
      } else {
        const tiles = osm._tiler.zoomRange(osm._tileZoom).getTiles(viewport).tiles
        const missing = tiles.filter((tile) => !network.isCompleted(`osm-data-tile-${tile.id}`))
        if (missing.length) out.push(`${missing.length}/${tiles.length} osm tiles not completed`)
      }
    }
    let inflight = 0
    for (const id of network._inflight.keys()) if (String(id).startsWith('osm-data-tile')) inflight++
    if (inflight) out.push(`${inflight} osm tile requests in flight`)

    if (worker?.numPendingRequests) out.push(`${worker.numPendingRequests} worker requests pending`)
    if (scheduler._urgentQueue.length) out.push(`${scheduler._urgentQueue.length} urgent tasks queued`)
    if (scheduler._normalQueue.length) out.push(`${scheduler._normalQueue.length} normal tasks queued`)
    if (includeIdle && scheduler._idleQueue.length) out.push(`${scheduler._idleQueue.length} idle tasks queued`)
    if (includeIdle) {
      // One-shot timers (debounce, throttle, timeout) put work into the queues when they fire,
      // for example the validation and sidebar re-renders 0.5-1 s after a merge or draw.
      // Rapid's two permanent intervals (rate-limit countdown every 1 s, API status every
      // 90 s) never end and are not counted.
      const timers = [...scheduler._timers.values()].filter((timer) => timer.type !== 'interval')
      if (timers.length) out.push(`${timers.length} scheduler timers pending (${timers.map((timer) => timer.workID).slice(0, 4).join(', ')})`)
    }

    const labels = gfx.scene?.layers.get('labels')
    if (labels?._pendingRasters?.size) out.push(`${labels._pendingRasters.size} label rasters pending`)
    if (labels?._rasterDrainScheduled) out.push('label raster drain scheduled')
    let icons = 0
    for (const value of gfx.textureManager?._svgIcons?.values() ?? []) if (value === null) icons++
    if (icons) out.push(`${icons} icon images loading`)

    if (seen.draw < seen.merge) out.push('no draw since last merge')
    if (seen.draw < seen.camera) out.push('no draw since last camera change')
    if (seen.draw < seen.select) out.push('no draw since last selection change')
    return out
  }

  /**
   * Frames in a row that must be clean, with no draw or merge in between, before we resolve.
   * This is the only margin settled() adds. Everything else it waits for is Rapid's own work.
   */
  const QUIET_FRAMES = 2

  /**
   * Resolves when the picture is final (see blockers) and has stayed so for QUIET_FRAMES frames.
   *
   * The shortest possible wait after a camera change over loaded data is Rapid's own:
   * setCamera only sets `_appPending`; the APP pass runs once 250 ms (THROTTLE) of frames
   * with a pending APP have passed since the last DRAW, the DRAW follows one frame later,
   * then our 2 confirmation frames: about 250 + 3 * 16.7 = 300 ms at 60 Hz. A user's drag
   * or wheel goes through the same throttled path (MapInteractionBehavior -> map.pan /
   * map.transform -> gfx.setTransformAsync), so this is what a user sees too; in between
   * Rapid only moves the old picture with a CSS transform.
   *
   * @param {{ timeoutMs?: number, idle?: boolean }} [options]
   *   idle (default false): also wait until the scheduler's idle queue and its one-shot
   *   timers are empty. Rapid validates merged data and re-renders panes there. That does
   *   not change the map and takes from 1 s (a throttle after every draw) to tens of
   *   seconds (validation after loading), so it is not part of "settled"; use it to get a
   *   fully quiet app before measuring something else.
   */
  function settled(options = {}) {
    const timeoutMs = options.timeoutMs ?? 60000
    const includeIdle = options.idle === true
    const started = performance.now()
    return readyPromise.then(
      () =>
        new Promise((resolve, reject) => {
          let quiet = 0
          let frames = 0
          let seqAtQuiet = -1
          let pictureMs = 0
          let raf = 0
          const timer = setTimeout(() => {
            cancelAnimationFrame(raf)
            const why = blockers(includeIdle)
            reject(
              new Error(
                `[bench rapid] settled() timed out after ${timeoutMs}ms (${frames} frames; ` +
                  `${document.visibilityState === 'visible' ? '' : 'page is not visible, rAF does not run; '}` +
                  `still waiting on: ${why.length ? why.join('; ') : `${QUIET_FRAMES} quiet frames`})`
              )
            )
          }, timeoutMs)
          // Checked inside requestAnimationFrame: our callback is registered after Rapid's
          // for the same frame only by chance, so one clean frame proves little. Hence the
          // run of QUIET_FRAMES clean frames during which `seq` (draws, merges) must not move.
          const check = () => {
            frames++
            const why = blockers(includeIdle)
            if (!pictureMs && (includeIdle ? blockers(false) : why).length === 0) pictureMs = performance.now() - started
            if (why.length === 0 && (quiet === 0 || seqAtQuiet === seq)) {
              if (quiet === 0) seqAtQuiet = seq
              quiet++
            } else {
              quiet = 0
            }
            if (quiet >= QUIET_FRAMES) {
              clearTimeout(timer)
              Object.assign(lastSettle, { ms: performance.now() - started, pictureMs, frames })
              resolve()
            } else {
              raf = requestAnimationFrame(check)
            }
          }
          raf = requestAnimationFrame(check)
        })
    )
  }

  // ------------------------------------------------------------------ camera

  function need() {
    if (!sys) throw new Error('[bench rapid] not ready, await __bench.ready() first')
  }

  /** Jump without animation. Uses MapSystem.setMapParams with duration 0, the same call
   *  the URL hash uses. It does not force a redraw: Rapid's own 250 ms throttle applies. */
  function setCamera(camera) {
    need()
    const before = context.viewport.transform.props
    sys.map.setMapParams([camera.lng, camera.lat], camera.zoom, 0, 0)
    const after = context.viewport.transform.props
    // setMapParams does nothing when the camera is already there; then no draw will follow.
    if (before.x !== after.x || before.y !== after.y || before.z !== after.z || before.r !== after.r) seen.camera = ++seq
  }

  function getCamera() {
    need()
    const [lng, lat] = context.viewport.centerLoc()
    return { lng, lat, zoom: context.viewport.transform.zoom }
  }

  /**
   * viewport.project gives pixels inside Rapid's drawing surface. That surface is larger
   * than the visible map: `.main-map` clips it and the supersurface sits at -50px/-50px
   * (overscan, so that small pans do not show an empty edge). `.main-map` itself starts
   * right of the sidebar. offsetLeft/Top are layout values, so the temporary CSS transform
   * Rapid applies between redraws does not disturb them.
   */
  function project(lng, lat) {
    need()
    const [x, y] = context.viewport.project([lng, lat], true)
    const surface = sys.gfx.supersurface
    const rect = surface.parentElement.getBoundingClientRect()
    return { x: rect.left + surface.offsetLeft + x, y: rect.top + surface.offsetTop + y }
  }

  // ------------------------------------------------------------------- stats

  function stats() {
    need()
    const graph = sys.editor.staging.graph
    const entities = { nodes: 0, ways: 0, relations: 0 }
    const count = (map) => {
      for (const [id, entity] of map) {
        if (!entity) continue // deleted locally
        if (id[0] === 'n') entities.nodes++
        else if (id[0] === 'w') entities.ways++
        else if (id[0] === 'r') entities.relations++
      }
    }
    count(graph.base.entities)
    for (const [id, entity] of graph.local.entities) {
      if (entity && !graph.base.entities.has(id)) count([[id, entity]])
    }

    // One Pixi feature = one container. A way can have several (one per geometry part),
    // an area with a POI gets a polygon plus a pin. Only features that are visible and
    // attached to the scene count. Keys are `<layer>.<kind>`.
    const Rapid = window.Rapid
    const drawn = {}
    const add = (key) => (drawn[key] = (drawn[key] ?? 0) + 1)
    for (const [layerID, layer] of sys.gfx.scene.layers) {
      for (const feature of layer.features.values()) {
        if (!feature.visible || !feature.container?.parent) continue
        let kind
        if (layerID === 'labels') kind = 'labels'
        else if (feature instanceof Rapid.PixiFeaturePolygon) kind = 'polygons'
        else if (feature instanceof Rapid.PixiFeatureLine) kind = 'lines'
        else if (feature instanceof Rapid.PixiFeaturePoint) {
          const data = feature.data
          if (String(feature.id).includes('-midpoint-')) kind = 'midpoints'
          else if (layerID === 'osm' && data?.type === 'node') kind = data.geometry(graph) === 'vertex' ? 'vertices' : 'points'
          else if (layerID === 'osm') kind = 'areaPins'
          else kind = 'points'
        } else kind = 'other'
        add(`${layerID}.${kind}`)
      }
    }

    // FilterSystem counts, per filter, the entities in the scene that match it.
    // A filter that is switched off hides them (default: only `boundaries`).
    const hidden = {}
    for (const [filterID, stat] of Object.entries(sys.filters.getStats())) {
      if (!stat.enabled && stat.count > 0) hidden[filterID] = stat.count
    }
    return { entities, drawn, hidden }
  }

  // --------------------------------------------------------- select / hover

  /** Resolves after the DRAW that follows the selection change. */
  function select(id) {
    need()
    const before = context.selectedIDs().join(',')
    if (id === null) {
      context.enter('browse')
    } else {
      if (!sys.editor.staging.graph.hasEntity(id)) {
        return Promise.reject(new Error(`[bench rapid] select("${id}"): entity is not loaded`))
      }
      // The same call MapSystem.selectEntityID and the `id=` URL parameter use.
      context.enter('select-osm', { selection: { osm: [id] } })
      if (!context.selectedIDs().includes(id)) {
        return Promise.reject(new Error(`[bench rapid] select("${id}"): Rapid did not select it (mode ${context.mode?.id})`))
      }
    }
    if (context.selectedIDs().join(',') === before) return Promise.resolve()
    seen.select = ++seq
    // Entering a mode marks the affected features dirty; make sure an APP pass is queued
    // the way a click does it (immediateRedraw skips the throttle wait).
    sys.gfx.immediateRedraw()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        sys.gfx.off('draw', onDraw)
        reject(new Error(`[bench rapid] select("${id}"): no draw within 10s (${blockers().join('; ')})`))
      }, 10000)
      const onDraw = () => {
        if (seen.draw < seen.select) return
        clearTimeout(timer)
        sys.gfx.off('draw', onDraw)
        resolve()
      }
      sys.gfx.on('draw', onDraw)
    })
  }

  function selected() {
    need()
    return [...context.selectedIDs()]
  }

  /** Data ids carrying the 'hover' class on any layer (HoverBehavior sets it via scene.setClass). */
  function hovered() {
    need()
    const ids = new Set()
    for (const layer of sys.gfx.scene.layers.values()) {
      for (const id of layer.getDataWithClass('hover')) ids.add(id)
    }
    return [...ids]
  }

  /** [lng, lat] of a node in the staging graph (base plus edits), or undefined. */
  function nodeLoc(id) {
    need()
    const node = sys.editor.staging.graph.hasEntity(id)
    if (!node || node.type !== 'node') return undefined
    return [node.loc[0], node.loc[1]]
  }

  // ------------------------------------------------------------------ export

  window.__bench = {
    editor: 'rapid',
    version: `3.0.0-pre.2+${config.commit.slice(0, 9)}`,
    ready: () => readyPromise,
    setCamera,
    getCamera,
    project,
    settled,
    stats,
    select,
    selected,
    hovered,
    nodeLoc,
  }

  /** Rapid-only extras for debugging and for NOTES.md. Not part of the contract. */
  window.__benchRapid = {
    scene: sceneName,
    apiRoot,
    blockers: () => (sys ? blockers() : ['not ready']),
    /** host -> number of requests the offline guard refused inside the page */
    refused,
    refusedSamples,
    lastSettle,
    boot,
    seen,
    /** Whether Rapid's validation was left on (`?validation=1`). */
    validation: validationOn,
    /**
     * Issues Rapid's validator holds, by severity (ValidationSystem.getIssuesBySeverity, which
     * reads the caches of the base and head graphs). Zero when validation is off.
     */
    issues: () => {
      need()
      const groups = context.systems.validator?.getIssuesBySeverity({
        what: 'all',
        where: 'all',
        includeIgnored: true,
        includeDisabledRules: true,
      })
      const counts = {
        error: groups?.error.length ?? 0,
        warning: groups?.warning.length ?? 0,
        suggestion: groups?.suggestion.length ?? 0,
      }
      return { ...counts, total: counts.error + counts.warning + counts.suggestion }
    },
    /** Rapid's own frame metrics (SchedulerSystem.metrics). */
    metrics: () => sys?.scheduler.metrics,
    /** Rapid's own `app-N` / `draw-N` performance measures. */
    measures: () =>
      performance
        .getEntriesByType('measure')
        .filter((m) => /^(app|draw)-\d+$/.test(m.name))
        .map((m) => ({ name: m.name, start: m.startTime, duration: m.duration })),
    renderer: () => {
      const gl = sys?.gfx.pixi?.renderer?.gl
      if (!gl) return { type: sys?.gfx.pixi?.renderer?.name ?? 'unknown' }
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      return {
        type: sys.gfx.pixi.renderer.name,
        version: gl.getParameter(gl.VERSION),
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      }
    },
  }
})()
