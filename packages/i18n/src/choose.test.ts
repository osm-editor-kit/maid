import { describe, expect, it } from 'bun:test'
import { chooseLocale, isLocale, LANGUAGE_NAMES, LOCALES } from './choose.ts'

const page = 'http://127.0.0.1:5173/'

describe('chooseLocale', () => {
  it('the lang parameter of the address comes first', () => {
    expect(chooseLocale({ url: `${page}?lang=fr`, stored: 'de', browser: ['es'] })).toBe('fr')
  })

  it('a stored choice comes before the browser', () => {
    expect(chooseLocale({ url: page, stored: 'es', browser: ['de-DE'] })).toBe('es')
  })

  it('the browser languages are read in their order, by their base language', () => {
    expect(chooseLocale({ url: page, browser: ['de-CH', 'fr'] })).toBe('de')
    expect(chooseLocale({ url: page, browser: ['EN-us'] })).toBe('en')
    expect(chooseLocale({ url: page, browser: ['it-IT', 'es-MX', 'de'] })).toBe('es')
  })

  it('English when nothing names a language Maid has', () => {
    expect(chooseLocale({ url: page })).toBe('en')
    expect(chooseLocale({ url: page, browser: ['it', 'ja-JP'] })).toBe('en')
    expect(chooseLocale({ url: page, browser: [] })).toBe('en')
  })

  it('an unknown lang parameter or stored value is passed over', () => {
    expect(chooseLocale({ url: `${page}?lang=xx`, stored: 'de', browser: ['fr'] })).toBe('de')
    expect(chooseLocale({ url: `${page}?lang=`, stored: 'nope', browser: ['fr'] })).toBe('fr')
    expect(chooseLocale({ url: `${page}?lang=DE`, browser: ['es'] })).toBe('es')
  })

  it('an address that does not parse names nothing', () => {
    expect(chooseLocale({ url: 'not a url', stored: 'fr' })).toBe('fr')
    expect(chooseLocale({ url: '' })).toBe('en')
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
})
