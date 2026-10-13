import { describe, expect, it } from 'bun:test'
import { copyParkingOperation, copySide } from './copy-parking.ts'
import { contextOf, entity, graphOf, tagsAfter } from './test-helpers.ts'

describe('parking-copy-left-to-right', () => {
  const copy = copyParkingOperation('left', 'right')

  it('replaces the right side with the left side and collapses equal sides into both', () => {
    const road = entity('w-1', {
      highway: 'residential',
      'parking:left': 'lane',
      'parking:left:orientation': 'parallel',
      'parking:right': 'no',
      'parking:right:reason': 'curve',
    })
    const graph = graphOf(road)
    const context = contextOf(graph, ['w-1'])
    expect(copy.applies(context)).toBe(true)
    expect(copy.disabled(context)).toBeUndefined()
    const result = copy.run(context)
    expect(result.annotation).toBe('Copied the left parking to the right side')
    expect(tagsAfter(result, graph, ['w-1'])['w-1']).toEqual({
      highway: 'residential',
      'parking:both': 'lane',
      'parking:both:orientation': 'parallel',
    })
  })

  it("drops the other side's suffixes that the source does not have", () => {
    expect(
      copySide(
        { 'parking:left': 'lane', 'parking:right': 'no', 'parking:right:reason': 'curve' },
        'left',
        'right',
      ),
    ).toEqual({ 'parking:both': 'lane' })
  })

  it('does not apply when the left side has no parking', () => {
    const road = entity('w-2', { highway: 'residential', 'parking:right': 'lane' })
    expect(copy.applies(contextOf(graphOf(road), ['w-2']))).toBe(false)
  })

  it('is disabled when the right side already has the same tags', () => {
    const road = entity('w-3', { highway: 'residential', 'parking:both': 'lane' })
    const context = contextOf(graphOf(road), ['w-3'])
    expect(copy.applies(context)).toBe(true)
    expect(copy.disabled(context)).toBe('The right side already has the same parking tags.')
  })
})
