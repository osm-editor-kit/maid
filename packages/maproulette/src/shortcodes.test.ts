import { describe, expect, test } from 'bun:test'
import { completionResponsesFor, parseShortcodes, shortcodeFields } from './shortcodes.ts'

describe('parseShortcodes', () => {
  test('select, checkbox and copyable between text', () => {
    const tokens = parseShortcodes(
      'Pick [select "Surface" name="surface" values="asphalt, gravel,,sand"] and [checkbox "Checked" name="ok"] then [copyable "w123"] done',
    )
    expect(tokens).toEqual([
      { type: 'text', text: 'Pick ' },
      {
        type: 'select',
        label: 'Surface',
        name: 'surface',
        values: ['asphalt', 'gravel', 'sand'],
      },
      { type: 'text', text: ' and ' },
      { type: 'checkbox', label: 'Checked', name: 'ok' },
      { type: 'text', text: ' then ' },
      { type: 'copyable', text: 'w123' },
      { type: 'text', text: ' done' },
    ])
  })

  test('the deprecated triple braces and the slash form', () => {
    expect(parseShortcodes('{{{checkbox "A" name="a"}}}')).toEqual([
      { type: 'checkbox', label: 'A', name: 'a' },
    ])
    expect(parseShortcodes('[copyable/"x y"]')).toEqual([{ type: 'copyable', text: 'x y' }])
  })

  test('html-escaped quotes', () => {
    expect(parseShortcodes('[checkbox &quot;A&quot; name=&quot;a&quot;]')).toEqual([
      { type: 'checkbox', label: 'A', name: 'a' },
    ])
  })

  test('a shortcode that is a Markdown link stays text; an empty copyable is dropped', () => {
    expect(parseShortcodes('[copyable "x"](http://a)')).toEqual([
      { type: 'text', text: '[copyable "x"](http://a)' },
    ])
    expect(parseShortcodes('a[copyable ""]b')).toEqual([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ])
  })

  test('plain text and empty text', () => {
    expect(parseShortcodes('just text')).toEqual([{ type: 'text', text: 'just text' }])
    expect(parseShortcodes('')).toEqual([])
  })
})

describe('completionResponsesFor', () => {
  const tokens = parseShortcodes(
    '[select "S" name="s" values="a,b"] [checkbox "C" name="c"] [checkbox "D" name="d"]',
  )

  test('lists the fields', () => {
    expect(shortcodeFields(tokens).map((f) => f.name)).toEqual(['s', 'c', 'd'])
  })

  test('select without a value is left out; checkboxes are always there; unknown names are dropped', () => {
    expect(completionResponsesFor(tokens, { s: ' a ', c: true, zzz: 'x' })).toEqual({
      s: 'a',
      c: true,
      d: false,
    })
    expect(completionResponsesFor(tokens, { s: '' })).toEqual({
      c: false,
      d: false,
    })
  })
})
