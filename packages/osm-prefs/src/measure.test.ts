import { describe, expect, it } from 'bun:test'
import { measure, sampleStatuses } from './measure.ts'

describe('sampleStatuses', () => {
  it('gives the same statuses for the same seed', () => {
    expect(sampleStatuses(500, 'random', 3)).toEqual(sampleStatuses(500, 'random', 3))
    expect(sampleStatuses(500, 'random', 3)).not.toEqual(sampleStatuses(500, 'random', 4))
  })

  it('has a tenth done in the ten-percent pattern, and nothing but open in all-open', () => {
    const tenth = sampleStatuses(2000, 'ten-percent-done', 1)
    expect(tenth.filter((status) => status === 'done')).toHaveLength(200)
    expect(new Set(tenth)).toEqual(new Set(['open', 'done']))
    expect(new Set(sampleStatuses(2000, 'all-open'))).toEqual(new Set(['open']))
  })

  it('uses all four statuses in the random pattern', () => {
    expect(new Set(sampleStatuses(2000, 'random', 1))).toEqual(
      new Set(['open', 'done', 'ignored', 'skipped']),
    )
  })
})

describe('measure, 2000 tasks', () => {
  it('all open: one chunk, deflated', async () => {
    const result = await measure(2000, 'all-open')
    expect(result.encoding).toBe('z')
    expect(result.chunks).toBe(1)
    expect(result.keys).toBe(result.chunks + 1)
    expect(result.totalChars).toBeLessThan(200)
  })

  it('a tenth done: deflated, two chunks', async () => {
    const result = await measure(2000, 'ten-percent-done')
    expect(result.encoding).toBe('z')
    expect(result.chunks).toBe(2)
    expect(result.totalChars).toBeLessThan(500)
  })

  it('random: plain, three chunks, every chunk within the limit', async () => {
    const result = await measure(2000, 'random')
    expect(result.encoding).toBe('b')
    // 500 bytes of statuses become 667 base64url characters, plus the one-character prefix: 668 in 3 chunks
    expect(result.chunkChars).toBe(668)
    expect(result.chunks).toBe(3)
    expect(result.totalChars).toBeLessThan(1000)
  })

  it('counts every key of the list, the meta included', async () => {
    const result = await measure(2000, 'random')
    expect(result.keys).toBe(result.chunks + 1)
    expect(result.keyChars).toBeGreaterThan(0)
  })
})
