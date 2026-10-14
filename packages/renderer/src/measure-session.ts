/**
 * The state of a measure under way (measure.ts has the pure maths and features): its callback, its first
 * click, the pointer, and the listeners of the magnifier. Owned by the engine as `engine.measure`; the
 * engine keeps delegating methods for the shell (`startMeasure`, `measuring`, ...).
 *
 * The engine's own work around a measure (hover, midpoints, field overlay, highlight source, `changed`) is
 * reached through `MeasureHost`, so this file knows nothing of MapLibre or of the data.
 */
import type { Feature } from 'geojson'
import type { LonLat } from './field-overlay'
import { distanceMetres, measureFeatures as measureOnMap } from './measure'

export interface MeasureHost {
  /** A drawing, a move, a rotation or a drag is under way: a measure is refused then */
  busy(): boolean
  clearHover(): void
  /** After a measure started or ended: midpoints, field overlay, highlight source and `changed()` again, in this order */
  refresh(): void
  /** The highlight source holds the measure's features: send it again */
  pushHighlight(): void
}

export class MeasureSession {
  constructor(private readonly host: MeasureHost) {}

  /** What a measure gives when it ends: the metres of the second click, or undefined when cancelled. Set while measuring. */
  private done?: (metres: number | undefined) => void
  /** The first click of the measure, once it is made */
  private start?: LonLat
  /** The line and the label from the first click to the pointer: empty until there is a first click and a move */
  private list: Feature[] = []
  /** Where the pointer is while measuring, and whether it is a finger: the magnifier follows it, before the first click too */
  private pointer?: { lon: number; lat: number; touch: boolean }
  private listeners = new Set<() => void>()
  private version = 0

  /**
   * Subscribes to the measure's moves and clicks. Its own channel: `subscribe` tells every React
   * component of the editor, and a pointer move while measuring must not make them all read again.
   */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getVersion = () => this.version

  private notify() {
    this.version++
    for (const listener of this.listeners) listener()
  }

  /**
   * The measure's first click and the pointer, for the magnifier (MeasureLoupe). `start` is undefined
   * until the first click; `pointer` is undefined until the pointer has moved over the map.
   */
  get spots() {
    return { start: this.start, pointer: this.pointer }
  }

  /**
   * True from startMeasure until the second click or a cancel. While it is, clicks and moves go to the
   * measure (click, move), and the engine's busy() is true: no selection, drag, handle or undo.
   */
  get active() {
    return this.done !== undefined
  }

  /** The features of the measure on the map now. Public for the browser checks. */
  get features() {
    return this.list
  }

  /**
   * Starts a measure: the first click on the map sets its start, the second ends it, and `done` is called
   * once with the distance on the ground in metres. `cancel` calls it with undefined. A measure that
   * is under way is cancelled first. Refused while a drawing, a move, a rotation or a drag is under way: `done`
   * is then called at once with undefined.
   */
  begin(done: (metres: number | undefined) => void) {
    this.cancel()
    if (this.host.busy()) {
      done(undefined)
      return
    }
    this.done = done
    // the hover of before the measure does not stay on the feature under it
    this.host.clearHover()
    // the field's band is not drawn while the measure runs (drawnFieldOverlay)
    this.host.refresh()
  }

  /** A click on the map while measuring: the first sets the start, the second ends the measure with its distance */
  click(lon: number, lat: number) {
    if (!this.done) return
    if (this.start === undefined) {
      this.start = [lon, lat]
      this.notify()
      return
    }
    this.finish(distanceMetres(this.start, [lon, lat]))
  }

  /**
   * A pointer move while measuring: the magnifier follows the pointer (`touch`: a finger), and the line
   * and label run from the start to the pointer, once there is a start.
   */
  move(lon: number, lat: number, touch = false) {
    if (!this.done) return
    this.pointer = { lon, lat, touch }
    this.notify()
    if (this.start === undefined) return
    this.list = measureOnMap(this.start, [lon, lat])
    this.host.pushHighlight()
  }

  /** Ends a measure without a distance: its `done` gets undefined, and nothing is changed. Nothing when none is under way. */
  cancel() {
    this.finish(undefined)
  }

  private finish(metres: number | undefined) {
    const done = this.done
    if (!done) return
    this.done = undefined
    this.start = undefined
    this.pointer = undefined
    this.list = []
    // the field's band comes back if the field still has the focus or the pointer on it
    this.host.refresh()
    this.notify()
    done(metres)
  }
}
