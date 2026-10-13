import { describe, expect, it } from 'bun:test'
import { swapSides, swapSidesOperation } from './swap-sides.ts'
import { contextOf, entity, graphOf, tagsAfter } from './test-helpers.ts'

describe('parking-swap-sides', () => {
  it('exchanges the left and right keys and keeps the values and the both keys', () => {
    expect(
      swapSides({
        'parking:left': 'lane',
        'parking:left:orientation': 'parallel',
        'parking:right': 'no',
        'parking:right:reason': 'curve',
        'parking:both:fee': 'yes',
      }),
    ).toEqual({
      'parking:right': 'lane',
      'parking:right:orientation': 'parallel',
      'parking:left': 'no',
      'parking:left:reason': 'curve',
      'parking:both:fee': 'yes',
    })
  })

  it('runs as one action on the selected road', () => {
    const road = entity('w-4', { highway: 'residential', 'parking:left': 'lane' })
    const graph = graphOf(road)
    const context = contextOf(graph, ['w-4'])
    expect(swapSidesOperation.applies(context)).toBe(true)
    expect(swapSidesOperation.disabled(context)).toBeUndefined()
    const result = swapSidesOperation.run(context)
    expect(result.annotation).toBe('Swapped the parking sides')
    expect(tagsAfter(result, graph, ['w-4'])['w-4']).toEqual({
      highway: 'residential',
      'parking:right': 'lane',
    })
  })

  it('is disabled when both sides carry the same tags', () => {
    const road = entity('w-5', {
      highway: 'residential',
      'parking:left': 'lane',
      'parking:right': 'lane',
    })
    const context = contextOf(graphOf(road), ['w-5'])
    expect(swapSidesOperation.applies(context)).toBe(true)
    expect(swapSidesOperation.disabled(context)).toBe(
      'The left and right sides have the same parking tags, so swapping changes nothing.',
    )
  })
})
