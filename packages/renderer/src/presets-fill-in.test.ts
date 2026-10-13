import { describe, expect, test } from 'bun:test'
import { createEditor, lazyPresets } from '@osm-editor-kit/maid-core'
import type { OsmJsonElement } from '@osm-editor-kit/maid-model'
import { defaultPresets } from '@osm-editor-kit/maid-presets/default'
import type { Feature } from 'geojson'
import { MaidEngine } from './engine'

const elements: OsmJsonElement[] = [
  { type: 'node', id: 1, lat: 52.0, lon: 13.0, tags: { amenity: 'bench' } },
  { type: 'node', id: 2, lat: 52.001, lon: 13.0, tags: {} },
  { type: 'node', id: 3, lat: 52.002, lon: 13.0, tags: { name: 'x' } },
  { type: 'node', id: 4, lat: 52.003, lon: 13.0, tags: { highway: 'traffic_signals' } },
  { type: 'node', id: 5, lat: 52.004, lon: 13.001, tags: {} },
  { type: 'way', id: 10, nodes: [4, 5], tags: { highway: 'footway' } },
]

function engineWithSource() {
  const editor = createEditor({ presets: lazyPresets(() => defaultPresets) })
  const engine = new MaidEngine({
    editor,
    apiUrl: 'http://localhost:8090/s/small',
    minDataZoom: 16,
  })
  return { editor, engine }
}

/** What waits in the engine's channels (no map is attached, so nothing is sent), by feature id */
function queued(engine: MaidEngine) {
  const channels = (
    engine as unknown as { channels: Record<string, Record<string, { queue: Feature[] }>> }
  ).channels
  const out = new Map<string, Feature[]>()
  for (const group of Object.values(channels))
    for (const channel of Object.values(group))
      for (const feature of channel.queue) {
        const list = out.get(String(feature.id)) ?? []
        list.push(feature)
        out.set(String(feature.id), list)
      }
  return out
}

describe('icons and presets that are made after the first picture', () => {
  test('points and vertices wait for the presets; lines are drawn at once; they come with their icon, drawn once', async () => {
    const { editor, engine } = engineWithSource()
    engine.merge(elements)
    const early = queued(engine)
    // the way needs no presets and is on its way to the map
    expect(early.get('w10')).toHaveLength(1)
    // the points and vertices are held: not sent bare
    expect(early.get('n1')).toBeUndefined()
    expect(early.get('n4')).toBeUndefined()
    // n5 is an untagged end of a way: nothing to wait for
    expect(early.get('n5')).toHaveLength(1)
    expect(engine.debugState().parts).toMatchObject({ presetsPending: true, held: 3 })

    await editor.loadPresets()
    // the fill-in looks at what was drawn before (the way's end node) and finds nothing to add
    await new Promise((resolve) => setTimeout(resolve, 50))
    const after = queued(engine)
    const bench = defaultPresets.match({ amenity: 'bench' }, 'point', [13, 52]).icon
    expect(bench).toBeDefined()
    expect(after.get('n1')).toHaveLength(1)
    expect(after.get('n1')![0]!.properties?.icon).toBe(bench!)
    expect(after.get('n4')![0]!.properties?.icon).toBeDefined()
    expect(engine.debugState().parts).toMatchObject({ held: 0, fillingIn: 0 })
    // nothing was drawn twice
    expect(after.get('w10')).toHaveLength(1)
  })

  test('presets that take too long: the points are drawn bare, and get their icon when the presets come', async () => {
    const { editor, engine } = engineWithSource()
    engine.merge(elements)
    // the time is up before the presets are there
    ;(engine as unknown as { releaseHeld(): void }).releaseHeld()
    const bare = queued(engine)
    expect(bare.get('n1')).toHaveLength(1)
    expect(bare.get('n1')![0]!.properties?.icon).toBeUndefined()

    await editor.loadPresets()
    // the fill-in runs in slices: it is work in progress for `settled()`
    expect(engine.debugState().parts.fillingIn).toBe(1)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(engine.debugState().parts.fillingIn).toBe(0)
    const after = queued(engine)
    // a replacement of the same id: the last copy in the queue wins
    expect(after.get('n1')!.at(-1)!.properties?.icon).toBeDefined()
    expect(after.get('n4')!.at(-1)!.properties?.icon).toBeDefined()
    // an untagged node has nothing new; the way is not sent again
    expect(after.get('n2')).toBeUndefined()
    expect(after.get('w10')).toHaveLength(1)
    expect(engine.metrics.fillInMs).toBeGreaterThan(0)
  })

  test('nothing is held or built again when the presets are there before the first feature', async () => {
    const { editor, engine } = engineWithSource()
    await editor.loadPresets()
    engine.merge(elements)
    const features = queued(engine)
    expect(features.get('n1')).toHaveLength(1)
    expect(features.get('n1')![0]!.properties?.icon).toBeDefined()
    expect(engine.debugState().parts).toMatchObject({ held: 0, fillingIn: 0 })
    expect(engine.metrics.fillInMs).toBe(0)
  })
})
