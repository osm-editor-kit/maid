import { describe, expect, test } from 'bun:test'
import type { Lens } from '@osm-editor-kit/maid-style'
import { BUILT_IN_LENSES } from './builtin.ts'
import { parseLensFile, serialiseLenses } from './lens-file.ts'

const good: Lens = {
  id: 'my-lens',
  name: 'My lens',
  description: 'Roads in red',
  rest: 'hide',
  geometry: ['line'],
  rules: [
    { match: { highway: ['primary', 'secondary'] }, color: '#ff0000', width: 4, label: 'Main' },
    { match: { highway: true, bridge: true }, color: 'rgb(0, 0, 255)', opacity: 0.5, dash: [4, 2] },
    { match: { surface: false }, color: '#abc' },
  ],
}

function errorsOf(value: unknown, reserved: string[] = []) {
  const result = parseLensFile(JSON.stringify(value), reserved)
  if (result.ok) throw new Error('expected the file to be refused')
  return result.errors
}

describe('parseLensFile: good files', () => {
  test('one lens as an object', () => {
    const result = parseLensFile(JSON.stringify(good))
    expect(result).toEqual({ ok: true, lenses: [good] })
  })

  test('a list of lenses', () => {
    const other = { id: 'other', name: 'Other', rules: [{ match: { a: true }, color: '#000' }] }
    const result = parseLensFile(JSON.stringify([good, other]))
    expect(result.ok && result.lenses.map((l) => l.id)).toEqual(['my-lens', 'other'])
  })

  test('unknown fields are ignored, at every level', () => {
    const result = parseLensFile(
      JSON.stringify({
        ...good,
        version: 9,
        rules: [{ match: { a: true }, color: '#000', comment: 'new' }],
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.lenses[0]?.rules[0]).toEqual({ match: { a: true }, color: '#000' })
  })

  test('a file written by serialiseLenses reads back as the same lenses', () => {
    const again = parseLensFile(serialiseLenses([good]))
    expect(again).toEqual({ ok: true, lenses: [good] })
  })
})

describe('parseLensFile: wrong shape', () => {
  test('not JSON', () => {
    const result = parseLensFile('{ nope')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toStartWith('The file is not valid JSON')
  })

  test('neither a lens nor a list of lenses', () => {
    expect(errorsOf({ lenses: [good] })).toEqual([
      'Expected one lens (an object with id, name and rules) or a list of lenses',
    ])
    expect(errorsOf('text')).toHaveLength(1)
  })

  test('an empty list', () => {
    expect(errorsOf([])).toEqual(['The list has no lenses'])
  })

  test('names where the problem is', () => {
    const errors = errorsOf([
      { ...good, id: 'Bad Id' },
      { ...good, id: 'fine', rules: [{ match: { highway: 'primary' }, color: 'red-ish' }] },
    ])
    expect(errors).toContain(
      'lenses[0].id: expected 1 to 64 lower-case letters, digits, dashes or underscores, starting with a letter or digit',
    )
    expect(errors).toContain(
      'lenses[1].rules[0].color: expected a colour like #1a7f37 or rgb(26, 127, 55)',
    )
  })

  test('a single lens reports its path as lens', () => {
    expect(errorsOf({ ...good, rest: 'sometimes' })).toEqual([
      'lens.rest: expected one of dim, normal, hide',
    ])
  })

  test('numbers and match values are checked', () => {
    const errors = errorsOf({
      ...good,
      rules: [
        { match: { highway: [] }, width: 0 },
        { match: { highway: 3 }, opacity: 2 },
        { match: { highway: 'primary' }, dash: [0] },
      ],
    })
    expect(errors).toContain(
      'lens.rules[0].match.highway: expected a value, a list of values, true (the tag is set) or false (the tag is missing)',
    )
    expect(errors).toContain('lens.rules[0].width: expected a number above 0 and up to 20 (px)')
    expect(errors).toContain(
      'lens.rules[1].match.highway: expected a value, a list of values, true (the tag is set) or false (the tag is missing)',
    )
    expect(errors).toContain('lens.rules[1].opacity: expected a number from 0 to 1')
    expect(errors).toContain(
      'lens.rules[2].dash: expected 1 to 8 lengths in px, each above 0 and up to 100',
    )
  })

  test('the geometry list accepts only line, area and point', () => {
    expect(errorsOf({ ...good, geometry: ['road'] })).toEqual([
      'lens.geometry: expected a list of line, area or point',
    ])
  })

  test('a lens without rules, and ids used twice or built in', () => {
    expect(errorsOf({ id: 'a', name: 'A', rules: [] })).toEqual([
      'lens.rules: expected a list with at least one rule',
    ])
    expect(errorsOf([good, good])).toEqual(['lenses[1].id: "my-lens" is used twice in the file'])
    expect(errorsOf(good, ['my-lens'])).toEqual(['lens.id: "my-lens" is a built-in lens'])
  })

  test('none is no lens in a link, so a file cannot use it as an id', () => {
    expect(errorsOf({ ...good, id: 'none' })).toEqual(['lens.id: "none" means no lens in a link'])
  })

  test('the built-in lenses are reserved when the module passes them', () => {
    const ids = BUILT_IN_LENSES.map((lens) => lens.id)
    const result = parseLensFile(JSON.stringify({ ...good, id: 'surface' }), ids)
    expect(result.ok).toBe(false)
  })
})
