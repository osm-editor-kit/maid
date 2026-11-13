import { describe, expect, test } from 'bun:test'
import {
  mapDataNextAction,
  nextTaskActionsForPool,
  parseChallengeFilter,
  pickNearest,
  pickPriority,
  pickRandomNearby,
  preferredChallengeIds,
  resolveCandidatePool,
  type NextTaskCandidate,
} from './next-task.ts'

function task(
  id: string,
  parentId: string,
  loc: [number, number],
  priority?: number,
  status = 0,
): NextTaskCandidate {
  return { id, parentId, loc, priority, status }
}

describe('preferredChallengeIds', () => {
  test('filter first, then last worked, then the current challenge', () => {
    expect(
      preferredChallengeIds({
        filter: ['10', '20'],
        lastChallengeId: '99',
        currentChallengeId: '5',
      }),
    ).toEqual(['10', '20'])
    expect(preferredChallengeIds({ filter: '10, 20', lastChallengeId: '99' })).toEqual(['10', '20'])
    expect(preferredChallengeIds({ lastChallengeId: '99', currentChallengeId: '5' })).toEqual([
      '99',
    ])
    expect(preferredChallengeIds({ currentChallengeId: 5 })).toEqual(['5'])
    expect(preferredChallengeIds({})).toEqual([])
  })

  test('parseChallengeFilter', () => {
    expect(parseChallengeFilter('1, 2,,true')).toEqual(['1', '2'])
    expect(parseChallengeFilter('true')).toEqual([])
    expect(parseChallengeFilter(null)).toEqual([])
  })
})

describe('resolveCandidatePool', () => {
  const tasks = [
    task('1', '7', [0, 0], 1),
    task('2', '7', [0.01, 0], 0),
    task('3', '8', [0.02, 0], 0),
    task('4', '7', [0.03, 0], 0, 1),
  ]

  test('primary when a preferred challenge has open tasks (resolved and excluded ones do not count)', () => {
    const pool = resolveCandidatePool(tasks, {
      preferredChallengeIds: ['7'],
      excludeId: '1',
    })
    expect(pool.mode).toBe('primary')
    expect(pool.tasks.map((t) => t.id)).toEqual(['2'])
    expect(nextTaskActionsForPool(pool)).toEqual({
      showNearest: true,
      showPriority: true,
      showRandom: false,
    })
    expect(mapDataNextAction(pool)).toBe('nearest')
  })

  test('fallback when only other challenges have open tasks', () => {
    const pool = resolveCandidatePool(tasks, { preferredChallengeIds: ['9'] })
    expect(pool.mode).toBe('fallback')
    expect(pool.tasks).toHaveLength(3)
    expect(nextTaskActionsForPool(pool)).toEqual({
      showNearest: false,
      showPriority: false,
      showRandom: true,
    })
    expect(mapDataNextAction(pool)).toBe('random')
  })

  test('without a preferred scope all open tasks are primary', () => {
    expect(resolveCandidatePool(tasks).mode).toBe('primary')
  })

  test('empty when nothing is open', () => {
    const pool = resolveCandidatePool([task('4', '7', [0, 0], 0, 1)], {})
    expect(pool.mode).toBe('empty')
    expect(nextTaskActionsForPool(pool)).toEqual({
      showNearest: false,
      showPriority: false,
      showRandom: false,
    })
    expect(mapDataNextAction(pool)).toBeNull()
  })
})

describe('pickers', () => {
  const pool = [
    task('a', '1', [0.03, 0], 1),
    task('b', '1', [0.01, 0], 1),
    task('c', '1', [0.02, 0], 0),
    task('d', '1', [0.005, 0]),
  ]

  test('nearest', () => {
    expect(pickNearest(pool, [0, 0])?.id).toBe('d')
    expect(pickNearest([], [0, 0])).toBeNull()
  })

  test('priority: lowest number, nearest among equals, a missing one last', () => {
    expect(pickPriority(pool, [0, 0])?.id).toBe('c')
    expect(pickPriority([pool[0]!, pool[1]!, pool[3]!], [0, 0])?.id).toBe('b')
    expect(pickPriority([], [0, 0])).toBeNull()
  })

  test('random among the viewport tasks of the pool, else the pool', () => {
    expect(pickRandomNearby(pool, [pool[1]!, pool[2]!], () => 0)?.id).toBe('b')
    expect(pickRandomNearby(pool, [pool[1]!, pool[2]!], () => 0.99)?.id).toBe('c')
    expect(pickRandomNearby(pool, [{ id: 'zzz', parentId: '1' }], () => 0)?.id).toBe('a')
    expect(pickRandomNearby(pool, null, () => 0.999)?.id).toBe('d')
    expect(pickRandomNearby([], null)).toBeNull()
  })
})
