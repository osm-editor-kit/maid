import { describe, expect, test } from 'bun:test'
import {
  challengeIsVisible,
  geometryFeatures,
  parseChallenge,
  parseComments,
  parseTask,
  parseTaskInBox,
  parseTasksInBox,
} from './schema.ts'

describe('parseTaskInBox', () => {
  test('normalises ids to strings and keeps unknown fields', () => {
    const task = parseTaskInBox({
      id: 12,
      parentId: 7,
      point: { lng: '13.4', lat: 52.5 },
      status: '0',
      priority: 1,
      mappedOn: null,
      extra: { a: 1 },
    })
    expect(task?.id).toBe('12')
    expect(task?.parentId).toBe('7')
    expect(task?.point).toEqual({ lng: 13.4, lat: 52.5 })
    expect(task?.status).toBe(0)
    expect(task?.mappedOn).toBeUndefined()
    expect(task?.extra).toEqual({ a: 1 })
  })

  test('takes parent when parentId is missing', () => {
    expect(parseTaskInBox({ id: 1, parent: 9, point: { lng: 0, lat: 0 } })?.parentId).toBe('9')
  })

  test('rejects rows without a point', () => {
    expect(parseTaskInBox({ id: 1, parentId: 2 })).toBeNull()
  })
})

describe('parseTasksInBox', () => {
  const ok = { id: 1, parentId: 2, point: { lng: 1, lat: 2 } }
  test('reads an array or an object with tasks, and drops bad rows', () => {
    expect(parseTasksInBox([ok, { id: 3 }, 'x'])).toHaveLength(1)
    expect(parseTasksInBox({ tasks: [ok, ok] })).toHaveLength(2)
    expect(parseTasksInBox('nope')).toEqual([])
    expect(parseTasksInBox(null)).toEqual([])
  })
})

describe('parseTask and parseChallenge', () => {
  test('a task detail with parent, geometries and instruction', () => {
    const task = parseTask({
      id: 5,
      parent: 3,
      instruction: 'Do it',
      geometries: { type: 'FeatureCollection', features: [] },
      cooperativeWork: { meta: { type: 1 } },
    })
    expect(task?.parentId).toBe('3')
    expect(task?.instruction).toBe('Do it')
    expect(task?.geometries?.features).toEqual([])
  })

  test('a task without an id is not a task', () => {
    expect(parseTask({ name: 'x' })).toBeNull()
    expect(parseTask(null)).toBeNull()
  })

  test('a challenge keeps its check-in texts; visibility needs enabled and not deleted', () => {
    const challenge = parseChallenge({
      id: 4,
      name: 'N',
      enabled: true,
      checkinComment: 'c',
      other: 1,
    })
    expect(challenge?.id).toBe('4')
    expect(challenge?.checkinComment).toBe('c')
    expect(challengeIsVisible(challenge)).toBe(true)
    expect(challengeIsVisible({ enabled: true, deleted: true })).toBe(false)
    expect(challengeIsVisible({ enabled: false })).toBe(false)
    expect(challengeIsVisible(null)).toBe(false)
    expect(parseChallenge('x')).toBeNull()
  })
})

describe('parseComments and geometryFeatures', () => {
  test('comments need text; extra fields stay', () => {
    const list = parseComments([{ id: 1, comment: 'hi', osm_username: 'u', x: 1 }, { id: 2 }, 5])
    expect(list).toHaveLength(1)
    expect(list[0]?.osm_username).toBe('u')
    expect(parseComments(null)).toEqual([])
  })

  test('features of a collection, an array, or nothing', () => {
    expect(geometryFeatures({ type: 'FeatureCollection', features: [1, 2] })).toEqual([1, 2])
    expect(geometryFeatures([3])).toEqual([3])
    expect(geometryFeatures(null)).toEqual([])
    expect(geometryFeatures({})).toEqual([])
  })
})
