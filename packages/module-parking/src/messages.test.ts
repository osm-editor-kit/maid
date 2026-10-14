import { afterEach, describe, expect, it } from 'bun:test'
import { getLocale, setLocale } from '@osm-editor-kit/maid-i18n'
import { m } from './messages.ts'

// The module's messages are compiled into its own paraglide/ and follow the app's language (linkModuleLocale).
describe('the module texts', () => {
  afterEach(() => setLocale('en'))

  it('follow the language of the page when it changes', () => {
    expect(String(m.section_title())).toBe('Parking')
    setLocale('de')
    expect(getLocale()).toBe('de')
    expect(String(m.section_title())).toBe('Parken')
    setLocale('fr')
    expect(String(m.section_title())).toBe('Stationnement')
    setLocale('es')
    expect(String(m.section_title())).toBe('Aparcamiento')
    setLocale('en')
    expect(String(m.section_title())).toBe('Parking')
  })

  it('are English without a choice of the page (the base language is the fallback)', () => {
    setLocale('en')
    expect(getLocale()).toBe('en')
    expect(String(m.quick_group_label())).toBe('Parking on the selected road')
  })

  it('fill in their values in every language', () => {
    expect(String(m.quick_side_label({ topic: 'No parking', side: 'left side' }))).toBe(
      'No parking, left side',
    )
    setLocale('de')
    expect(String(m.quick_side_label({ topic: 'Kein Parken', side: 'links' }))).toBe(
      'Kein Parken, links',
    )
  })
})
