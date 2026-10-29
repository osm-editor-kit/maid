import { describe, expect, it } from 'bun:test'
import { listView, listViewRows } from './eli.ts'
import type { View } from './helpers.ts'

/** The index is bundled in the package: these read files, no server */
const VIEWS: Record<string, View> = {
  berlin: { bounds: [13.38, 52.5, 13.42, 52.52], zoom: 16 },
  'black forest': { bounds: [7.39, 48.43, 7.42, 48.44], zoom: 14 },
  'new york': { bounds: [-74.02, 40.7, -73.98, 40.72], zoom: 15 },
  world: { bounds: [-170, -60, 170, 75], zoom: 2 },
}

describe('listViewRows lists what listView lists, without the details', () => {
  for (const [name, view] of Object.entries(VIEWS)) {
    it(name, async () => {
      const rows = await listViewRows(view)
      const full = await listView(view)
      const pick = (items: { id: string; best: boolean; overlay: boolean; minzoom?: number }[]) =>
        items.map(({ id, best, overlay, minzoom }) => ({ id, best, overlay, minzoom }))
      expect(pick(rows.items)).toEqual(pick(full.items))
      expect(rows.items.length).toBeGreaterThan(0)
    })
  }
})
