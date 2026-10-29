/**
 * A module's own map mode: while one is active, the pointer on the map goes to the module, not to the selection,
 * the drawing, the handles or a drag of a node. Built for a module that places points on the map (the reroute's
 * start and end), for handles it draws itself (`handleLayers`: a press on one starts a drag of its `handle`
 * property, as a route planner's via points do), and for a drawing tool that snaps like a drawn node (`snap`, ADR 0011).
 *
 * The engine owns one session (`engine.moduleMode`) and forwards the pointer to it: `moduleModePress`,
 * `moduleModeMove`, `moduleModeRelease` and `moduleModeClick`. The shell's map view calls those while
 * `engine.moduleMode` is set, and nothing else (see MapView: the same check as for a measure). This file knows
 * nothing of MapLibre: the engine answers which handle is under a pointer, and what a pointer snaps to.
 */
import type { Modifiers } from './modifiers'
import type { SnapTarget } from './snap'

/** A pixel on the map, as the map view reports it */
export type ScreenPoint = { x: number; y: number }

/** The keys a mode can take (see `ModuleMode.onKey`). Escape is not one of them: it always ends the mode. */
export type ModuleModeKey = 'Enter' | 'Backspace'

/**
 * What a mode's `onMove` and `onClick` are told about the pointer besides its place: the pixel, what it would snap
 * to (set only for a mode with `snap`), and the modifier keys now.
 */
export type ModuleModeInfo = {
  point: ScreenPoint
  /** What the pointer would snap to: a node, or a place on a way. Undefined without `snap`, or with nothing under it. */
  target?: SnapTarget
  modifiers: Modifiers
}

/** What a mode's drag callbacks are told besides the place: the modifier keys now */
export type ModuleModeDragInfo = { modifiers: Modifiers }

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
  /**
   * The pointer snaps to what is under it, as a drawn node does: `info.target` is set in `onMove` and `onClick`. Off
   * by default, so a mode without it never queries the map for a snap.
   */
  snap?: boolean
  /** The features that a snap leaves out, such as the mode's own preview. Asked on each pointer event. */
  skip?: () => ReadonlySet<string>
  /** A click on the map that is not a handle drag */
  onClick?: (lon: number, lat: number, info: ModuleModeInfo) => void
  /** The pointer moved over the map while nothing is dragged */
  onMove?: (lon: number, lat: number, info: ModuleModeInfo) => void
  /**
   * A key press that the mode may use: Enter or Backspace, without a modifier and not in a text field. True: the mode
   * took the key, and the editor does not see it (a drawing finishes on Enter, for one).
   */
  onKey?: (key: ModuleModeKey) => boolean
  /**
   * A handle drag. `info` holds the modifier keys now; a key pressed or let go during a drag calls `onDrag` again at the
   * pointer (`engine.setModifiers`), so the result follows the key without a move (the resize box's Shift and Alt).
   */
  onDragStart?: (handle: string, lon: number, lat: number, info: ModuleModeDragInfo) => void
  onDrag?: (handle: string, lon: number, lat: number, info: ModuleModeDragInfo) => void
  onDragEnd?: (handle: string, lon: number, lat: number, info: ModuleModeDragInfo) => void
  /**
   * Undo and redo only end the mode, and step through nothing: for a mode whose work is not in the history yet (the
   * resize box shows its result and commits it at the end), so the key takes back that work and not the edit before.
   */
  endsOnUndo?: boolean
  /** The mode ends: Escape, a mode the editor changes to, `exitModuleMode`, or another module mode taking its place */
  onExit?: () => void
}

/** A click that follows the end of a handle drag within this time is the end of that drag, not a click (ms) */
export const CLICK_AFTER_DRAG_MS = 300

/** The key a mode may take from a key press, or undefined. Keys with Control, Alt or Meta are the editor's (Mod+Backspace deletes) and keys in a text field are the field's. */
export function moduleKeyOf(event: {
  key: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  target: unknown
}): ModuleModeKey | undefined {
  if (event.key !== 'Enter' && event.key !== 'Backspace') return undefined
  if (event.ctrlKey || event.altKey || event.metaKey || isTextField(event.target)) return undefined
  return event.key
}

/** True for a text input, a text area, a select or an editable element: the editor's keys stay out of them */
export function isTextField(target: unknown) {
  const element = target as { tagName?: unknown; isContentEditable?: unknown } | null | undefined
  if (element?.isContentEditable === true) return true
  return (
    typeof element?.tagName === 'string' &&
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
  )
}

/** What the session needs from the engine: the handle under a pixel, the clock, and a notice of each change */
export interface ModuleModeHost {
  handleAt(point: ScreenPoint, layers: readonly string[]): string | undefined
  now(): number
  /** The mode started or ended: the engine redraws the handles and tells its listeners */
  changed(): void
  /** What a pixel snaps to, leaving out the features given (the engine's snap over the layers the pointer uses) */
  snapAt(point: ScreenPoint, skip: ReadonlySet<string>): SnapTarget | undefined
  /** The modifier keys now */
  modifiers(): Modifiers
}

const NO_SKIP: ReadonlySet<string> = new Set()

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

  /** A press: true when it took a handle of the mode, so the map must not pan with this drag */
  press(point: ScreenPoint, lon: number, lat: number): boolean {
    const mode = this.current
    if (!mode) return false
    const layers = mode.handleLayers ?? []
    const handle = layers.length > 0 ? this.host.handleAt(point, layers) : undefined
    if (handle === undefined) return false
    this.dragging = handle
    mode.onDragStart?.(handle, lon, lat, this.dragInfo())
    return true
  }

  /** The pointer moved: a dragged handle follows it, otherwise the mode is told of the move */
  move(point: ScreenPoint, lon: number, lat: number) {
    const mode = this.current
    if (!mode) return
    if (this.dragging !== undefined) mode.onDrag?.(this.dragging, lon, lat, this.dragInfo())
    else mode.onMove?.(lon, lat, this.infoAt(mode, point))
  }

  /** The button went up: a dragged handle is dropped where it is */
  release(lon: number, lat: number) {
    const mode = this.current
    if (!mode || this.dragging === undefined) return
    const handle = this.dragging
    this.dragging = undefined
    this.lastDragEnd = this.host.now()
    mode.onDragEnd?.(handle, lon, lat, this.dragInfo())
  }

  /** A click on the map. Ignored right after a handle drag: MapLibre reports the end of a drag as a click */
  click(point: ScreenPoint, lon: number, lat: number) {
    const mode = this.current
    if (!mode) return
    if (this.host.now() - this.lastDragEnd < CLICK_AFTER_DRAG_MS) return
    mode.onClick?.(lon, lat, this.infoAt(mode, point))
  }

  /** A key the mode may take (see `ModuleMode.onKey`): true when the mode used it */
  key(key: ModuleModeKey): boolean {
    return this.current?.onKey?.(key) === true
  }

  /** What a callback is told about the pointer. The snap is asked only by a mode that snaps, and only when `target` is read. */
  private infoAt(mode: ModuleMode, point: ScreenPoint): ModuleModeInfo {
    const { host } = this
    // the snap queries the map: only when a callback reads `target` (a move that only draws a rubber band does not)
    let target: SnapTarget | undefined
    let asked = false
    return {
      point,
      get target() {
        if (!asked && mode.snap) target = host.snapAt(point, mode.skip?.() ?? NO_SKIP)
        asked = true
        return target
      },
      modifiers: { ...host.modifiers() },
    }
  }

  /** What a drag callback is told: a copy of the modifier keys now */
  private dragInfo(): ModuleModeDragInfo {
    return { modifiers: { ...this.host.modifiers() } }
  }

  /** Drops the state (and any drag) and returns the mode that was under way */
  private clear(): ModuleMode | undefined {
    const previous = this.current
    this.current = undefined
    this.dragging = undefined
    return previous
  }
}
