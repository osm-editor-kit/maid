import { describe, expect, test } from 'bun:test'
import { createEditor, lazyPresets } from '@osm-editor-kit/maid-core'
import { createFilterSet, defaultFilters } from '@osm-editor-kit/maid-filters'
import type { OsmJsonElement } from '@osm-editor-kit/maid-model'
import { defaultPresets } from '@osm-editor-kit/maid-presets/default'
import { MaidEngine } from './engine'

// a footway (hidden by the paths filter) and its end nodes; node 5 is a plain point to select
const elements: OsmJsonElement[] = [
  { type: 'node', id: 4, lat: 52.003, lon: 13.0, tags: { highway: 'traffic_signals' } },
  { type: 'node', id: 5, lat: 52.004, lon: 13.001, tags: {} },
  { type: 'node', id: 6, lat: 52.005, lon: 13.001, tags: { name: 'x' } },
  { type: 'way', id: 10, nodes: [4, 5], tags: { highway: 'footway' } },
]

function engineWithData() {
  const editor = createEditor({ presets: lazyPresets(() => defaultPresets) })
  const engine = new MaidEngine({
    editor,
    apiUrl: 'http://localhost:8090/s/small',
    minDataZoom: 16,
  })
  engine.merge(elements)
  return { editor, engine }
}

/** The selection at each call of the subscribe listeners */
function recordChanges(engine: MaidEngine) {
  const seen: string[][] = []
  const unsubscribe = engine.subscribe(() => seen.push([...engine.selection]))
  return { seen, unsubscribe }
}

/**
 * The selections in the order they changed, one entry per change: the calls that repeat the same selection are
 * one change. The URL mirror writes only when the value changes, so this is what it writes.
 */
function distinct(seen: readonly string[][]) {
  const out: string[][] = []
  for (const ids of seen) {
    const last = out.at(-1)
    if (!last || last.join(',') !== ids.join(',')) out.push(ids)
  }
  return out
}

describe('the engine tells its listeners about every change of the selection', () => {
  test('setSelected notifies once per change, and not for a call that changes nothing', () => {
    const { engine } = engineWithData()
    const { seen } = recordChanges(engine)

    engine.setSelected('w10')
    expect(seen).toEqual([['w10']])

    engine.setSelected(['w10'])
    expect(seen).toHaveLength(1)

    engine.setSelected(['w10', 'n5'])
    engine.setSelected(null)
    expect(seen).toEqual([['w10'], ['w10', 'n5'], []])
  })

  test('a filter that hides the selected feature notifies with the selection without it', () => {
    const { engine } = engineWithData()
    engine.setSelected('w10')
    const { seen } = recordChanges(engine)

    engine.setFilters(createFilterSet(defaultFilters, 'paths:hidden'))

    expect(engine.selection).toEqual([])
    expect(seen.length).toBeGreaterThan(0)
    expect(distinct(seen)).toEqual([[]])
  })

  test('an operation that changes the selection notifies with what it selects, last', () => {
    const { engine } = engineWithData()
    engine.setSelected('w10')
    const { seen } = recordChanges(engine)

    // a stand-in operation with no actions: runOperation changes the selection only
    const next = engine.runOperation({
      applies: () => true,
      disabled: () => false,
      run: () => ({ actions: [], annotation: 'test', select: () => ['n5'] }),
    } as never)

    expect(next).toEqual(['n5'])
    expect(engine.selection).toEqual(['n5'])
    // the commit notifies before the selection is set (still w10), then setSelected notifies with n5
    expect(seen.at(-1)).toEqual(['n5'])
    expect(distinct(seen)).toEqual([['w10'], ['n5']])
  })

  test('unsubscribing stops the notifications', () => {
    const { engine } = engineWithData()
    const { seen, unsubscribe } = recordChanges(engine)
    unsubscribe()
    engine.setSelected('n5')
    expect(seen).toEqual([])
    expect(engine.selection).toEqual(['n5'])
  })
})
