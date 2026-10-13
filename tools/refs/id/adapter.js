/**
 * window.__bench for the iD reference (contract: tools/refs/bench-api.d.ts).
 *
 * Plain script, no build step. Loaded by index.html before iD itself. index.html calls
 * `window.__benchInstall(iD, context)` right after `context.init()` and
 * `window.__benchFail(error)` when iD cannot start.
 *
 * Nothing in here changes how iD draws. We only listen, and we wrap a handful of iD's own
 * listeners/methods to learn whether a throttled redraw is queued (see "Settled" below).
 * All line references are to iD v2.42.2.
 */
;(function () {
  'use strict'

  var THROTTLE_MS = 750 // modules/renderer/map.js:85  scheduleRedraw = throttle(redraw, 750)
  var WATCHDOG_SLACK_MS = 500
  var DEFAULT_SETTLE_TIMEOUT_MS = 30000

  var installed = null // set by install()
  var readyResolve, readyReject
  var readyPromise = new Promise(function (resolve, reject) {
    readyResolve = resolve
    readyReject = reject
  })
  readyPromise.catch(function () {}) // no unhandled rejection noise; callers of ready() still get it

  function need() {
    if (!installed) throw new Error('__bench: iD is not initialised yet, await __bench.ready() first')
    return installed
  }

  window.__bench = {
    editor: 'id',
    version: 'unknown',
    ready: function () {
      return readyPromise
    },
    setCamera: function (camera) {
      need().setCamera(camera)
    },
    getCamera: function () {
      return need().getCamera()
    },
    project: function (lng, lat) {
      return need().project(lng, lat)
    },
    settled: function (timeoutMs) {
      return readyPromise.then(function () {
        return installed.settled(timeoutMs)
      })
    },
    // iD has no work after the first picture that fetches data: drawn and settled are the same wait
    drawn: function () {
      return window.__bench.settled()
    },
    mapRect: function () {
      return need().mapRect()
    },
    stats: function () {
      return need().stats()
    },
    select: function (id) {
      return readyPromise.then(function () {
        return installed.select(id)
      })
    },
    selected: function () {
      return need().selected()
    },
    hovered: function () {
      return need().hovered()
    },
    nodeLoc: function (id) {
      return need().nodeLoc(id)
    },
    paint: function () {
      return need().paint()
    },
    setTag: function (id, key, value) {
      need().setTag(id, key, value)
    },
    undo: function () {
      need().undo()
    },
    redo: function () {
      need().redo()
    },
    inspectorShows: function (id) {
      return need().inspectorShows(id)
    },
  }

  window.__benchFail = function (error) {
    readyReject(error instanceof Error ? error : new Error(String(error)))
  }

  window.__benchInstall = function (iD, context) {
    var map = context.map()
    var osm = context.connection()
    var history = context.history()
    var tiler = iD.utilTiler()

    // ---------------------------------------------------------------------------------
    // Settled
    //
    // How iD gets a picture on screen (modules/renderer/map.js):
    //  - A camera change by gesture or animation goes through zoomPan() (map.js:455). It only sets a CSS transform on
    //    .supersurface, sets _isTransformed = true and calls scheduleRedraw(). The transform is
    //    reset by the next redraw() (resetTransform, map.js:628). So `map.isTransformed()`
    //    is exactly "the camera changed and no redraw has happened since".
    //  - redraw() (map.js:640) asks for data with context.loadTiles(), which defers to
    //    requestIdleCallback (core/context.ts:300) and then requests one z16 tile per
    //    /api/0.6/map.json call (services/osm.js:849). Each response is parsed, marked as
    //    loaded, merged into history (history.merge), and history emits `merge`, to which the
    //    map answers with scheduleRedraw() (map.js:128).
    //  - scheduleRedraw is es-toolkit's throttle with leading and trailing edge. Read from
    //    node_modules/es-toolkit/dist/function/throttle.mjs + debounce.mjs: the first call runs
    //    redraw synchronously; a call within 750 ms is queued and the timer is RESTARTED by
    //    every further call, so the trailing redraw runs 750 ms after the LAST call, unless
    //    750 ms have passed since the last actual run, in which case the call runs
    //    synchronously. immediateRedraw() without arguments cancels a queued call (map.js:692).
    //  - Every run of drawEditable()/editOff() ends with the `drawn` event, {full: true}
    //    (map.js:391, 422). Vertex hover and the quick selection redraw emit {full: false}.
    //    Note that {full: true} is also emitted for an edit that only redraws a difference.
    //
    // We call the picture settled when ALL of these hold:
    //  1. !map.isTransformed()                 a redraw ran after the last camera change
    //  2. no throttled redraw is queued        tracked exactly, see `pending` below
    //  3. the OSM tile cache has no request in flight (services.osm.caches('get').tile.inflight)
    //  4. every z16 tile the current view needs is in tile.loaded. We compute the needed tiles
    //     the same way osm.loadTiles does, so this also covers the window in which the redraw
    //     ran but the idle callback that issues the requests has not.
    //     (3 and 4 are skipped below minEditableZoom / with the OSM layer off: iD loads nothing.)
    //  5. after 1-4 became true, the browser produced a frame (requestAnimationFrame, then a
    //     task after that frame's style/layout/paint) and 1-4 are still true with no draw or
    //     trigger in between.
    //
    // 2 in detail. The throttle is a closure we cannot read. But every scheduleRedraw() call
    // site is reachable from outside, so we wrap those and compare the count of complete draws
    // before and after the call: if the call did not draw synchronously, a trailing redraw is
    // queued (`pending = true`). A complete draw clears it, because every complete draw either
    // is the throttled call itself or (immediateRedraw without arguments) cancels it.
    //   - history `merge.map` listener (map.js:128)
    //   - context `enter.map` listener (map.js:250, "redraw everything else later")
    //   - map.centerZoom / map.zoom / map.center / map.dimensions (map.js:816-907). Without a
    //     duration these set the projection directly and call scheduleRedraw() once. zoomPan()
    //     returns early for them ("no change", map.js:463, because setTransform already moved
    //     _transformStart), so there is no CSS transform phase, no second call and
    //     isTransformed() stays false. Measured: setCamera() on an idle map draws synchronously
    //     inside the call; within 750 ms of the previous redraw it is queued instead.
    //   - zoomPan from real gestures and eased moves needs no wrapper: condition 1 covers it.
    // "Complete draw" = `drawn` {full: true} outside of a `change` dispatch that carried a
    // difference (those are partial redraws and do not cancel the throttle).
    // Watchdog: a queued call must run within 750 ms of the last trigger. Should iD swallow it
    // (redrawEnable(false), empty surface), `pending` is cleared 750+500 ms after the last
    // trigger and counted in counters.watchdogClears, so settled() cannot hang on our model.
    //
    // Not waited for: idle-time work that does not change the picture (validator,
    // features' match cache warm-up after merge, renderer/features.js:627).
    // ---------------------------------------------------------------------------------

    var counters = {
      completeDraws: 0,
      partialDraws: 0,
      hoverDraws: 0,
      merges: 0,
      triggers: 0,
      watchdogClears: 0,
      lastCompleteDrawAt: 0,
      lastMergeAt: 0,
      lastMoveAt: 0,
    }
    // every `drawn` event is one draw of the map (see `paint` in tools/refs/bench-api.d.ts)
    var paint = { seq: 0, at: 0 }
    var pending = false
    var partialDepth = 0
    var waiters = new Set()
    var lastSettle = null

    function notify() {
      waiters.forEach(function (check) {
        check()
      })
    }

    function markPending() {
      pending = true
      var stamp = ++counters.triggers
      setTimeout(function () {
        if (pending && counters.triggers === stamp) {
          pending = false
          counters.watchdogClears++
          notify()
        }
      }, THROTTLE_MS + WATCHDOG_SLACK_MS)
    }

    function transformKey() {
      var t = context.projection.transform()
      return t.x + '/' + t.y + '/' + t.k
    }

    map.on('drawn.bench', function (e) {
      paint.seq++
      paint.at = performance.now()
      if (!e || !e.full) counters.hoverDraws++
      else if (partialDepth > 0) counters.partialDraws++
      else {
        counters.completeDraws++
        counters.lastCompleteDrawAt = performance.now()
        pending = false
      }
      notify()
    })
    map.on('move.bench', function () {
      counters.lastMoveAt = performance.now()
      notify()
    })
    osm.on('loading.bench', notify)
    osm.on('loaded.bench', notify)

    // map methods that end with scheduleRedraw()
    ;['centerZoom', 'zoom', 'center'].forEach(function (name) {
      var original = map[name]
      map[name] = function () {
        if (!arguments.length) return original.apply(this, arguments) // getter
        var before = counters.completeDraws
        var result = original.apply(this, arguments)
        if (counters.completeDraws === before) markPending()
        notify()
        return result
      }
    })
    var originalDimensions = map.dimensions
    map.dimensions = function () {
      if (!arguments.length) return originalDimensions.apply(this, arguments)
      var before = counters.completeDraws
      var result = originalDimensions.apply(this, arguments)
      if (counters.completeDraws === before) markPending()
      notify()
      return result
    }

    // iD's own listeners that call scheduleRedraw() / do partial redraws. They are registered
    // when the UI renders (map.js:107), so this runs after ui.ensureLoaded() and is re-checked
    // by every settled() call in case iD re-rendered and replaced them.
    var wrapped = {}
    function wrapListener(target, key, type, makeWrapper) {
      var current = target.on(type)
      if (!current || current === wrapped[key]) return !!current
      wrapped[key] = makeWrapper(current)
      target.on(type, wrapped[key])
      return true
    }
    function partialAware(original) {
      return function (difference, extent) {
        var partial = !!(difference || extent)
        if (partial) partialDepth++
        try {
          return original.apply(this, arguments)
        } finally {
          if (partial) partialDepth--
        }
      }
    }
    function ensureWrapped() {
      var ok = wrapListener(history, 'merge', 'merge.map', function (original) {
        return function () {
          counters.merges++
          counters.lastMergeAt = performance.now()
          var before = counters.completeDraws
          var result = original.apply(this, arguments)
          if (counters.completeDraws === before) markPending()
          notify()
          return result
        }
      })
      ok =
        wrapListener(context, 'enter', 'enter.map', function (original) {
          return function () {
            // same early returns as the original (map.js:251-252): then nothing is scheduled
            var schedules = map.editableDataEnabled(true) && !map.isTransformed()
            var before = counters.completeDraws
            var result = original.apply(this, arguments)
            if (schedules && counters.completeDraws === before) markPending()
            notify()
            return result
          }
        }) && ok
      ok = wrapListener(history, 'historyChange', 'change.map', partialAware) && ok
      ok = wrapListener(context, 'contextChange', 'change.map', partialAware) && ok
      return ok
    }

    function neededTiles() {
      var z = osm.tileZoom()
      return tiler.zoomExtent([z, z]).getTiles(context.projection)
    }

    function state() {
      var editable = map.editableDataEnabled()
      var cache = osm.caches('get').tile
      var missing = []
      var needed = 0
      if (editable) {
        var tiles = neededTiles()
        needed = tiles.length
        for (var i = 0; i < tiles.length; i++) {
          if (!cache.loaded[tiles[i].id]) missing.push(tiles[i].id)
        }
      }
      return {
        transformed: map.isTransformed(),
        pendingRedraw: pending,
        inflight: Object.keys(cache.inflight).length,
        neededTiles: needed,
        missingTiles: missing,
        editable: editable,
      }
    }

    function isSettled(s) {
      return !s.transformed && !s.pendingRedraw && (!s.editable || (s.inflight === 0 && s.missingTiles.length === 0))
    }

    /** Runs cb in a task after the next frame's rendering steps. Falls back to a timer in a hidden tab (no rAF there). */
    function afterFrame(cb) {
      var called = false
      var once = function () {
        if (called) return
        called = true
        cb()
      }
      if (document.visibilityState === 'visible') {
        requestAnimationFrame(function () {
          var channel = new MessageChannel()
          channel.port1.onmessage = once
          channel.port2.postMessage(0)
        })
        setTimeout(once, 1000) // rAF can stall (occluded window); do not hang on it
      } else {
        setTimeout(once, 50)
      }
    }

    function settled(timeoutMs) {
      var limit = typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_SETTLE_TIMEOUT_MS
      var started = performance.now()
      return new Promise(function (resolve, reject) {
        var done = false
        var epoch = null // set while we wait for the frame
        var poll, timer

        function finish(error) {
          if (done) return
          done = true
          waiters.delete(check)
          clearInterval(poll)
          clearTimeout(timer)
          if (error) reject(error)
          else resolve()
        }

        function currentEpoch() {
          return counters.completeDraws + ':' + counters.partialDraws + ':' + counters.triggers + ':' + transformKey()
        }

        function check() {
          if (done) return
          var wrappedOk = ensureWrapped()
          var s = state()
          if (!wrappedOk || !isSettled(s)) {
            epoch = null
            return
          }
          var now = currentEpoch()
          if (epoch === now) return // already waiting for the frame of this state
          epoch = now
          var conditionsAt = performance.now()
          afterFrame(function () {
            if (done || epoch !== now) return
            if (currentEpoch() !== now || !isSettled(state())) {
              epoch = null
              check()
              return
            }
            lastSettle = {
              waitedMs: performance.now() - started,
              conditionsMetAfterMs: conditionsAt - started,
              lastCompleteDrawAt: counters.lastCompleteDrawAt,
              resolvedAt: performance.now(),
              state: s,
            }
            finish()
          })
        }

        waiters.add(check)
        poll = setInterval(check, 100) // safety net; everything relevant also calls notify()
        timer = setTimeout(function () {
          var s = state()
          finish(
            new Error(
              'iD did not settle within ' + limit + ' ms. ' +
                'transformed=' + s.transformed +
                ' pendingRedraw=' + s.pendingRedraw +
                ' inflight=' + s.inflight +
                ' missingTiles=' + s.missingTiles.length + '/' + s.neededTiles +
                (s.missingTiles.length ? ' [' + s.missingTiles.slice(0, 8).join(' ') + ']' : '') +
                ' editable=' + s.editable +
                ' listenersWrapped=' + ensureWrapped() +
                ' counters=' + JSON.stringify(counters) +
                ' camera=' + JSON.stringify(getCamera()),
            ),
          )
        }, limit)
        check()
      })
    }

    // ---------------------------------------------------------------------------------
    // Camera
    // ---------------------------------------------------------------------------------

    function setCamera(camera) {
      map.centerZoom([camera.lng, camera.lat], camera.zoom) // no animation (duration undefined)
    }

    function getCamera() {
      var center = map.center()
      return { lng: center[0], lat: center[1], zoom: map.zoom() }
    }

    function mapNode() {
      return context.container().select('.main-map').node()
    }

    /** context.projection gives pixels relative to .main-map (the element the map draws into). */
    function project(lng, lat) {
      var p = context.projection([lng, lat])
      var rect = mapNode().getBoundingClientRect()
      return { x: rect.left + p[0], y: rect.top + p[1] }
    }

    /** The map element iD draws into (`.main-map`), in viewport pixels: the sidebar and the bars are not in it. */
    function mapRectOf() {
      var rect = mapNode().getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }

    // ---------------------------------------------------------------------------------
    // Stats
    // ---------------------------------------------------------------------------------

    function count(root, selector) {
      return root ? root.querySelectorAll(selector).length : 0
    }

    function stats() {
      var entities = { nodes: 0, ways: 0, relations: 0 }
      // base graph = everything loaded from the API (we never edit)
      // The base graph's entities object keeps everything loaded from the API on its
      // prototype (osm/graph.js), so walk inherited keys too. We never edit, so base = all.
      var base = history.base().entities
      for (var id in base) {
        if (!base[id]) continue
        var c = id.charCodeAt(0)
        if (c === 110) entities.nodes++
        else if (c === 119) entities.ways++
        else if (c === 114) entities.relations++
      }

      var surface = mapNode().querySelector('svg.surface')
      var layer = surface && surface.querySelector('.data-layer.osm')
      var drawn = {
        // one per drawn entity (iD draws several elements per entity: shadow, casing, stroke ...)
        lines: count(layer, '.layer-osm.lines .line-stroke > path, .layer-osm.covered .line-stroke > path'),
        areas: count(layer, '.layer-osm.areas .area-stroke > path'),
        points: count(layer, '.layer-osm.points .points-group.points > g.point'),
        vertices: count(layer, '.layer-osm.points .points-group.vertices > g.vertex'),
        midpoints: count(layer, '.layer-osm.points .points-group.midpoints > g.midpoint'),
        labels: count(layer, '.layer-osm.labels .labels-group.label > *'),
        // raw DOM size
        linePaths: count(layer, '.layer-osm.lines path, .layer-osm.covered path'),
        areaPaths: count(layer, '.layer-osm.areas path'),
        touchTargets: count(surface, '.data-layer.touch *'),
        domNodesOsmLayer: count(layer, '*'),
        domNodes: count(surface, '*'),
      }

      var features = context.features()
      var featureStats = features.stats()
      var auto = features.autoHidden()
      var hidden = {}
      features.hidden().forEach(function (key) {
        // count = entities in the view that matched the hidden feature in the last draw
        hidden[(auto.indexOf(key) > -1 ? 'auto:' : 'off:') + key] = featureStats[key] || 0
      })
      return { entities: entities, drawn: drawn, hidden: hidden }
    }

    // ---------------------------------------------------------------------------------
    // Selection and hover
    // ---------------------------------------------------------------------------------

    function selected() {
      return context.selectedIDs().slice()
    }

    var ID_CLASS = /^[nwr]-?\d+$/
    function hovered() {
      var ids = new Set()
      var nodes = mapNode().querySelectorAll('svg.surface .hover')
      for (var i = 0; i < nodes.length; i++) {
        var classes = nodes[i].classList
        for (var j = 0; j < classes.length; j++) {
          if (ID_CLASS.test(classes[j])) ids.add(classes[j])
        }
      }
      return Array.from(ids)
    }

    /**
     * Uses iD's own mode switch (what a click ends up calling). iD draws the selection right
     * away in a partial redraw (map.js:250-279) and queues a full redraw for the rest; we
     * resolve after the frame with the partial redraw. Call settled() to wait for the rest.
     * If the map is mid-gesture iD skips the partial redraw, then we wait for settled().
     */
    function select(id) {
      ensureWrapped()
      if (id === null || id === undefined) {
        context.enter(iD.modeBrowse(context))
      } else {
        if (!context.hasEntity(id)) {
          return Promise.reject(new Error('__bench.select: iD has not loaded entity "' + id + '"'))
        }
        context.enter(iD.modeSelect(context, [id]))
        var now = context.selectedIDs()
        if (now.length !== 1 || now[0] !== id) {
          return Promise.reject(new Error('__bench.select: iD refused to select "' + id + '", selected: [' + now.join(',') + ']'))
        }
      }
      if (map.isTransformed()) return settled()
      return new Promise(function (resolve) {
        afterFrame(resolve)
      })
    }

    // ---------------------------------------------------------------------------------

    /**
     * Current position of a node in the graph iD draws and edits (context.graph(), the head
     * graph), so a drag shows up here as soon as iD has applied the move.
     */
    function nodeLoc(id) {
      var entity = context.hasEntity(id)
      if (!entity || entity.type !== 'node' || !entity.loc) return undefined
      return [entity.loc[0], entity.loc[1]]
    }

    /**
     * One tag through iD's own edit path: context.perform with the same action the raw tag editor uses
     * (modules/actions/change_tags.ts), with the annotation that makes it one undo step. iD's change_tags action takes
     * the whole tag set, so the new set is the old one with the key changed. A change that leaves the tags as they are
     * is still performed by iD, and nothing is drawn for it.
     */
    function setTag(id, key, value) {
      need()
      var entity = context.hasEntity(id)
      if (!entity) throw new Error('__bench.setTag: iD has not loaded entity "' + id + '"')
      var tags = Object.assign({}, entity.tags)
      if (value === undefined || value === '') delete tags[key]
      else tags[key] = value
      context.perform(iD.actionChangeTags(id, tags), 'Changed tags')
    }

    // iD's own undo and redo (the same functions the toolbar buttons and the shortcuts call)
    function undo() {
      need()
      context.undo()
    }
    function redo() {
      need()
      context.redo()
    }

    /**
     * The inspector holds the editor of this feature. iD's sidebar keeps `inspector-wrap` hidden while nothing is
     * selected (sidebar.js:158, :230-250) and fills `.entity-editor` when a feature is selected. The check reads the
     * DOM, not the pixels: this adapter collapses the sidebar at start-up, and iD expands it only for new features
     * (sidebar.js:282), so a selected feature counts as shown while the sidebar stays collapsed.
     */
    function inspectorShows(id) {
      if (selected().indexOf(id) === -1) return false
      var wrap = document.querySelector('.inspector-wrap')
      return !!wrap && !wrap.classList.contains('inspector-hidden') && !!wrap.querySelector('.entity-editor')
    }

    var api = {
      setCamera: setCamera,
      getCamera: getCamera,
      project: project,
      mapRect: mapRectOf,
      settled: settled,
      stats: stats,
      select: select,
      selected: selected,
      hovered: hovered,
      nodeLoc: nodeLoc,
      paint: function () {
        return { seq: paint.seq, at: paint.at }
      },
      setTag: setTag,
      undo: undo,
      redo: redo,
      inspectorShows: inspectorShows,
    }

    window.__bench.version = context.version
    // Extras for debugging and for NOTES.md, not part of the contract.
    window.__bench._id = {
      context: context,
      state: state,
      counters: counters,
      lastSettle: function () {
        return lastSettle
      },
      features: function () {
        var f = context.features()
        return { stats: Object.assign({}, f.stats()), hidden: f.hidden(), autoHidden: f.autoHidden(), disabled: f.disabled() }
      },
    }

    /**
     * The map has to fill the viewport in every editor, so the sidebar is collapsed at startup.
     * This sets exactly the end state of iD's own sidebar.toggle() (ui/sidebar.js:356-403:
     * width in px, negative margin of the same size, class `collapsed`) without its 250 ms
     * transition, then lets iD re-measure (ui.onResize) and puts the camera back, because
     * onResize keeps the top-left corner fixed, not the center. It runs in the same microtask
     * chain as iD's first render, before the idle callback that requests the first tiles, so
     * no tile is requested for the narrower map. iD's own toggle (key `) still works afterwards.
     */
    function collapseSidebar() {
      var sidebar = context.container().select('.sidebar')
      if (sidebar.empty() || sidebar.classed('collapsed')) return
      var camera = getCamera()
      var width = sidebar.node().getBoundingClientRect().width
      sidebar
        .style('width', width + 'px')
        .style('margin-left', -width + 'px')
        .classed('collapsed', true)
      context.ui().onResize()
      map.centerZoom([camera.lng, camera.lat], camera.zoom)
    }

    context
      .ui()
      .ensureLoaded()
      .then(function () {
        collapseSidebar()
        if (!ensureWrapped()) throw new Error('__bench: could not find the iD map listeners to wrap (merge.map, enter.map, change.map)')
        installed = api
        readyResolve()
      })
      .catch(function (error) {
        window.__benchFail(error)
      })
  }
})()
