import { describe, expect, test } from 'bun:test'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { commitLanguageRow, languageVariants, normalizeLanguageCode } from './localized-logic.ts'

const name: Field = {
  id: 'name',
  type: 'localized',
  key: 'name',
  label: 'Name',
  options: [],
  universal: true,
}

describe('languageVariants', () => {
  test('lists name:<language> keys, by code', () => {
    const tags: Tags = {
      name: 'Berlin',
      'name:de': 'Berlin',
      'name:en': 'Berlin',
      'name:zh-Hans': '柏林',
      'name:pt-BR': 'Berlim',
    }
    expect(languageVariants(name, tags)).toEqual([
      { tagKey: 'name:de', code: 'de', value: 'Berlin' },
      { tagKey: 'name:en', code: 'en', value: 'Berlin' },
      { tagKey: 'name:pt-BR', code: 'pt-BR', value: 'Berlim' },
      { tagKey: 'name:zh-Hans', code: 'zh-Hans', value: '柏林' },
    ])
  })

  test('name:etymology, name:etymology:wikidata, name:left and name:source are not translations', () => {
    const tags: Tags = {
      name: 'Berlin',
      'name:etymology': 'Berlin, a person',
      'name:etymology:wikidata': 'Q1',
      'name:left': 'Berlin',
      'name:source': 'survey',
    }
    expect(languageVariants(name, tags)).toEqual([])
  })

  test('an empty translation is not listed', () => {
    expect(languageVariants(name, { name: 'Berlin', 'name:de': '' })).toEqual([])
  })

  test('a field without a key has no translations', () => {
    expect(languageVariants({ ...name, key: undefined }, { 'name:de': 'Berlin' })).toEqual([])
  })
})

describe('normalizeLanguageCode', () => {
  test('a language of two or three letters', () => {
    expect(normalizeLanguageCode('de')).toBe('de')
    expect(normalizeLanguageCode('DE')).toBe('de')
    expect(normalizeLanguageCode('deu')).toBe('deu')
    expect(normalizeLanguageCode(' fr ')).toBe('fr')
  })

  test('an optional script (title case) and region (upper case)', () => {
    expect(normalizeLanguageCode('pt-br')).toBe('pt-BR')
    expect(normalizeLanguageCode('zh-hans')).toBe('zh-Hans')
    expect(normalizeLanguageCode('zh-hant-tw')).toBe('zh-Hant-TW')
    expect(normalizeLanguageCode('es-419')).toBe('es-419')
    expect(normalizeLanguageCode('de_CH')).toBe('de-CH')
  })

  test('refuses what is not a language code', () => {
    expect(normalizeLanguageCode('')).toBeUndefined()
    expect(normalizeLanguageCode('d')).toBeUndefined()
    expect(normalizeLanguageCode('english')).toBeUndefined()
    expect(normalizeLanguageCode('left')).toBeUndefined()
    expect(normalizeLanguageCode('de-x-foo')).toBeUndefined()
    expect(normalizeLanguageCode('de-')).toBeUndefined()
    expect(normalizeLanguageCode('de:CH')).toBeUndefined()
  })
})

describe('commitLanguageRow', () => {
  const base = 'name'

  test('an unchanged translation writes nothing', () => {
    expect(
      commitLanguageRow({
        base,
        tags: { 'name:de': 'Berlin' },
        tagKey: 'name:de',
        code: 'de',
        value: 'Berlin',
      }),
    ).toEqual({ kind: 'write', edits: [] })
  })

  test('a changed value writes its key', () => {
    expect(
      commitLanguageRow({
        base,
        tags: { 'name:de': 'Berlin' },
        tagKey: 'name:de',
        code: 'de',
        value: 'Berlin (Stadt)',
      }),
    ).toEqual({ kind: 'write', edits: [{ key: 'name:de', value: 'Berlin (Stadt)' }] })
  })

  test('an emptied value removes the translation', () => {
    expect(
      commitLanguageRow({
        base,
        tags: { 'name:de': 'Berlin' },
        tagKey: 'name:de',
        code: 'de',
        value: '  ',
      }),
    ).toEqual({ kind: 'write', edits: [{ key: 'name:de', value: undefined }] })
  })

  test('a changed code renames the key: the old one goes, the new one holds the value', () => {
    expect(
      commitLanguageRow({
        base,
        tags: { 'name:de': 'Berlin' },
        tagKey: 'name:de',
        code: 'fr',
        value: 'Berlin',
      }),
    ).toEqual({
      kind: 'write',
      edits: [
        { key: 'name:de', value: undefined },
        { key: 'name:fr', value: 'Berlin' },
      ],
    })
  })

  test('a renamed code with an emptied value only removes the old key', () => {
    expect(
      commitLanguageRow({
        base,
        tags: { 'name:de': 'Berlin' },
        tagKey: 'name:de',
        code: 'fr',
        value: '',
      }),
    ).toEqual({ kind: 'write', edits: [{ key: 'name:de', value: undefined }] })
  })

  test('a code that differs only in case is the same key', () => {
    expect(
      commitLanguageRow({
        base,
        tags: { 'name:pt-BR': 'Berlim' },
        tagKey: 'name:pt-BR',
        code: 'PT-br',
        value: 'Berlim',
      }),
    ).toEqual({ kind: 'write', edits: [] })
  })

  test('a rename onto a key that has a value is an error and writes nothing', () => {
    expect(
      commitLanguageRow({
        base,
        tags: { 'name:de': 'Berlin', 'name:en': 'Berlin' },
        tagKey: 'name:de',
        code: 'en',
        value: 'Berlin',
      }),
    ).toEqual({ kind: 'error', message: 'name:en already has a value.' })
  })

  test('an invalid code is an error', () => {
    expect(
      commitLanguageRow({
        base,
        tags: { 'name:de': 'Berlin' },
        tagKey: 'name:de',
        code: 'left',
        value: 'Berlin',
      }).kind,
    ).toBe('error')
  })

  test('an empty code on a translation is an error, not a removal', () => {
    expect(
      commitLanguageRow({
        base,
        tags: { 'name:de': 'Berlin' },
        tagKey: 'name:de',
        code: '',
        value: 'Berlin',
      }).kind,
    ).toBe('error')
  })

  test('a row being added with a code and a value writes the translation', () => {
    expect(
      commitLanguageRow({ base, tags: { name: 'Berlin' }, code: 'de', value: 'Berlin' }),
    ).toEqual({ kind: 'write', edits: [{ key: 'name:de', value: 'Berlin' }] })
  })

  test('a row being added with only a code waits for its value', () => {
    expect(commitLanguageRow({ base, tags: { name: 'Berlin' }, code: 'de', value: '' })).toEqual({
      kind: 'wait',
    })
  })

  test('a row being added with only a value waits for its code', () => {
    expect(
      commitLanguageRow({ base, tags: { name: 'Berlin' }, code: '', value: 'Berlin' }),
    ).toEqual({ kind: 'wait' })
  })

  test('an empty row being added is discarded', () => {
    expect(commitLanguageRow({ base, tags: { name: 'Berlin' }, code: ' ', value: '' })).toEqual({
      kind: 'discard',
    })
  })

  test('a row being added with a code that already has a value is an error', () => {
    expect(
      commitLanguageRow({
        base,
        tags: { name: 'Berlin', 'name:de': 'Berlin' },
        code: 'de',
        value: 'Berlin Mitte',
      }),
    ).toEqual({ kind: 'error', message: 'name:de already has a value.' })
  })

  test('the value is cleaned as other text fields: trimmed, and not cut at 255 characters', () => {
    const long = 'x'.repeat(300)
    const commit = commitLanguageRow({ base, tags: {}, code: 'de', value: `  ${long}  ` })
    expect(commit).toEqual({
      kind: 'write',
      edits: [{ key: 'name:de', value: 'x'.repeat(300) }],
    })
  })
})
