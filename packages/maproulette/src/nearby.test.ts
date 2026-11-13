import { describe, expect, test } from 'bun:test'
import { nearbyChallenges } from './nearby.ts'

const t = (id: number, parentId: number, lng: number, status = 0) => ({
  id,
  parentId,
  point: { lng, lat: 0 },
  status,
})

describe('nearbyChallenges', () => {
  test('groups by challenge, counts open tasks, sorts by the nearest distance', () => {
    const rows = nearbyChallenges(
      [t(1, 20, 0.02), t(2, 20, 0.05), t(3, 10, 0.03), t(4, 30, 0.01, 1), t(5, 30, 0.5, 3)],
      [0, 0],
      { '10': 'Ten', '20': 'Twenty' },
    )
    expect(rows.map((r) => r.challengeId)).toEqual(['20', '10', '30'])
    expect(rows[0]).toMatchObject({
      challengeId: '20',
      name: 'Twenty',
      openCount: 2,
    })
    expect(rows[0]?.nearestDistance).toBeCloseTo(2224, -1)
    expect(rows[1]?.name).toBe('Ten')
    expect(rows[2]).toMatchObject({ challengeId: '30', openCount: 1 })
    expect('name' in (rows[2] ?? {})).toBe(false)
  })

  test('resolved tasks, tasks without a location and an empty list give no row', () => {
    expect(nearbyChallenges([t(1, 1, 0, 1), { id: 2, parentId: 1 }], [0, 0])).toEqual([])
    expect(nearbyChallenges([], [0, 0])).toEqual([])
  })

  test('equal distances sort by challenge id as numbers', () => {
    const rows = nearbyChallenges([t(1, 10, 1), t(2, 9, 1)], [0, 0])
    expect(rows.map((r) => r.challengeId)).toEqual(['9', '10'])
  })

  test('takes loc as well as point', () => {
    const rows = nearbyChallenges([{ id: 1, parentId: 1, loc: [0.01, 0] as const }], [0, 0])
    expect(rows).toHaveLength(1)
  })
})
