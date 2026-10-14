import { describe, expect, it } from 'bun:test'
import { pickFromRoad, roadRank, type FromCandidate } from './from-road.ts'

function road(
  id: string,
  highway: string | undefined,
  extra: Partial<FromCandidate> = {},
): FromCandidate {
  return { id, highway, restricted: false, length: 100, ...extra }
}

describe('roadRank', () => {
  it('orders the highway classes as iD does, the most important first', () => {
    const order = [
      'motorway',
      'trunk',
      'primary',
      'secondary',
      'tertiary',
      'unclassified',
      'residential',
      'service',
    ]
    const ranks = order.map((highway) => roadRank(highway))
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })

  it('puts a link after its road of the same class, and before the next class down', () => {
    expect(roadRank('primary')).toBeLessThan(roadRank('primary_link'))
    expect(roadRank('primary_link')).toBeLessThan(roadRank('secondary'))
  })

  it('puts a road with no or an unknown highway tag last', () => {
    expect(roadRank(undefined)).toBeGreaterThan(roadRank('service'))
    expect(roadRank('busway')).toBeGreaterThan(roadRank('service'))
  })
})

describe('pickFromRoad', () => {
  it('has no road when there is no candidate', () => {
    expect(pickFromRoad([])).toBeUndefined()
  })

  it('picks the road of the highest class', () => {
    expect(
      pickFromRoad([
        road('r1', 'residential', { length: 900 }),
        road('p1', 'primary', { length: 10 }),
      ]),
    ).toBe('p1')
  })

  it('picks the road with restrictions over one without, in the same class', () => {
    expect(
      pickFromRoad([
        road('a', 'residential', { length: 900 }),
        road('b', 'residential', { restricted: true, length: 10 }),
      ]),
    ).toBe('b')
  })

  it('picks the longest road when class and restrictions are the same', () => {
    expect(
      pickFromRoad([
        road('short', 'tertiary', { length: 20 }),
        road('long', 'tertiary', { length: 80 }),
      ]),
    ).toBe('long')
  })

  it('keeps the first candidate when all is equal', () => {
    expect(pickFromRoad([road('first', 'service'), road('second', 'service')])).toBe('first')
  })

  it('is the same whatever the order of the candidates, when the rules tell them apart', () => {
    const roads = [
      road('lane', 'service', { length: 50 }),
      road('main', 'secondary', { length: 30 }),
      road('link', 'secondary_link', { length: 200 }),
    ]
    expect(pickFromRoad(roads)).toBe('main')
    expect(pickFromRoad([...roads].reverse())).toBe('main')
  })
})
