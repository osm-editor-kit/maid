import { afterEach, describe, expect, it } from 'bun:test'
import { bothConflictsSide } from './both-side-conflict.ts'
import { entity, ruleContext } from './test-helpers.ts'

const original = Object.getOwnPropertyDescriptor(globalThis, 'document')

/** The page's language, as the shell sets it; the tests have no page */
function setLanguage(lang: string) {
  Object.defineProperty(globalThis, 'document', {
    value: { documentElement: { lang } },
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'document', original)
  else delete (globalThis as { document?: unknown }).document
})

const road = () =>
  entity('w-1', { highway: 'residential', 'parking:both': 'lane', 'parking:left': 'no' })

describe('the texts of an issue follow the language of the page', () => {
  it('German: the message, the fix and its undo step', () => {
    setLanguage('de')
    const [issue] = bothConflictsSide.validate(road(), ruleContext())
    expect(issue?.message).toContain('Angaben für beide Seiten und für eine Seite zugleich')
    expect(issue?.fixes[0]?.label).toBe('parking:both auf die beiden Seiten aufteilen')
    expect(issue?.fixes[0]?.annotation).toBe('parking:both auf die beiden Seiten aufgeteilt')
  })

  it('any other language, or no page: English', () => {
    setLanguage('fr')
    const [issue] = bothConflictsSide.validate(road(), ruleContext())
    expect(issue?.message).toContain('for both sides and for one side at once')
    expect(issue?.fixes[0]?.label).toBe('Split parking:both into the two sides')
  })
})
