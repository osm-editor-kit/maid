import { afterEach, describe, expect, it } from 'bun:test'
import { setLocale } from '@osm-editor-kit/maid-i18n'
import { bothConflictsSide } from './both-side-conflict.ts'
import { entity, ruleContext } from './test-helpers.ts'

afterEach(() => setLocale('en'))

const road = () =>
  entity('w-1', { highway: 'residential', 'parking:both': 'lane', 'parking:left': 'no' })

// The texts of an issue are made when the rule runs, in the page's language (the module's messages).
describe('the texts of an issue follow the language of the page', () => {
  it('German: the message, the fix and its undo step', () => {
    setLocale('de')
    const [issue] = bothConflictsSide.validate(road(), ruleContext())
    expect(issue?.message).toContain('Angaben für beide Seiten und für eine Seite zugleich')
    expect(issue?.fixes[0]?.label).toBe('parking:both auf die beiden Seiten aufteilen')
    expect(issue?.fixes[0]?.annotation).toBe('parking:both auf die beiden Seiten aufgeteilt')
    expect(bothConflictsSide.label).toBe('Beide Seiten und eine Seite beim selben Schlüssel')
  })

  it('English again after a change back, and English is what a page without a choice gets', () => {
    setLocale('de')
    bothConflictsSide.validate(road(), ruleContext())
    setLocale('en')
    const [issue] = bothConflictsSide.validate(road(), ruleContext())
    expect(issue?.message).toBe(
      'highway=residential has parking:both=lane, parking:left=no: the value is given for both sides and for one side at once',
    )
    expect(issue?.fixes[0]?.label).toBe('Split parking:both into the two sides')
  })
})
