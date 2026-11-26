import { describe, expect, it } from 'bun:test'
import { deflateSync } from 'node:zlib'
import {
  decodeStatuses,
  encodeStatuses,
  listKeyOf,
  TASK_STATUSES,
  type TaskStatus,
} from './progress-codec.ts'

type StatusPattern = 'all-open' | 'ten-percent-done' | 'random'
const STATUS_PATTERNS: readonly StatusPattern[] = ['all-open', 'ten-percent-done', 'random']

/** Repeatable random numbers in [0, 1) */
function prng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** Every task open; a tenth done at random places; or each task one of the four statuses at random */
function sampleStatuses(count: number, pattern: StatusPattern, seed = 1): TaskStatus[] {
  const next = prng(seed)
  if (pattern === 'random') {
    return Array.from(
      { length: count },
      () => TASK_STATUSES[Math.floor(next() * TASK_STATUSES.length)] ?? 'open',
    )
  }
  const done = new Set<number>()
  if (pattern === 'ten-percent-done') {
    const target = Math.round(count / 10)
    while (done.size < target) done.add(Math.floor(next() * count))
  }
  return Array.from({ length: count }, (_, index) => (done.has(index) ? 'done' : 'open'))
}

/** The message of the error a promise rejects with, or 'resolved' when it does not reject */
async function messageOf(pending: Promise<unknown>): Promise<string> {
  try {
    await pending
    return 'resolved'
  } catch (error) {
    return error instanceof Error ? error.message : 'a value that is not an Error'
  }
}

const COUNTS = [0, 1, 3, 4, 5, 2000, 20_000]

describe('codec round trip', () => {
  for (const count of COUNTS) {
    for (const pattern of STATUS_PATTERNS) {
      it(`${count} tasks, ${pattern}`, async () => {
        const statuses = sampleStatuses(count, pattern, 42)
        const text = await encodeStatuses(statuses)
        expect(['b', 'z']).toContain(text.charAt(0))
        expect(await decodeStatuses(text, count)).toEqual(statuses)
      })
    }
  }

  it('round-trips random statuses for several seeds', async () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const statuses = sampleStatuses(1001, 'random', seed)
      expect(await decodeStatuses(await encodeStatuses(statuses), 1001)).toEqual(statuses)
    }
  })

  it('round-trips every status at every position within a byte', async () => {
    for (let offset = 0; offset < 4; offset++) {
      const statuses: TaskStatus[] = Array.from(
        { length: 4 * 9 + offset },
        (_, index) => TASK_STATUSES[(index * 7 + offset) % 4] ?? 'open',
      )
      expect(await decodeStatuses(await encodeStatuses(statuses), statuses.length)).toEqual(
        statuses,
      )
    }
  })

  it('uses the deflated form for all-open lists, which is far shorter', async () => {
    const allOpen = await encodeStatuses(sampleStatuses(2000, 'all-open'))
    expect(allOpen.charAt(0)).toBe('z')
    expect(allOpen.length).toBeLessThan(40)
  })

  it('uses the plain form for random statuses, which deflate cannot shrink', async () => {
    expect((await encodeStatuses(sampleStatuses(2000, 'random'))).charAt(0)).toBe('b')
  })

  it('writes zero tasks as the plain form with no bytes after it', async () => {
    expect(await encodeStatuses([])).toBe('b')
  })

  it('refuses a status that is not one of the four', async () => {
    expect(await messageOf(encodeStatuses(['done', 'bogus' as TaskStatus]))).toContain(
      'Unknown task status',
    )
  })
})

describe('codec decoding refuses bad data', () => {
  it('refuses an unknown prefix and empty text', async () => {
    expect(await messageOf(decodeStatuses('xAA', 1))).toContain('Unknown status encoding')
    expect(await messageOf(decodeStatuses('', 0))).toContain('Unknown status encoding')
  })

  it('refuses characters outside base64url', async () => {
    expect(await messageOf(decodeStatuses('bAA!A', 4))).toContain('not base64url')
    expect(await messageOf(decodeStatuses('bA+A', 4))).toContain('not base64url')
  })

  it('refuses a length no base64 text has', async () => {
    expect(await messageOf(decodeStatuses('bAAAAA', 4))).toContain('not base64url')
  })

  it('refuses a byte count that does not match the task count', async () => {
    const text = await encodeStatuses(sampleStatuses(2000, 'random'))
    expect(await messageOf(decodeStatuses(text, 2004))).toContain('bytes')
    expect(await messageOf(decodeStatuses(text, 1996))).toContain('bytes')
  })

  it('refuses padding bits that are not zero', async () => {
    // one task needs one byte; its bits 2 to 7 must be zero, so 0b1100_0000 is wrong
    const bad = `b${Buffer.from([0b1100_0000]).toString('base64url')}`
    expect(await messageOf(decodeStatuses(bad, 1))).toContain('padding')
    const good = `b${Buffer.from([0b0000_0001]).toString('base64url')}`
    expect(await decodeStatuses(good, 1)).toEqual(['done'])
  })

  it('refuses deflated data that is corrupt', async () => {
    expect(await messageOf(decodeStatuses('zAAAAAAAA', 4))).not.toBe('resolved')
  })

  it('refuses deflated data that expands beyond the task count', async () => {
    const bomb = `z${Buffer.from(deflateSync(Buffer.alloc(100_000))).toString('base64url')}`
    expect(await messageOf(decodeStatuses(bomb, 4))).toContain('expand')
  })
})

describe('listKeyOf', () => {
  it('gives 8 characters of base 36, the same every time', () => {
    for (const text of ['a', 'changeset-list-1', '', 'ü']) {
      expect(listKeyOf(text)).toMatch(/^[0-9a-z]{8}$/)
      expect(listKeyOf(text)).toBe(listKeyOf(text))
    }
    expect(listKeyOf('list-1')).not.toBe(listKeyOf('list-2'))
  })

  it('keeps the keys of entries this browser already holds', () => {
    // values of the first version: a change here would orphan the progress people saved
    expect(listKeyOf('a')).toBe('01r9wi7g')
    expect(listKeyOf('changeset-list-1')).toBe('01to9ons')
    expect(listKeyOf('')).toBe('00ztntfp')
    expect(listKeyOf('ü')).toBe('00xl30zf')
  })
})
