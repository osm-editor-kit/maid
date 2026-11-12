import { device, m } from '@osm-editor-kit/maid-i18n'
import type { MaidEngine, RotationInfo } from '@osm-editor-kit/maid-renderer'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { useEngine, useShell } from '../shell-context'

/** The handle's distance from the pivot: at least this, beyond the farthest node, and at most this share of the map */
const MIN_RADIUS = 72
const BEYOND_REACH = 44
const MAX_SHARE = 0.42

type Point = { x: number; y: number }

/**
 * Rotating on a touch screen. With a mouse R turns the selection with the pointer (transform.ts); a finger that moves
 * on the map pans it, and nothing showed what to touch. Here, while the mode is `rotate`:
 * - a round handle on a circle around the pivot, with a blue line to the pivot: dragging it around turns the
 *   selection by the handle's angle, wherever on the handle the finger started
 * - two fingers that turn turn the selection too, as in Go Map!!; the map keeps its bearing (MapView turns the map's
 *   touch rotation off in this mode), and a pinch still zooms
 * - a panel at the top centre, as Extrude's: a short hint, Cancel and Done. A tap on the map is Done as well.
 *
 * The angle is this component's: both gestures change it, and the engine gets a point at that angle around the pivot
 * (`engine.transform.move`), which is what a mouse would give. The first point given is the handle's start, so the
 * turn is the handle's angle less its start. For a point with a direction the handle starts where the direction
 * points, as R turns that tag to the pointer's bearing.
 */
export function RotateHandle() {
  // the device is fixed for the visit (device.ts): with a keyboard R follows the mouse
  return device().input === 'touch' ? <TouchRotate /> : null
}

function TouchRotate() {
  const { engine } = useShell()
  const rotation = useEngine((e) => (e.mode === 'rotate' ? e.transform.rotation : undefined))
  const map = engine.map
  if (!rotation || !map) return null
  // a new rotation starts with its own angle
  return <RotateGesture key={rotationKey(rotation)} engine={engine} map={map} rotation={rotation} />
}

const rotations = new WeakMap<RotationInfo, number>()
let nextRotation = 0
function rotationKey(rotation: RotationInfo) {
  let key = rotations.get(rotation)
  if (key === undefined) rotations.set(rotation, (key = nextRotation++))
  return key
}

/** The angle on screen (radians, clockwise from east, as y runs down) at which the handle starts */
export function startAngle(rotation: RotationInfo, mapBearing: number) {
  // a direction points at its bearing; anything else starts straight up
  const degrees = (rotation.directionDegrees ?? 0) - mapBearing - 90
  return (degrees * Math.PI) / 180
}

/** The handle's distance from the pivot on screen, in CSS px */
export function handleRadius(reach: number, zoom: number, size: { width: number; height: number }) {
  const reachPx = (reach * 512 * 2 ** zoom) / (2 * Math.PI)
  const most = Math.max(MIN_RADIUS, MAX_SHARE * Math.min(size.width, size.height))
  return Math.min(Math.max(reachPx + BEYOND_REACH, MIN_RADIUS), most)
}

function RotateGesture({
  engine,
  map,
  rotation,
}: {
  engine: MaidEngine
  map: MapLibreMap
  rotation: RotationInfo
}) {
  const [angle, setAngle] = useState(() => startAngle(rotation, map.getBearing()))
  // the handle and the line follow the map as it pans and zooms
  const [, setView] = useState(0)
  const handleRef = useRef<HTMLDivElement>(null)
  const angleRef = useRef(angle)
  const start = useRef(angle)
  const started = useRef(false)

  useEffect(() => {
    const onMove = () => setView((n) => n + 1)
    map.on('move', onMove)
    return () => void map.off('move', onMove)
  }, [map])

  useEffect(() => {
    const canvas = map.getCanvasContainer()
    const pivotOnScreen = (): Point => {
      const at = map.project(rotation.pivot)
      return { x: at.x, y: at.y }
    }
    const radius = () =>
      handleRadius(rotation.reach, map.getZoom(), map.getContainer().getBoundingClientRect())
    /** The place at this angle around the pivot, as the mouse of R would be there */
    const feed = (next: number) => {
      const pivot = pivotOnScreen()
      const r = radius()
      const at = (a: number) =>
        map.unproject([pivot.x + r * Math.cos(a), pivot.y + r * Math.sin(a)])
      if (!started.current) {
        // the start of the turn: the handle where it was first shown
        started.current = true
        const first = at(start.current)
        engine.transform.move(first.lng, first.lat)
      }
      const to = at(next)
      engine.transform.move(to.lng, to.lat)
      angleRef.current = next
      setAngle(next)
    }
    /** The angle of a place on the page around the pivot */
    const angleOf = (clientX: number, clientY: number) => {
      const box = map.getContainer().getBoundingClientRect()
      const pivot = pivotOnScreen()
      return Math.atan2(clientY - box.top - pivot.y, clientX - box.left - pivot.x)
    }

    // one finger on the handle: the handle keeps its offset from the finger, so it does not jump when touched off-centre
    const handle = handleRef.current
    let pointer: number | undefined
    let offset = 0
    const stop = (event: Event) => event.stopPropagation()
    const down = (event: PointerEvent) => {
      event.stopPropagation()
      event.preventDefault()
      if (pointer !== undefined || !handle) return
      pointer = event.pointerId
      handle.setPointerCapture(event.pointerId)
      offset = angleRef.current - angleOf(event.clientX, event.clientY)
    }
    const move = (event: PointerEvent) => {
      event.stopPropagation()
      if (event.pointerId !== pointer) return
      feed(angleOf(event.clientX, event.clientY) + offset)
    }
    const up = (event: PointerEvent) => {
      event.stopPropagation()
      if (event.pointerId === pointer) pointer = undefined
    }
    const kept = ['touchstart', 'touchmove', 'touchend', 'mousedown', 'click', 'dblclick']
    if (handle) {
      for (const type of kept) handle.addEventListener(type, stop)
      handle.addEventListener('pointerdown', down)
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
      handle.addEventListener('pointercancel', up)
    }

    // two fingers on the map: their turn is the selection's turn; MapLibre still zooms with them
    let twist: { fingers: number; angle: number } | undefined
    const fingersAngle = (touches: TouchList) => {
      const [a, b] = [touches[0]!, touches[1]!]
      return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX)
    }
    const touchStart = (event: TouchEvent) => {
      twist =
        event.touches.length === 2
          ? { fingers: fingersAngle(event.touches), angle: angleRef.current }
          : undefined
    }
    const touchMove = (event: TouchEvent) => {
      if (!twist || event.touches.length !== 2) return
      feed(twist.angle + fingersAngle(event.touches) - twist.fingers)
    }
    const touchEnd = (event: TouchEvent) => {
      if (event.touches.length !== 2) twist = undefined
    }
    canvas.addEventListener('touchstart', touchStart, { passive: true })
    canvas.addEventListener('touchmove', touchMove, { passive: true })
    canvas.addEventListener('touchend', touchEnd)
    canvas.addEventListener('touchcancel', touchEnd)

    return () => {
      if (handle) {
        for (const type of kept) handle.removeEventListener(type, stop)
        handle.removeEventListener('pointerdown', down)
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        handle.removeEventListener('pointercancel', up)
      }
      canvas.removeEventListener('touchstart', touchStart)
      canvas.removeEventListener('touchmove', touchMove)
      canvas.removeEventListener('touchend', touchEnd)
      canvas.removeEventListener('touchcancel', touchEnd)
    }
  }, [engine, map, rotation])

  const pivot = map.project(rotation.pivot)
  const r = handleRadius(rotation.reach, map.getZoom(), map.getContainer().getBoundingClientRect())
  const hx = pivot.x + r * Math.cos(angle)
  const hy = pivot.y + r * Math.sin(angle)
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 z-20 size-full" aria-hidden>
        <line
          x1={pivot.x}
          y1={pivot.y}
          x2={hx}
          y2={hy}
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
        <circle cx={pivot.x} cy={pivot.y} r={5} fill="#2563eb" stroke="#ffffff" strokeWidth={2} />
      </svg>
      <div
        ref={handleRef}
        role="button"
        aria-label="Rotate feature"
        data-rotate-handle
        style={{ left: hx, top: hy }}
        className="absolute z-20 grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full bg-white text-blue-600 shadow-md ring-2 ring-blue-600 select-none active:bg-blue-50 dark:bg-zinc-800 dark:text-blue-300 dark:active:bg-zinc-700"
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
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </div>
      <RotatePanel engine={engine} />
    </>
  )
}

/** The panel at the top centre, as Extrude's: what to do, Cancel and Done */
function RotatePanel({ engine }: { engine: MaidEngine }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const panel = ref.current
    if (!panel) return
    // A press on the panel is not the map's: it would pan it. A click neither: the map's click ends the rotation, and it
    // comes before React's, which listens at the root. So the buttons are read here, natively.
    const stop = (event: Event) => event.stopPropagation()
    const click = (event: Event) => {
      event.stopPropagation()
      const action =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-action]')?.dataset.action
          : undefined
      if (action === 'cancel') engine.transform.cancel()
      if (action) engine.setMode('browse')
    }
    const kept = ['mousedown', 'pointerdown', 'touchstart', 'dblclick', 'wheel']
    for (const type of kept) panel.addEventListener(type, stop)
    panel.addEventListener('click', click)
    return () => {
      for (const type of kept) panel.removeEventListener(type, stop)
      panel.removeEventListener('click', click)
    }
  }, [engine])
  return (
    <div
      ref={ref}
      data-rotate-panel
      className="pointer-events-auto absolute top-3 left-1/2 z-30 w-80 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl bg-white p-3 text-sm text-zinc-800 shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10"
    >
      <h2 className="font-medium">{m.rotate_panel_title()}</h2>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{m.rotate_panel_hint()}</p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          data-action="cancel"
          className="cursor-pointer rounded-md px-3 py-1.5 text-sm ring-1 ring-zinc-950/10 hover:bg-zinc-50 dark:ring-white/10 dark:hover:bg-zinc-700"
        >
          {m.rotate_panel_cancel()}
        </button>
        <button
          type="button"
          data-action="done"
          className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          {m.rotate_panel_done()}
        </button>
      </div>
    </div>
  )
}
