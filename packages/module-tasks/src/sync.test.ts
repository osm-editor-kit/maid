import { describe, expect, it } from 'bun:test'
import {
  createProgressStore,
  listKeyOf,
  memoryTransport,
  type PrefsTransport,
  PrefsHttpError,
  type TaskStatus,
} from '@osm-editor-kit/maid-osm-prefs'
import { orderHash } from '@osm-editor-kit/maid-tasks'
import { type TasksStore } from './store.ts'
import { createSync } from './sync.ts'
import { makeFile, openedStore } from './test-support.ts'

const file = makeFile([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
const listKey = listKeyOf(file.maid_tasks.list_id)

/** Timers that run when the test says so */
function manualTimers() {
  const pending: (() => void)[] = []
  return {
    pending,
    set: (fn: () => void) => {
      pending.push(fn)
      return pending.length - 1
    },
    clear: (timer: unknown) => {
      pending[timer as number] = () => {}
    },
    runAll: () => {
      for (const fn of pending.splice(0)) fn()
    },
  }
}

/** A sync over the transport for a store; `other` is a second device using the same account */
function setup(store: TasksStore, transport: PrefsTransport) {
  const progress = createProgressStore({ transport, now: () => 1_800_000_000_000 })
  const timers = manualTimers()
  const sync = createSync({ store, transport, progress, server: 'dev', timers })
  return { sync, progress, timers }
}

async function startSync(store: TasksStore, transport: PrefsTransport) {
  const made = setup(store, transport)
  await made.sync.start(await made.progress.listAll())
  return made
}

/** Writes statuses to the account as another device would */
async function saveFromOtherDevice(
  transport: PrefsTransport,
  statuses: TaskStatus[],
  hash = orderHash(file),
) {
  const progress = createProgressStore({ transport, now: () => 1_800_000_000_000 })
  return progress.save(listKey, statuses, { orderHash: hash })
}

const metaOf = async (transport: PrefsTransport) =>
  (await createProgressStore({ transport }).listAll()).lists.find(
    (entry) => entry.listKey === listKey,
  )?.meta

describe('first push', () => {
  it('saves a change after the debounce and marks the revisions', async () => {
    const transport = memoryTransport()
    const store = openedStore(file)
    const { sync, timers } = await startSync(store, transport)
    expect(store.getState().sync).toEqual({ kind: 'saved', server: 'dev' })
    expect(transport.calls.filter((call) => call.method !== 'GET')).toEqual([])

    store.getState().actions.setStatus(0, 'done')
    sync.schedule()
    expect(store.getState().sync.kind).toBe('pending')
    // a second change before the timer: still one save
    store.getState().actions.setStatus(1, 'skipped')
    sync.schedule()
    expect(timers.pending.filter((fn) => fn.toString() !== '() => {}')).toHaveLength(1)
    timers.runAll()
    await Bun.sleep(10)

    expect(store.getState().sync).toEqual({ kind: 'saved', server: 'dev' })
    const meta = await metaOf(transport)
    expect(meta?.r).toBe(1)
    expect(store.getState().ackedRevision).toBe(1)
    expect(store.getState().localRevision).toBe(1)
    const loaded = await createProgressStore({ transport }).load(listKey)
    expect(loaded?.statuses).toEqual(['done', 'skipped', 'open'])
    // only single keys are written, never the whole collection
    expect(transport.calls.every((call) => call.method === 'GET' || call.key !== null)).toBe(true)
  })

  it('pushes at start when changes were made before the login', async () => {
    const transport = memoryTransport()
    const store = openedStore(file)
    store.getState().actions.setStatus(2, 'ignored')
    await startSync(store, transport)
    expect((await metaOf(transport))?.r).toBe(1)
    expect(store.getState().sync.kind).toBe('saved')
    expect(store.getState().ackedRevision).toBe(1)
  })

  it('saves again for a change made during a save', async () => {
    const memory = memoryTransport()
    let release: (() => void) | undefined
    let held = false
    const transport: PrefsTransport = {
      ...memory,
      set: async (key, value) => {
        if (!held) {
          held = true
          await new Promise<void>((resolve) => (release = resolve))
        }
        return memory.set(key, value)
      },
    }
    const store = openedStore(file)
    const { sync, timers } = await startSync(store, transport)
    store.getState().actions.setStatus(0, 'done')
    const first = sync.flush()
    await Bun.sleep(5)
    expect(store.getState().sync.kind).toBe('saving')
    store.getState().actions.setStatus(1, 'done')
    sync.schedule() // while saving: marks another save, shows nothing new
    expect(store.getState().sync.kind).toBe('saving')
    release?.()
    await first
    expect(store.getState().sync.kind).toBe('pending')
    timers.runAll()
    await Bun.sleep(20)
    expect(store.getState().sync.kind).toBe('saved')
    expect((await metaOf(memory))?.r).toBe(2)
    expect((await createProgressStore({ transport: memory }).load(listKey))?.statuses).toEqual([
      'done',
      'done',
      'open',
    ])
  })
})

describe('pull', () => {
  it('takes the statuses of a newer account', async () => {
    const transport = memoryTransport()
    await saveFromOtherDevice(transport, ['done', 'done', 'open'])
    const store = openedStore(file)
    await startSync(store, transport)
    expect(store.getState().statuses).toEqual(['done', 'done', 'open'])
    expect(store.getState().ackedRevision).toBe(1)
    expect(store.getState().localRevision).toBe(1)
    expect(store.getState().sync.kind).toBe('saved')
    // nothing was written back
    expect(transport.calls.filter((call) => call.method === 'PUT')).toHaveLength(2) // the other device's save: one chunk and the meta
  })

  it('does nothing when both sides agree', async () => {
    const transport = memoryTransport()
    await saveFromOtherDevice(transport, ['done', 'open', 'open'])
    const store = openedStore(file)
    store.getState().actions.takeRemote(['done', 'open', 'open'], 1)
    const writes = transport.calls.filter((call) => call.method !== 'GET').length
    await startSync(store, transport)
    expect(transport.calls.filter((call) => call.method !== 'GET')).toHaveLength(writes)
    expect(store.getState().sync.kind).toBe('saved')
  })
})

describe('conflict', () => {
  async function conflicted() {
    const transport = memoryTransport()
    await saveFromOtherDevice(transport, ['done', 'open', 'open'])
    const store = openedStore(file)
    store.getState().actions.setStatus(2, 'skipped')
    const made = await startSync(store, transport)
    return { transport, store, ...made }
  }

  it('offers the account copy and writes nothing', async () => {
    const { store, transport } = await conflicted()
    expect(store.getState().sync.kind).toBe('conflict')
    expect(store.getState().conflictOpen).toBe(true)
    expect(store.getState().conflict?.statuses).toEqual(['done', 'open', 'open'])
    expect(store.getState().statuses).toEqual(['open', 'open', 'skipped'])
    expect((await metaOf(transport))?.r).toBe(1)
  })

  it('use the account: takes its statuses', async () => {
    const { store, sync } = await conflicted()
    await sync.resolveConflict('remote')
    expect(store.getState().statuses).toEqual(['done', 'open', 'open'])
    expect(store.getState().conflict).toBeUndefined()
    expect(store.getState().sync.kind).toBe('saved')
    expect(store.getState().ackedRevision).toBe(1)
  })

  it('keep this browser: overwrites the account', async () => {
    const { store, sync, transport } = await conflicted()
    await sync.resolveConflict('local')
    expect(store.getState().sync.kind).toBe('saved')
    expect((await metaOf(transport))?.r).toBe(2)
    expect((await createProgressStore({ transport }).load(listKey))?.statuses).toEqual([
      'open',
      'open',
      'skipped',
    ])
  })

  it('a save finds that the account moved on meanwhile and does not overwrite it', async () => {
    const transport = memoryTransport()
    const store = openedStore(file)
    const { sync } = await startSync(store, transport)
    store.getState().actions.setStatus(0, 'done')
    await saveFromOtherDevice(transport, ['ignored', 'ignored', 'open'])
    await sync.flush()
    expect(store.getState().sync.kind).toBe('conflict')
    expect(store.getState().conflict?.statuses).toEqual(['ignored', 'ignored', 'open'])
    expect((await createProgressStore({ transport }).load(listKey))?.statuses).toEqual([
      'ignored',
      'ignored',
      'open',
    ])
  })
})

describe('failures', () => {
  function failing(error: Error) {
    const memory = memoryTransport()
    const state = { fail: true }
    const transport: PrefsTransport = {
      ...memory,
      set: async (key, value) => {
        if (state.fail) throw error
        return memory.set(key, value)
      },
    }
    return { memory, transport, state }
  }

  it('shows "failed" and keeps the change; retry saves it', async () => {
    const { transport, state, memory } = failing(new Error('network down'))
    const store = openedStore(file)
    const { sync } = await startSync(store, transport)
    store.getState().actions.setStatus(0, 'done')
    await sync.flush()
    expect(store.getState().sync.kind).toBe('failed')
    expect(store.getState().localRevision).toBeGreaterThan(store.getState().ackedRevision)
    state.fail = false
    await sync.retry()
    expect(store.getState().sync.kind).toBe('saved')
    expect((await createProgressStore({ transport: memory }).load(listKey))?.statuses).toEqual([
      'done',
      'open',
      'open',
    ])
  })

  it.each([401, 403])('says the login lacks permission on HTTP %i', async (status) => {
    const { transport } = failing(new PrefsHttpError(status, `HTTP ${status}`))
    const store = openedStore(file)
    const { sync } = await startSync(store, transport)
    store.getState().actions.setStatus(0, 'done')
    await sync.flush()
    expect(store.getState().sync.kind).toBe('forbidden')
  })

  it('a 500 is a plain failure', async () => {
    const { transport } = failing(new PrefsHttpError(500, 'HTTP 500'))
    const store = openedStore(file)
    const { sync } = await startSync(store, transport)
    store.getState().actions.setStatus(0, 'done')
    await sync.flush()
    expect(store.getState().sync.kind).toBe('failed')
  })

  it('a failing listing at the start leaves the local state alone', async () => {
    const store = openedStore(file)
    store.getState().actions.setStatus(0, 'done')
    const transport: PrefsTransport = {
      ...memoryTransport(),
      list: async () => {
        throw new PrefsHttpError(403, 'no')
      },
    }
    const { sync, progress } = setup(store, transport)
    const failed = await progress.listAll().then(
      () => false,
      () => true,
    )
    expect(failed).toBe(true)
    expect(store.getState().statuses[0]).toBe('done')
    sync.dispose()
  })

  it('retry with nothing to save only says saved', async () => {
    const transport = memoryTransport()
    const store = openedStore(file)
    const { sync } = await startSync(store, transport)
    await sync.retry()
    expect(store.getState().sync.kind).toBe('saved')
    expect(transport.calls.filter((call) => call.method === 'PUT')).toEqual([])
  })
})

describe('order hash', () => {
  it('keeps the local state and writes nothing when the account has another order', async () => {
    const transport = memoryTransport()
    await saveFromOtherDevice(transport, ['done', 'done', 'done'], 'zzzzzzzz')
    const store = openedStore(file)
    store.getState().actions.setStatus(0, 'skipped')
    const writes = transport.calls.filter((call) => call.method === 'PUT').length
    const { sync } = await startSync(store, transport)
    expect(store.getState().sync.kind).toBe('mismatch')
    expect(store.getState().statuses).toEqual(['skipped', 'open', 'open'])
    // later changes are not synced either
    store.getState().actions.setStatus(1, 'done')
    sync.schedule()
    expect(store.getState().sync.kind).toBe('mismatch')
    expect(transport.calls.filter((call) => call.method === 'PUT')).toHaveLength(writes)
  })

  it('treats another task count as a mismatch too', async () => {
    const transport = memoryTransport()
    await saveFromOtherDevice(transport, ['done', 'done'])
    const store = openedStore(file)
    await startSync(store, transport)
    expect(store.getState().sync.kind).toBe('mismatch')
  })
})

describe('dispose', () => {
  it('drops the timer and ignores a save that ends later', async () => {
    const transport = memoryTransport()
    const store = openedStore(file)
    const { sync, timers } = await startSync(store, transport)
    store.getState().actions.setStatus(0, 'done')
    sync.schedule()
    sync.dispose()
    timers.runAll()
    await Bun.sleep(5)
    expect(transport.calls.filter((call) => call.method === 'PUT')).toEqual([])
  })
})
