import { describe, expect, it } from 'bun:test'
import { chooseLocale, isLocale, LANGUAGE_NAMES, LOCALES } from './choose.ts'

describe('chooseLocale', () => {
  it('the lang parameter of the address comes first', () => {
    expect(chooseLocale({ lang: 'fr', stored: 'de', browser: ['es'] })).toBe('fr')
  })

  it('a stored choice comes before the browser', () => {
    expect(chooseLocale({ stored: 'es', browser: ['de-DE'] })).toBe('es')
  })

  it('the URL comes before the stored choice, and the stored choice is kept for the next visit', () => {
    // the URL's value is only what this visit shows: the stored value is still there to be read
    expect(chooseLocale({ lang: 'fr', stored: 'de' })).toBe('fr')
    expect(chooseLocale({ lang: undefined, stored: 'de' })).toBe('de')
    expect(chooseLocale({ lang: null, stored: 'de' })).toBe('de')
  })

  it('the browser languages are read in their order, by their base language', () => {
    expect(chooseLocale({ browser: ['de-CH', 'fr'] })).toBe('de')
    expect(chooseLocale({ browser: ['EN-us'] })).toBe('en')
    expect(chooseLocale({ browser: ['it-IT', 'es-MX', 'de'] })).toBe('es')
  })

  it('English when nothing names a language Maid has', () => {
    expect(chooseLocale({})).toBe('en')
    expect(chooseLocale({ browser: ['it', 'ja-JP'] })).toBe('en')
    expect(chooseLocale({ browser: [] })).toBe('en')
  })

  it('a lang that is not one of Maid’s, or a stored value that is not, is passed over', () => {
    // the shell only passes a language Maid has; anything else here is no opinion
    expect(chooseLocale({ lang: 'xx', stored: 'de', browser: ['fr'] })).toBe('de')
    expect(chooseLocale({ lang: '', stored: 'nope', browser: ['fr'] })).toBe('fr')
    expect(chooseLocale({ lang: 'DE', browser: ['es'] })).toBe('es')
    expect(chooseLocale({ lang: 'de-DE', browser: ['es'] })).toBe('es')
  })
})

describe('the language list', () => {
  it('has English, German, French and Spanish, each with its own name', () => {
    expect([...LOCALES]).toEqual(['en', 'de', 'fr', 'es'])
    expect(LANGUAGE_NAMES).toEqual({ en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español' })
  })

  it('isLocale accepts only those four', () => {
    expect(isLocale('de')).toBe(true)
    expect(isLocale('it')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
    expect(isLocale(3)).toBe(false)
  })

  it('uses the fallback of the app last, before English', () => {
    expect(chooseLocale({ browser: ['it'], fallback: 'de' })).toBe('de')
    expect(chooseLocale({ browser: ['es'], fallback: 'de' })).toBe('es')
    expect(chooseLocale({ lang: 'fr', stored: 'es', fallback: 'de' })).toBe('fr')
    expect(chooseLocale({ stored: 'en', fallback: 'de' })).toBe('en')
  })
})
