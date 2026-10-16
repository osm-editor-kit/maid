import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createEditor, lazyPresets } from '@osm-editor-kit/maid-core'
import type { OsmJsonElement } from '@osm-editor-kit/maid-model'
import { defaultPresets } from '@osm-editor-kit/maid-presets/default'
import { MaidEngine } from './engine'
import { NO_MODIFIERS } from './modifiers'
import type { Loc } from './snap'

// a closed way of four corners; node 1 is dragged
const elements: OsmJsonElement[] = [
  { type: 'node', id: 1, lat: 52.0, lon: 13.0, tags: {} },
  { type: 'node', id: 2, lat: 52.0, lon: 13.001, tags: {} },
  { type: 'node', id: 3, lat: 52.001, lon: 13.001, tags: {} },
  { type: 'node', id: 4, lat: 52.001, lon: 13.0, tags: {} },
  { type: 'way', id: 10, nodes: [1, 2, 3, 4, 1], tags: { building: 'yes' } },
]

/** Where a Shift constraint puts the vertex */
const LOCKED: Loc = [13.0002, 52.0002]
/** Where the pointer is: the vertex goes here without a constraint */
const POINTER: Loc = [13.0007, 52.0009]

/** One macrotask: the moves that a drag queued have run by then */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function engineWithSquare() {
  const editor = createEditor({ presets: lazyPresets(() => defaultPresets) })
  const engine = new MaidEngine({
    editor,
    apiUrl: 'http://localhost:8090/s/small',
    minDataZoom: 16,
  })
  engine.merge(elements)
  // no map in the test: the moves are recorded, and Shift locks the vertex to LOCKED
  const moves: Loc[] = []
  engine.moveNodeStep = async (_id: string, lon: number, lat: number) => {
    moves.push([lon, lat])
    return 0
  }
  engine.constrainPlacement = () => (engine.modifiers.shift ? LOCKED : undefined)
  /** A pointer move on the vertex with the keys as given */
  const pointerMove = (shift: boolean) => {
    engine.dragTo('n1', POINTER[0], POINTER[1], {
      point: { x: 10, y: 10 },
      layers: [],
      free: false,
    })
    engine.setModifiers({ ...NO_MODIFIERS, shift })
  }
  return { engine, moves, pointerMove }
}

describe('a dragged vertex under Shift keeps its constraint through the release', () => {
  const original = { request: globalThis.requestAnimationFrame }
  beforeEach(() => {
    // settleDrag waits for frames; the test runs them at once
    Object.assign(globalThis, {
      requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
    })
  })
  afterEach(() => {
    Object.assign(globalThis, { requestAnimationFrame: original.request })
  })

  test('releasing Shift during a drag moves the vertex back under the pointer', async () => {
    const { engine, moves, pointerMove } = engineWithSquare()
    pointerMove(false)
    engine.setModifiers({ ...NO_MODIFIERS, shift: true })
    await settle()
    expect(moves.at(-1)).toEqual(LOCKED)
    engine.setModifiers(NO_MODIFIERS)
    await settle()
    expect(moves.at(-1)).toEqual(POINTER)
  })

  test('a Shift key-up that comes after the release does not undo the lock', async () => {
    const { engine, moves, pointerMove } = engineWithSquare()
    pointerMove(false)
    engine.setModifiers({ ...NO_MODIFIERS, shift: true })
    // the mouse goes up with Shift held; the key comes up before the drop has settled
    const ending = engine.endDrag()
    engine.setModifiers(NO_MODIFIERS)
    await ending
    await settle()
    expect(moves.at(-1)).toEqual(LOCKED)
  })
})
