/**
 * A module's own map mode: while one is active, the pointer on the map goes to the module, not to the selection,
 * the drawing, the handles or a drag of a node. Built for a module that places points on the map (the reroute's
 * start and end), and for handles it draws itself (`handleLayers`: a press on one starts a drag of its `handle`
 * property, as a route planner's via points do).
 *
 * The engine owns one session (`engine.moduleMode`) and forwards the pointer to it: `moduleModePress`,
 * `moduleModeMove`, `moduleModeRelease` and `moduleModeClick`. The shell's map view calls those while
 * `engine.moduleMode` is set, and nothing else (see MapView: the same check as for a measure). This file knows
 * nothing of MapLibre: the engine answers which handle is under a pointer.
 */

/** A pixel on the map, as the map view reports it */
export type ScreenPoint = { x: number; y: number }

/**
 * A mode of a module. Its callbacks get longitude and latitude. Set `id` to something unique to the module: a mode
 * that replaces this one ends it, and `exitModuleMode(id)` ends only this one.
 */
export type ModuleMode = {
  id: string
  /** The cursor over the map while the mode is on. Default: 'crosshair' */
  cursor?: string
  /**
   * Layers that draw handles. A press on a feature of one of them starts a drag; the feature's `handle` property
   * (a string) names the handle in the callbacks below.
   */
  handleLayers?: string[]
  /** A click on the map that is not a handle drag */
  onClick?: (lon: number, lat: number) => void
  /** The pointer moved over the map while nothing is dragged */
  onMove?: (lon: number, lat: number) => void
  onDragStart?: (handle: string, lon: number, lat: number) => void
  onDrag?: (handle: string, lon: number, lat: number) => void
  onDragEnd?: (handle: string, lon: number, lat: number) => void
  /** The mode ends: Escape, a mode the editor changes to, `exitModuleMode`, or another module mode taking its place */
  onExit?: () => void
}

/** A click that follows the end of a handle drag within this time is the end of that drag, not a click (ms) */
export const CLICK_AFTER_DRAG_MS = 300

/** What the session needs from the engine: the handle under a pixel, the clock, and a notice of each change */
export interface ModuleModeHost {
  handleAt(point: ScreenPoint, layers: readonly string[]): string | undefined
  now(): number
  /** The mode started or ended: the engine redraws the handles and tells its listeners */
  changed(): void
}

export class ModuleModeSession {
  private current?: ModuleMode
  private dragging?: string
  private lastDragEnd = Number.NEGATIVE_INFINITY

  constructor(private readonly host: ModuleModeHost) {}

  /** The mode under way, if any */
  get mode(): ModuleMode | undefined {
    return this.current
  }

  /** True while a handle is being dragged */
  get dragged(): boolean {
    return this.dragging !== undefined
  }

  /**
   * Starts a mode. A mode that is under way ends first (its `onExit` runs). The state is set before any callback, so
   * a callback that ends or starts a mode sees the right one.
   */
  enter(mode: ModuleMode) {
    const previous = this.clear()
    this.current = mode
    previous?.onExit?.()
    this.host.changed()
  }

  /**
   * Ends the mode under way, or only the mode with this id. Returns true when a mode ended. The state is cleared before
   * `onExit` runs, so an `onExit` that calls `exit` again does nothing.
   */
  exit(id?: string): boolean {
    if (!this.current || (id !== undefined && this.current.id !== id)) return false
    const ended = this.clear()
    ended?.onExit?.()
    this.host.changed()
    return true
  }

  /** A press on the map: on a handle it starts a drag, anywhere else it changes nothing */
  /** A press: true when it took a handle of the mode, so the map must not pan with this drag */
  press(point: ScreenPoint, lon: number, lat: number): boolean {
    const mode = this.current
    if (!mode) return false
    const layers = mode.handleLayers ?? []
    const handle = layers.length > 0 ? this.host.handleAt(point, layers) : undefined
    if (handle === undefined) return false
    this.dragging = handle
    mode.onDragStart?.(handle, lon, lat)
    return true
  }

  /** The pointer moved: a dragged handle follows it, otherwise the mode is told of the move */
  move(lon: number, lat: number) {
    const mode = this.current
    if (!mode) return
    if (this.dragging !== undefined) mode.onDrag?.(this.dragging, lon, lat)
    else mode.onMove?.(lon, lat)
  }

  /** The button went up: a dragged handle is dropped where it is */
  release(lon: number, lat: number) {
    const mode = this.current
    if (!mode || this.dragging === undefined) return
    const handle = this.dragging
    this.dragging = undefined
    this.lastDragEnd = this.host.now()
    mode.onDragEnd?.(handle, lon, lat)
  }

  /** A click on the map. Ignored right after a handle drag: MapLibre reports the end of a drag as a click */
  click(lon: number, lat: number) {
    const mode = this.current
    if (!mode) return
    if (this.host.now() - this.lastDragEnd < CLICK_AFTER_DRAG_MS) return
    mode.onClick?.(lon, lat)
  }

  /** Drops the state (and any drag) and returns the mode that was under way */
  private clear(): ModuleMode | undefined {
    const previous = this.current
    this.current = undefined
    this.dragging = undefined
    return previous
  }
}
