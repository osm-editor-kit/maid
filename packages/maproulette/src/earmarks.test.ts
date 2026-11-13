import { describe, expect, test } from 'bun:test'
import { MapRouletteError, type MapRouletteClient } from './client.ts'
import {
  addEarmark,
  buildResolveComment,
  earmarksForUpload,
  emptyEarmarks,
  findEarmark,
  isEarmarked,
  listEarmarks,
  parseEarmarks,
  removeEarmark,
  resolveAfterUpload,
  restoreEarmarks,
  serializeEarmarks,
  setEarmarkIncluded,
  takeEarmarksForUpload,
} from './earmarks.ts'

describe('the queue', () => {
  test('add, find, list sorted by task id, replace', () => {
    let q = addEarmark(emptyEarmarks, {
      taskId: 10,
      challengeId: 1,
      parentName: 'A',
    })
    q = addEarmark(q, { taskId: '9', challengeId: 1, status: 5 })
    q = addEarmark(q, {
      taskId: 10,
      challengeId: 1,
      status: 2,
      newComment: '  hi ',
    })
    expect(listEarmarks(q).map((e) => e.taskId)).toEqual(['9', '10'])
    expect(findEarmark(q, '10')?.status).toBe(2)
    expect(findEarmark(q, 10)?.newComment).toBe('hi')
    expect(findEarmark(q, 9)?.status).toBe(5)
    expect(isEarmarked(q, 9)).toBe(true)
  })

  test('defaults: Fixed, included, empty strings; the input queue is not changed', () => {
    const q = addEarmark(emptyEarmarks, { taskId: 1 })
    expect(q[0]).toMatchObject({
      taskId: '1',
      challengeId: '',
      status: 1,
      includeInUpload: true,
      elems: [],
      loc: null,
    })
    expect(emptyEarmarks).toEqual([])
  })

  test('remove is the undo', () => {
    const q = addEarmark(addEarmark(emptyEarmarks, { taskId: 1 }), {
      taskId: 2,
    })
    const undone = removeEarmark(q, 1)
    expect(undone.map((e) => e.taskId)).toEqual(['2'])
    expect(q).toHaveLength(2)
    expect(isEarmarked(undone, 1)).toBe(false)
  })

  test('an input without a task id is ignored', () => {
    expect(addEarmark(emptyEarmarks, { taskId: '' })).toEqual([])
  })

  test('check and uncheck; take for upload keeps the unchecked ones', () => {
    let q = addEarmark(addEarmark(emptyEarmarks, { taskId: 1 }), { taskId: 2 })
    q = setEarmarkIncluded(q, 2, false)
    expect(earmarksForUpload(q).map((e) => e.taskId)).toEqual(['1'])
    const { taken, queue } = takeEarmarksForUpload(q)
    expect(taken.map((e) => e.taskId)).toEqual(['1'])
    expect(queue.map((e) => e.taskId)).toEqual(['2'])
  })

  test('restore puts them back as done locally', () => {
    const q = addEarmark(emptyEarmarks, { taskId: 1 })
    const { taken, queue } = takeEarmarksForUpload(q)
    const back = restoreEarmarks(queue, taken)
    expect(back).toHaveLength(1)
    expect(back[0]?.localDone).toBe(true)
  })

  test('empty completion responses are dropped, filled ones kept', () => {
    expect(
      addEarmark(emptyEarmarks, { taskId: 1, completionResponses: {} })[0]?.completionResponses,
    ).toBeUndefined()
    expect(
      addEarmark(emptyEarmarks, {
        taskId: 1,
        completionResponses: { a: true },
      })[0]?.completionResponses,
    ).toEqual({ a: true })
  })
})

describe('serialize and parse', () => {
  test('round trip', () => {
    const q = addEarmark(
      addEarmark(emptyEarmarks, {
        taskId: 2,
        loc: [1, 2],
        elems: ['w1'],
        localDone: true,
      }),
      {
        taskId: 1,
        completionResponses: { s: 'a' },
      },
    )
    expect(parseEarmarks(serializeEarmarks(q))).toEqual(listEarmarks(q))
  })

  test('bad text, a non-list and bad rows', () => {
    expect(parseEarmarks(null)).toEqual([])
    expect(parseEarmarks('{nope')).toEqual([])
    expect(parseEarmarks('{"a":1}')).toEqual([])
    const parsed = parseEarmarks(
      JSON.stringify([
        { taskID: 'x' },
        { taskId: 3, _status: 2 },
        { taskId: 4, loc: ['a', 1], status: null },
      ]),
    )
    expect(parsed.map((e) => e.taskId)).toEqual(['3', '4'])
    expect(parsed[1]).toMatchObject({
      status: 1,
      loc: null,
      includeInUpload: true,
    })
  })
})

describe('buildResolveComment', () => {
  test('who, where, and the quoted changeset comment', () => {
    expect(buildResolveComment('Mia', 'https://osm.test/changeset/5', 'Line one\nLine two')).toBe(
      'Resolved by Mia in changeset https://osm.test/changeset/5\n\n> Line one\n> Line two',
    )
  })

  test('unknown user and no comment', () => {
    expect(buildResolveComment('', 'u', undefined)).toBe('Resolved by unknown in changeset u\n\n> ')
  })
})

describe('resolveAfterUpload', () => {
  type Call = { taskId: string | number; status: number; options: unknown }

  function fakeClient(failing: string[] = []) {
    const calls: Call[] = []
    const client: Pick<MapRouletteClient, 'setStatus'> = {
      async setStatus(taskId, status, options) {
        calls.push({ taskId, status, options })
        if (failing.includes(String(taskId))) throw new MapRouletteError('http', 'boom', 500)
        return { commented: true, released: true }
      },
    }
    return { client, calls }
  }

  const options = {
    changesetId: 55,
    changesetUrl: 'https://osm.test/changeset/55',
    username: 'Mia',
    changesetComment: 'Fix cycleways',
  }

  test('sets every status in order with the comment and the responses', async () => {
    const q = addEarmark(
      addEarmark(emptyEarmarks, {
        taskId: 1,
        status: 1,
        completionResponses: { s: 'a' },
      }),
      { taskId: 2, status: 5 },
    )
    const { client, calls } = fakeClient()
    const progress: unknown[] = []
    const summary = await resolveAfterUpload(client, q, {
      ...options,
      onProgress: (p) => progress.push(p),
    })
    expect(summary).toMatchObject({
      changesetId: '55',
      ok: 2,
      failed: 0,
      failedEarmarks: [],
    })
    expect(calls.map((c) => [c.taskId, c.status])).toEqual([
      ['1', 1],
      ['2', 5],
    ])
    const comment = 'Resolved by Mia in changeset https://osm.test/changeset/55\n\n> Fix cycleways'
    expect(calls[0]?.options).toEqual({
      comment,
      completionResponses: { s: 'a' },
    })
    expect(calls[1]?.options).toEqual({ comment })
    expect(progress).toEqual([
      { index: 1, total: 2, taskId: '1' },
      { index: 2, total: 2, taskId: '2' },
      { index: 2, total: 2, done: true },
    ])
  })

  test('a failure is kept with its earmark and does not stop the others', async () => {
    const q = addEarmark(addEarmark(emptyEarmarks, { taskId: 1 }), {
      taskId: 2,
    })
    const { client, calls } = fakeClient(['1'])
    const summary = await resolveAfterUpload(client, q, options)
    expect(calls).toHaveLength(2)
    expect(summary.ok).toBe(1)
    expect(summary.failed).toBe(1)
    expect(summary.failedEarmarks.map((e) => e.taskId)).toEqual(['1'])
    expect(summary.results[0]).toMatchObject({ taskId: '1', ok: false })
    expect(summary.results[1]).toEqual({ taskId: '2', ok: true })
    const failed = summary.results[0]
    expect(failed && !failed.ok && (failed.error as MapRouletteError).status).toBe(500)
  })

  test('nothing to resolve', async () => {
    const { client, calls } = fakeClient()
    const summary = await resolveAfterUpload(client, [], options)
    expect(summary).toMatchObject({ ok: 0, failed: 0, results: [] })
    expect(calls).toEqual([])
  })
})
