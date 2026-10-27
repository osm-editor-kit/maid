import { describe, expect, it } from 'bun:test'
import { deflateSync } from 'node:zlib'
import { decodeStatuses, encodeStatuses, TASK_STATUSES, type TaskStatus } from './codec.ts'
import { sampleStatuses, STATUS_PATTERNS } from './measure.ts'
import { messageOf } from './test-support.ts'

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
