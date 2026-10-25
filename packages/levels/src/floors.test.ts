import { describe, expect, test } from 'bun:test'
import { floorsOf } from './floors.ts'

const FIXTURE = `${import.meta.dir}/../../../fixtures/indoor.json.gz`

describe('floorsOf', () => {
  test('no features gives the ground level alone', () => {
    expect(floorsOf([])).toEqual([0])
  })

  test('features without a level add nothing, but 0 is always there', () => {
    expect(floorsOf([{ tags: { building: 'yes' } }, { tags: { level: 'x' } }])).toEqual([0])
  })

  test('the levels of mixed features, sorted and unique', () => {
    const features: { tags: Record<string, string> }[] = [
      { tags: { level: '1;2' } },
      { tags: { level: '-1' } },
      { tags: { repeat_on: '3' } },
      { tags: { min_level: '-2', max_level: '-1' } },
      { tags: { building: 'yes' } },
      { tags: { level: '0,5' } },
    ]
    expect(floorsOf(features)).toEqual([-2, -1, 0, 1, 2, 3])
  })

  test('decimals sort between the whole levels', () => {
    const features: { tags: Record<string, string> }[] = [
      { tags: { level: '-1.7' } },
      { tags: { level: '-1.3' } },
      { tags: { level: '0.5' } },
    ]
    expect(floorsOf(features)).toEqual([-1.7, -1.3, 0, 0.5])
  })

  test('accepts any iterable, not only arrays', () => {
    const features = new Set([{ tags: { level: '2' } }])
    expect(floorsOf(features)).toEqual([0, 2])
  })

  test('the indoor fixture: its floors, in under 50 ms', async () => {
    const data = JSON.parse(
      new TextDecoder().decode(
        Bun.gunzipSync(new Uint8Array(await Bun.file(FIXTURE).arrayBuffer())),
      ),
    ) as {
      elements: { type: string; id: number; tags?: Record<string, string> }[]
    }
    const features = data.elements.filter((element) => element.tags !== undefined) as {
      tags: Record<string, string>
    }[]

    // The fastest of five runs: one run alone can hit a garbage collection or a busy CI machine (236 ms once
    // against about 4 ms locally), which says nothing about floorsOf
    let floors: number[] = []
    let elapsed = Infinity
    for (let run = 0; run < 5; run++) {
      const started = performance.now()
      floors = floorsOf(features)
      elapsed = Math.min(elapsed, performance.now() - started)
    }

    expect(floors).toEqual([-3, -2, -1.7, -1.3, -1, -0.5, 0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(elapsed).toBeLessThan(50)
  })
})
