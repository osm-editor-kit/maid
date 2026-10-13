import { describe, expect, it } from 'bun:test'
import { removeParkingOperation, withoutParking } from './remove-parking.ts'
import { contextOf, entity, graphOf, tagsAfter } from './test-helpers.ts'

describe('parking-remove-tags', () => {
  it('removes every parking key and keeps the other tags', () => {
    expect(
      withoutParking({
        highway: 'residential',
        name: 'Testweg',
        'parking:both': 'lane',
        'parking:left:fee': 'yes',
      }),
    ).toEqual({ highway: 'residential', name: 'Testweg' })
  })

  it('applies to roads with parking keys only, and removes them in one step', () => {
    const road = entity('w-6', { highway: 'residential', 'parking:left': 'lane' })
    const plain = entity('w-7', { highway: 'residential' })
    const graph = graphOf(road, plain)
    expect(removeParkingOperation.applies(contextOf(graph, ['w-7']))).toBe(false)
    const context = contextOf(graph, ['w-6'])
    expect(removeParkingOperation.applies(context)).toBe(true)
    const result = removeParkingOperation.run(context)
    expect(result.annotation).toBe('Removed the parking tags')
    expect(tagsAfter(result, graph, ['w-6'])['w-6']).toEqual({ highway: 'residential' })
  })
})
