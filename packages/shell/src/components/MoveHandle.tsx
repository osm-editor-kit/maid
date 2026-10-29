import { device } from '@osm-editor-kit/maid-i18n'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Marker } from 'react-map-gl/maplibre'
import { useSelection } from '../selection'
import { useEngine, useShell } from '../shell-context'
import { moveHandleAnchor, type Bounds, type HandleShape, type Loc } from './move-handle'

/**
 * The move handle of a touch device: a round button by the selected feature that moves the whole feature when it is
 * dragged, as GoMap's and FMC's react-map-gl-draw (`moveBy: 'handle'`). With a mouse there is M (iD's move); a finger
 * has no M, and a drag on a way pans the map. Where it sits: move-handle.ts.
 *
 * The drag is the editor's move (`engine.setMode('move')`, iD's actionMove through transform.ts): the ways that share
 * a node with the feature keep their shape, and the move is one undo step. The handle is placed by a react-map-gl
 * Marker and follows the feature as it moves.
 */
export function MoveHandle() {
  const [dragging, setDragging] = useState(false)
  const { zoom, bounds } = useView(useEngine((e) => e.map))
  // the selection is the address's (selection.ts): a change of it alone is no change of the engine's data
  const { ids } = useSelection()
  const anchor = useEngine((engine) => {
    if (device().input !== 'touch') return undefined
    // while dragging the mode is `move`: the handle stays, or the drag would end with it
    if (!dragging && engine.mode !== 'browse') return undefined
    if (engine.measuring || engine.moduleMode) return undefined
    if (ids.length !== 1 || engine.isReadOnly(ids[0]!)) return undefined
    const shape = shapeOf(engine, ids[0]!, zoom)
    return shape && moveHandleAnchor(shape, bounds)
  })
  if (!anchor) return null
  return (
    <Marker
      longitude={anchor.lon}
      latitude={anchor.lat}
      // above a vertex the handle keeps its distance; inside an area it sits on the spot
      anchor={anchor.placement === 'above' ? 'bottom' : 'center'}
      offset={anchor.placement === 'above' ? [0, -12] : [0, 0]}
    >
      <HandleButton onDragging={setDragging} />
    </Marker>
  )
}

/**
 * The button and its drag. The drag is the button's own, with native listeners: the map's container gets an event
 * before React does (React listens at the root, above the map), so only a native listener on the button keeps the
 * map from panning and from selecting what is under the finger. MapLibre's draggable Marker was not used for that
 * reason: a tap on it reached Maid's selection too.
 */
function HandleButton({ onDragging }: { onDragging: (dragging: boolean) => void }) {
  const { engine } = useShell()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const button = ref.current
    const map = engine.map
    if (!button || !map) return
    let pointer: number | undefined
    const lngLatOf = (event: PointerEvent) => {
      const box = map.getContainer().getBoundingClientRect()
      return map.unproject([event.clientX - box.left, event.clientY - box.top])
    }
    const stop = (event: Event) => event.stopPropagation()
    const down = (event: PointerEvent) => {
      event.stopPropagation()
      event.preventDefault()
      if (pointer !== undefined || !engine.setMode('move')) return
      pointer = event.pointerId
      button.setPointerCapture(event.pointerId)
      onDragging(true)
      // the first position is where the move starts from (transform.ts)
      const at = lngLatOf(event)
      engine.transform.move(at.lng, at.lat)
    }
    const move = (event: PointerEvent) => {
      event.stopPropagation()
      if (event.pointerId !== pointer) return
      const at = lngLatOf(event)
      engine.transform.move(at.lng, at.lat)
    }
    const up = (event: PointerEvent) => {
      event.stopPropagation()
      if (event.pointerId !== pointer) return
      pointer = undefined
      if (event.type === 'pointercancel') engine.transform.cancel()
      else {
        const at = lngLatOf(event)
        engine.transform.move(at.lng, at.lat)
      }
      // leaving the mode keeps the move as one undo step (transform.ts finish); the feature stays selected
      engine.setMode('browse')
      onDragging(false)
    }
    const touchEvents = ['touchstart', 'touchmove', 'touchend', 'mousedown', 'click', 'dblclick']
    for (const type of touchEvents) button.addEventListener(type, stop)
    button.addEventListener('pointerdown', down)
    button.addEventListener('pointermove', move)
    button.addEventListener('pointerup', up)
    button.addEventListener('pointercancel', up)
    return () => {
      for (const type of touchEvents) button.removeEventListener(type, stop)
      button.removeEventListener('pointerdown', down)
      button.removeEventListener('pointermove', move)
      button.removeEventListener('pointerup', up)
      button.removeEventListener('pointercancel', up)
    }
  }, [engine, onDragging])

  return (
    <div
      ref={ref}
      role="button"
      aria-label="Move feature"
      className="grid size-11 cursor-grab touch-none place-items-center rounded-full bg-white text-zinc-800 shadow-md ring-1 ring-zinc-950/10 select-none active:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10 dark:active:bg-zinc-700"
    >
      <svg
        className="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" />
      </svg>
    </div>
  )
}

/** The selected feature as move-handle.ts needs it; undefined for a relation or a feature not loaded */
function shapeOf(engine: MaidEngine, id: string, zoom: number): HandleShape | undefined {
  const { data } = engine
  if (id.startsWith('n')) {
    const loc = data.node(id)?.loc
    return loc ? { kind: 'point', loc: [loc[0], loc[1]] } : undefined
  }
  if (!id.startsWith('w')) return undefined
  const way = data.way(id)
  if (!way) return undefined
  const locs: Loc[] = []
  for (const nodeId of way.nodes) {
    const loc = data.node(nodeId)?.loc
    if (loc) locs.push([loc[0], loc[1]])
  }
  if (locs.length < 2) return undefined
  if (!way.isArea()) return { kind: 'line', locs }
  return { kind: 'area', ring: locs, screenSize: screenSize(locs, zoom) }
}

/** The larger side of the box of these positions on screen, in CSS px (Web Mercator, 512 px tiles) */
function screenSize(locs: readonly Loc[], zoom: number) {
  const world = 512 * 2 ** zoom
  const x = (lon: number) => ((lon + 180) / 360) * world
  const y = (lat: number) =>
    ((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * world
  const xs = locs.map((loc) => x(loc[0]))
  const ys = locs.map((loc) => y(loc[1]))
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}

/**
 * The map's zoom and box, read again when a move ends: an area's size on screen changes with the zoom, and the handle
 * keeps to what is in view. Read as one string, so that the snapshot is the same value until the view changes.
 */
function useView(map: MapLibreMap | undefined | null): {
  zoom: number
  bounds: Bounds | undefined
} {
  const key = useSyncExternalStore(
    (notify) => {
      map?.on('moveend', notify)
      return () => map?.off('moveend', notify)
    },
    () => (map ? [map.getZoom(), ...map.getBounds().toArray().flat()].join(',') : ''),
  )
  if (!key) return { zoom: 0, bounds: undefined }
  const [zoom = 0, west = 0, south = 0, east = 0, north = 0] = key.split(',').map(Number)
  return { zoom, bounds: [west, south, east, north] }
}
