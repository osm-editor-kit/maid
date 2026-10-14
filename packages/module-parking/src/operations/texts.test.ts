import { afterEach, describe, expect, it } from 'bun:test'
import { setLocale } from '@osm-editor-kit/maid-i18n'
import { copyParkingOperation } from './copy-parking.ts'
import { parkingOperations } from './index.ts'
import { removeParkingOperation } from './remove-parking.ts'
import { swapSidesOperation } from './swap-sides.ts'
import { contextOf, entity, graphOf } from './test-helpers.ts'

// The texts are read when they are used: a page in German gets the German menu label, undo name and reason.
describe('the operations follow the page language', () => {
  afterEach(() => setLocale('en'))

  it('gives the menu label, the undo name and the reason in German, and in English again', () => {
    const copy = copyParkingOperation('left', 'right')
    const graph = graphOf(entity('w-1', { highway: 'residential', 'parking:both': 'lane' }))
    const context = contextOf(graph, ['w-1'])

    setLocale('de')
    expect(copy.label).toBe('Parken der linken Seite auf die rechte kopieren')
    expect(copy.disabled(context)).toBe('Die rechte Seite hat schon dieselben Parkangaben.')
    expect(removeParkingOperation.label).toBe('Parkangaben entfernen')
    expect(swapSidesOperation.label).toBe('Parkseiten tauschen')

    setLocale('en')
    expect(copy.label).toBe('Copy left parking to the right side')
    expect(copy.disabled(context)).toBe('The right side already has the same parking tags.')
    expect(removeParkingOperation.label).toBe('Remove parking tags')
  })

  it('names the undo step in German when the operation runs in German', () => {
    const graph = graphOf(entity('w-1', { highway: 'residential', 'parking:left': 'lane' }))
    const context = contextOf(graph, ['w-1'])
    const copy = parkingOperations[0]
    if (!copy) throw new Error('no copy operation')
    setLocale('de')
    expect(copy.disabled(context)).toBeUndefined()
    expect(copy.run(context).annotation).toBe('Parken der linken Seite auf die rechte kopiert')
  })
})
