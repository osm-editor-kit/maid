import { describe, expect, test } from 'bun:test'
import {
  createProgressStore,
  decodeStatuses,
  httpTransport,
  listKeyOf,
  type TaskStatus,
} from '../../packages/osm-prefs/src/index.ts'
import { createHandler, loadScenes } from './server'

/** The osm-prefs HTTP transport against the mock's handler: the same requests the tasks module sends */
const handler = createHandler(await loadScenes(['small']), { latency: 0 })
const fetchMock = (url: string, init?: RequestInit) => handler(new Request(url, init))
const transport = httpTransport({ apiUrl: 'http://localhost:8090/s/small', fetch: fetchMock })

describe('task progress in the mock user preferences', () => {
  test('save, load, save again and remove go through the real endpoints', async () => {
    await handler(new Request('http://localhost/prefs/reset'))
    const store = createProgressStore({ transport })
    const key = listKeyOf('berlin-test')
    const statuses: TaskStatus[] = Array.from({ length: 2000 }, (_, i) =>
      i % 10 === 0 ? 'done' : i % 17 === 0 ? 'ignored' : 'open',
    )
    const first = await store.save(key, statuses, { orderHash: 'abcd1234' })
    const loaded = await store.load(key)
    expect(loaded?.statuses).toEqual(statuses)
    statuses[5] = 'skipped'
    const second = await store.save(key, statuses, { orderHash: 'abcd1234' })
    expect(second.r).toBe(first.r + 1)
    expect(second.s).not.toBe(first.s)
    const all = await transport.list()
    // only the active slot and the meta stay
    expect(
      Object.keys(all).every(
        (k) => k === `maid.tasks.${key}` || k.startsWith(`maid.tasks.${key}.${second.s}.`),
      ),
    ).toBe(true)
    const chunks = Object.keys(all)
      .filter((k) => k.startsWith(`maid.tasks.${key}.${second.s}.`))
      .sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()))
      .map((k) => all[k])
      .join('')
    expect(await decodeStatuses(chunks, 2000)).toEqual(statuses)
    expect((await store.listAll()).lists.map((l) => l.listKey)).toEqual([key])
    await store.remove(key)
    expect(await transport.list()).toEqual({})
    await store.remove(key)
  })
})
