/** The cross-section of a way for the street drawing (street.ts) */
import { describe, expect, test } from 'bun:test'
import { crossSection } from './street.ts'

describe('implausible tags', () => {
  test('a huge lane count or width is drawn as an assumed carriageway, quickly', () => {
    const start = performance.now()
    for (const tags of [
      { highway: 'primary', lanes: '100000' },
      { highway: 'primary', 'lanes:forward': '5000' },
      { highway: 'primary', width: '1000' },
    ]) {
      const section = crossSection('w1', tags)
      expect(section.assumed).toBe(true)
      expect(
        Math.max(...section.lanes.map((l) => Math.abs(l.left) + Math.abs(l.right))),
      ).toBeLessThan(10)
    }
    expect(performance.now() - start).toBeLessThan(200)
  })

  test('a split way with the same tags object gets lane ids of its own', () => {
    const tags = { highway: 'primary', lanes: '2' }
    expect(crossSection('w1', tags).lanes[0]!.id).not.toBe(crossSection('w2', tags).lanes[0]!.id)
  })
})
