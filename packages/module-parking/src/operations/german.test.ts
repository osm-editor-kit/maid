import { describe, expect, it } from 'bun:test'
import { copyParkingOperation } from './copy-parking.ts'
import { inGerman } from './index.ts'
import { contextOf, entity, graphOf } from './test-helpers.ts'

describe('inGerman', () => {
  const copy = inGerman(copyParkingOperation('left', 'right'))

  it('gives the menu label and the name of the undo step in German and keeps the behaviour', () => {
    const graph = graphOf(entity('w-1', { highway: 'residential', 'parking:left': 'lane' }))
    const context = contextOf(graph, ['w-1'])
    expect(copy.label).toBe('Parken der linken Seite auf die rechte kopieren')
    expect(copy.applies(context)).toBe(true)
    expect(copy.disabled(context)).toBeUndefined()
    expect(copy.run(context).annotation).toBe('Parken der linken Seite auf die rechte kopiert')
  })

  it('gives the reason for a disabled operation in German', () => {
    const graph = graphOf(entity('w-1', { highway: 'residential', 'parking:both': 'lane' }))
    expect(copy.disabled(contextOf(graph, ['w-1']))).toBe(
      'Die rechte Seite hat schon dieselben Parkangaben.',
    )
  })
})
