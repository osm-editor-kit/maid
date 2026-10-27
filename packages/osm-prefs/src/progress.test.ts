import { describe, expect, it } from 'bun:test'
import { sampleStatuses } from './measure.ts'
import {
  createProgressStore,
  formatMeta,
  listKeyOf,
  orderHashOf,
  parseMeta,
  reconcile,
  staleLists,
  type ListEntry,
  type ListMeta,
  type ProgressStore,
} from './progress.ts'
import { messageOf } from './test-support.ts'
import {
  memoryTransport,
  PREF_LIMITS,
  validatePref,
  type MemoryTransport,
  type PrefsTransport,
} from './transport.ts'

const NOW_MS = 1_700_000_000_000
const LIST = listKeyOf('changeset-list-1')
const META_KEY = `maid.tasks.${LIST}`
const ids = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `task-${index}`)
const HASH = orderHashOf(ids(10))

/** A store over a fresh memory transport, with the other app's keys already in place. */
function fixture(): { transport: MemoryTransport; store: ProgressStore } {
  const transport = memoryTransport({ 'iD.foo': 'bar', 'iD.other': 'baz' })
  return { transport, store: createProgressStore({ transport, now: () => NOW_MS }) }
}

/** All keys of one list, sorted. */
async function listKeys(transport: PrefsTransport, listKey = LIST): Promise<string[]> {
  return Object.keys(await transport.list())
    .filter((key) => key === `maid.tasks.${listKey}` || key.startsWith(`maid.tasks.${listKey}.`))
    .sort()
}

/** A transport that lets `allowed` writes through and fails every write after them. */
function failingAfter(inner: PrefsTransport, allowed: number): PrefsTransport {
  let writeCount = 0
  const gate = (): void => {
    writeCount++
    if (writeCount > allowed) throw new Error('connection lost')
  }
  return {
    list: () => inner.list(),
    async set(key, value) {
      gate()
      await inner.set(key, value)
    },
    async remove(key) {
      gate()
      await inner.remove(key)
    },
  }
}

describe('listKeyOf and orderHashOf', () => {
  it('give 8 characters of base 36, the same every time', () => {
    for (const text of ['a', 'changeset-list-1', '', 'ü']) {
      expect(listKeyOf(text)).toMatch(/^[0-9a-z]{8}$/)
      expect(listKeyOf(text)).toBe(listKeyOf(text))
    }
    expect(orderHashOf(ids(3))).toMatch(/^[0-9a-z]{8}$/)
  })

  it('differ for different ids and for a different order', () => {
    expect(listKeyOf('list-1')).not.toBe(listKeyOf('list-2'))
    expect(orderHashOf(['a', 'b'])).not.toBe(orderHashOf(['b', 'a']))
  })
})

describe('meta', () => {
  const meta: ListMeta = { v: 1, s: 'b', n: 3, c: 2000, r: 7, u: 1_700_000_000, h: HASH }

  it('formats in the field order of the format, and reads back', () => {
    const text = formatMeta(meta)
    expect(text).toBe(`{"v":1,"s":"b","n":3,"c":2000,"r":7,"u":1700000000,"h":"${HASH}"}`)
    expect(text.length).toBeLessThanOrEqual(PREF_LIMITS.valueMax)
    expect(parseMeta(text)).toEqual(meta)
  })

  it('refuses text that is not JSON, and a field that is wrong', () => {
    const wrong = [
      'not json',
      '[]',
      'null',
      '{"v":2,"s":"a","n":1,"c":1,"r":1,"u":1,"h":"abcdefgh"}',
      '{"v":1,"s":"c","n":1,"c":1,"r":1,"u":1,"h":"abcdefgh"}',
      '{"v":1,"s":"a","n":-1,"c":1,"r":1,"u":1,"h":"abcdefgh"}',
      '{"v":1,"s":"a","n":1.5,"c":1,"r":1,"u":1,"h":"abcdefgh"}',
      '{"v":1,"s":"a","n":1,"c":1,"r":"1","u":1,"h":"abcdefgh"}',
      '{"v":1,"s":"a","n":1,"c":1,"r":1,"u":1,"h":"ABCDEFGH"}',
      '{"v":1,"s":"a","n":1,"c":1,"r":1,"u":1}',
    ]
    for (const text of wrong) expect(() => parseMeta(text)).toThrow()
  })

  it('refuses to format a meta with an order hash that is not 8 characters', () => {
    expect(() => formatMeta({ ...meta, h: 'short' })).toThrow()
  })
})

describe('save and load', () => {
  for (const count of [0, 1, 4, 5, 2000, 20_000]) {
    for (const pattern of ['all-open', 'ten-percent-done', 'random'] as const) {
      it(`round-trips ${count} tasks, ${pattern}`, async () => {
        const { transport, store } = fixture()
        const statuses = sampleStatuses(count, pattern, 5)
        const saved = await store.save(LIST, statuses, { orderHash: orderHashOf(ids(count)) })
        const loaded = await store.load(LIST)
        expect(loaded?.statuses).toEqual(statuses)
        expect(loaded?.meta).toEqual(saved)
        expect(saved.c).toBe(count)
        expect(saved.r).toBe(1)
        expect(await listKeys(transport)).toContain(META_KEY)
      })
    }
  }

  it('returns undefined for a list without a meta', async () => {
    expect(await fixture().store.load(LIST)).toBeUndefined()
  })

  it('counts the revision up by one per save and keeps the time of the save', async () => {
    const { store } = fixture()
    await store.save(LIST, sampleStatuses(3, 'random'), { orderHash: HASH })
    const second = await store.save(LIST, sampleStatuses(3, 'random', 9), { orderHash: HASH })
    expect(second.r).toBe(2)
    expect(second.u).toBe(NOW_MS / 1000)
  })

  it('uses the record it is given instead of listing again', async () => {
    const { transport, store } = fixture()
    await store.save(LIST, sampleStatuses(10, 'random'), { orderHash: HASH })
    const before = transport.calls.length
    const record = await transport.list()
    await store.save(LIST, sampleStatuses(10, 'random', 3), { orderHash: HASH, previous: record })
    expect(transport.calls.slice(before).filter((call) => call.method === 'GET')).toHaveLength(1)
  })

  it('refuses to save over a broken meta, and says to remove the list', async () => {
    const { transport, store } = fixture()
    await transport.set(META_KEY, 'broken')
    expect(await messageOf(store.save(LIST, [], { orderHash: HASH }))).toContain('remove the list')
  })

  it('writes every key and value within the limits, under the prefix, and never a PUT without a key', async () => {
    const { transport } = fixture()
    const written: { key: string; value: string }[] = []
    const recording: PrefsTransport = {
      list: () => transport.list(),
      async set(key, value) {
        written.push({ key, value })
        await transport.set(key, value)
      },
      remove: (key) => transport.remove(key),
    }
    const recorded = createProgressStore({ transport: recording, now: () => NOW_MS })
    await recorded.save(LIST, sampleStatuses(2000, 'random'), { orderHash: HASH })
    await recorded.save(LIST, sampleStatuses(20, 'all-open'), { orderHash: HASH })
    await recorded.remove(LIST)
    expect(written.length).toBeGreaterThan(0)
    for (const { key, value } of written) {
      expect(key.startsWith('maid.tasks.')).toBe(true)
      expect(() => validatePref(key, value)).not.toThrow()
    }
    // a GET lists the whole collection (key null); every write names one key
    for (const call of transport.calls) if (call.method !== 'GET') expect(call.key).not.toBeNull()
  })

  it('never touches keys of other apps', async () => {
    const { transport, store } = fixture()
    await store.save(LIST, sampleStatuses(2000, 'random'), { orderHash: HASH })
    await store.save(LIST, sampleStatuses(5, 'random'), { orderHash: HASH })
    await store.remove(LIST)
    const record = await transport.list()
    expect(record['iD.foo']).toBe('bar')
    expect(record['iD.other']).toBe('baz')
    expect(transport.calls.some((call) => call.key?.startsWith('iD.'))).toBe(false)
  })

  it('leaves no stale key: after a long save and a short one, only the active slot remains', async () => {
    const { transport, store } = fixture()
    await store.save(LIST, sampleStatuses(2000, 'random'), { orderHash: HASH })
    const short = await store.save(LIST, sampleStatuses(5, 'random', 4), { orderHash: HASH })
    const keys = await listKeys(transport)
    const expected = [
      META_KEY,
      ...Array.from({ length: short.n }, (_, index) => `${META_KEY}.${short.s}.${index}`),
    ].sort()
    expect(keys).toEqual(expected)
  })
})

describe('crash safety', () => {
  const statusesA = sampleStatuses(2000, 'random', 1)
  const statusesB = sampleStatuses(2000, 'random', 2)

  /** Writes and calls of a successful save of B over A, to know where the commit comes. */
  async function dryRun(): Promise<{ chunkWrites: number; totalWrites: number }> {
    const { transport, store } = fixture()
    await store.save(LIST, statusesA, { orderHash: HASH })
    const before = transport.calls.length
    await store.save(LIST, statusesB, { orderHash: HASH })
    const saveCalls = transport.calls.slice(before).filter((call) => call.method !== 'GET')
    const metaAt = saveCalls.findIndex((call) => call.key === META_KEY)
    return { chunkWrites: metaAt, totalWrites: saveCalls.length }
  }

  it('after a failure at any write, load returns the previous statuses until the meta is written', async () => {
    const { chunkWrites, totalWrites } = await dryRun()
    for (let allowed = 0; allowed < totalWrites; allowed++) {
      const { transport, store } = fixture()
      await store.save(LIST, statusesA, { orderHash: HASH })
      const flaky = createProgressStore({
        transport: failingAfter(transport, allowed),
        now: () => NOW_MS,
      })
      expect(await messageOf(flaky.save(LIST, statusesB, { orderHash: HASH }))).toContain(
        'connection lost',
      )
      const loaded = await store.load(LIST)
      // the meta is write number chunkWrites + 1 (the chunks come first)
      const committed = allowed >= chunkWrites + 1
      expect(loaded?.statuses).toEqual(committed ? statusesB : statusesA)
    }
  })

  it('a retry after any failure gives the new statuses, with no stale key', async () => {
    const { totalWrites } = await dryRun()
    for (let allowed = 0; allowed < totalWrites; allowed++) {
      const { transport, store } = fixture()
      await store.save(LIST, statusesA, { orderHash: HASH })
      const flaky = createProgressStore({
        transport: failingAfter(transport, allowed),
        now: () => NOW_MS,
      })
      await flaky.save(LIST, statusesB, { orderHash: HASH }).catch(() => undefined)
      const retried = await store.save(LIST, statusesB, { orderHash: HASH })
      expect((await store.load(LIST))?.statuses).toEqual(statusesB)
      const keys = await listKeys(transport)
      expect(keys).toEqual(
        [
          META_KEY,
          ...Array.from({ length: retried.n }, (_, index) => `${META_KEY}.${retried.s}.${index}`),
        ].sort(),
      )
    }
  })

  it('a retry writes only the chunks that did not reach the server yet', async () => {
    const { chunkWrites } = await dryRun()
    const { transport, store } = fixture()
    await store.save(LIST, statusesA, { orderHash: HASH })
    const flaky = createProgressStore({ transport: failingAfter(transport, 1), now: () => NOW_MS })
    await flaky.save(LIST, statusesB, { orderHash: HASH }).catch(() => undefined)
    const before = transport.calls.length
    await store.save(LIST, statusesB, { orderHash: HASH })
    const puts = transport.calls.slice(before).filter((call) => call.method === 'PUT').length
    // the first chunk is already there and identical: the retry writes the other chunks and the meta
    expect(puts).toBe(chunkWrites)
  })

  it('a failure while removing the old slot after the commit reports the error, and the new state stands', async () => {
    const { chunkWrites, totalWrites } = await dryRun()
    const { transport, store } = fixture()
    await store.save(LIST, statusesA, { orderHash: HASH })
    const flaky = createProgressStore({
      transport: failingAfter(transport, chunkWrites + 1),
      now: () => NOW_MS,
    })
    expect(totalWrites).toBeGreaterThan(chunkWrites + 1)
    expect(await messageOf(flaky.save(LIST, statusesB, { orderHash: HASH }))).toContain(
      'connection lost',
    )
    expect((await store.load(LIST))?.statuses).toEqual(statusesB)
  })
})

describe('remove', () => {
  it('deletes the chunks first and the meta last, and leaves other keys alone', async () => {
    const { transport, store } = fixture()
    await store.save(LIST, sampleStatuses(2000, 'random'), { orderHash: HASH })
    transport.calls.length = 0
    await store.remove(LIST)
    const deletes = transport.calls
      .filter((call) => call.method === 'DELETE')
      .map((call) => call.key)
    expect(deletes.at(-1)).toBe(META_KEY)
    expect(deletes.slice(0, -1).every((key) => key?.startsWith(`${META_KEY}.`))).toBe(true)
    expect(await listKeys(transport)).toEqual([])
    expect((await transport.list())['iD.foo']).toBe('bar')
  })

  it('after a failure part way, the list is still listed and a retry finishes the job', async () => {
    const { transport, store } = fixture()
    await store.save(LIST, sampleStatuses(2000, 'random'), { orderHash: HASH })
    const chunks = (await listKeys(transport)).length - 1
    for (let allowed = 0; allowed < chunks; allowed++) {
      const flaky = createProgressStore({
        transport: failingAfter(transport, allowed),
        now: () => NOW_MS,
      })
      expect(await messageOf(flaky.remove(LIST))).toContain('connection lost')
      const { lists } = await store.listAll()
      expect(lists.map((entry) => entry.listKey)).toContain(LIST)
    }
    await store.remove(LIST)
    expect(await listKeys(transport)).toEqual([])
  })

  it('removing a list that is not there does nothing', async () => {
    const { transport, store } = fixture()
    await store.remove(LIST)
    expect(transport.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0)
  })
})

describe('listAll', () => {
  it('lists every list from one list() call and reports broken metas', async () => {
    const { transport, store } = fixture()
    await store.save(LIST, sampleStatuses(10, 'random'), { orderHash: HASH })
    const other = listKeyOf('other-list')
    await store.save(other, sampleStatuses(3, 'all-open'), { orderHash: HASH })
    const brokenKey = `maid.tasks.${listKeyOf('broken-list')}`
    await transport.set(brokenKey, 'not a meta')
    transport.calls.length = 0

    const result = await store.listAll()
    expect(transport.calls.filter((call) => call.method === 'GET')).toHaveLength(1)
    expect(result.lists.map((entry) => entry.listKey).sort()).toEqual([LIST, other].sort())
    expect(result.broken).toEqual([brokenKey])
  })
})

describe('staleLists', () => {
  const at = (listKey: string, u: number): ListEntry => ({
    listKey,
    meta: { v: 1, s: 'a', n: 1, c: 1, r: 1, u, h: HASH },
  })

  it('picks the lists whose last save is older than 30 days by default', () => {
    const now = 1_700_000_000
    const day = 86_400
    const entries = [
      at('recent000', now - day),
      at('old00000', now - 31 * day),
      at('edge0000', now - 30 * day),
    ]
    expect(staleLists(entries, now).map((entry) => entry.listKey)).toEqual(['old00000'])
  })

  it('takes the number of days as an option', () => {
    const now = 1_700_000_000
    const entries = [at('a0000000', now - 2 * 86_400)]
    expect(staleLists(entries, now, 1)).toHaveLength(1)
    expect(staleLists(entries, now, 3)).toHaveLength(0)
  })
})

describe('reconcile', () => {
  const cases: [number, number, number | undefined, ReturnType<typeof reconcile>][] = [
    [5, 5, 5, 'same'],
    [5, 5, undefined, 'same'],
    [5, 5, 4, 'same'],
    [6, 5, 5, 'push'],
    [6, 5, undefined, 'push'],
    [6, 5, 4, 'push'],
    [5, 5, 6, 'pull'],
    [5, 5, 9, 'pull'],
    [6, 5, 6, 'conflict'],
    [7, 5, 9, 'conflict'],
  ]
  for (const [localRevision, ackedRevision, remoteRevision, expected] of cases) {
    it(`local ${localRevision}, acked ${ackedRevision}, remote ${String(remoteRevision)}: ${expected}`, () => {
      expect(reconcile({ localRevision, ackedRevision }, remoteRevision)).toBe(expected)
    })
  }
})
