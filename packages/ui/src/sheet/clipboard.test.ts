import { describe, expect, it } from 'bun:test'
import {
  parseTagText,
  parseTsv,
  planPositionalPaste,
  serializeTags,
  serializeTsv,
  type PasteGrid,
} from './clipboard.ts'
import type { SheetCellData, SheetColumn, SheetRow } from './types.ts'

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

const columns: SheetColumn[] = [
  { id: 'key', header: 'Key', width: '2fr' },
  { id: 'value', header: 'Value', width: '3fr' },
]

function text(value: string): SheetCellData {
  return { value: { kind: 'value', text: value } }
}

function row(id: string, key: string, value: string): SheetRow {
  return { id, label: id, cells: { key: text(key), value: text(value) } }
}

/** A counter for minted ids, made per test */
function minter(): () => string {
  const made = { count: 0 }
  return () => {
    made.count += 1
    return `new${made.count}`
  }
}

function gridOf(rows: SheetRow[], trailingId?: string, cols: SheetColumn[] = columns): PasteGrid {
  return trailingId === undefined
    ? { rows, columns: cols, newRowId: minter() }
    : { rows, columns: cols, trailingId, newRowId: minter() }
}

const rowsBase = (): SheetRow[] => [row('r1', 'highway', 'residential'), row('r2', 'name', 'A')]

// ---------------------------------------------------------------------------------------------
// spreadsheet text
// ---------------------------------------------------------------------------------------------

describe('parseTsv', () => {
  it('reads cells by tabs and rows by line breaks, ignoring a trailing line break', () => {
    expect(parseTsv('a\tb\nc\td\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('reads Windows (CRLF) and old Mac (CR) line ends', () => {
    expect(parseTsv('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(parseTsv('a\rb')).toEqual([['a'], ['b']])
  })

  it('reads quoted cells with tabs, line breaks and doubled quotes as one cell', () => {
    expect(parseTsv('"x\ty\nz"\t"say ""hi"""\nq')).toEqual([['x\ty\nz', 'say "hi"'], ['q']])
  })

  it('ignores a UTF-8 byte order mark at the start', () => {
    expect(parseTsv('﻿a\tb')).toEqual([['a', 'b']])
  })

  it('reads an empty text as no rows and quoted empty cells as empty cells', () => {
    expect(parseTsv('')).toEqual([])
    expect(parseTsv('""\t""')).toEqual([['', '']])
  })

  it('takes an unterminated quote up to the end of the text', () => {
    expect(parseTsv('"abc\td')).toEqual([['abc\td']])
  })

  it('reads emoji as whole characters', () => {
    expect(parseTsv('a🍰\t🍰')).toEqual([['a🍰', '🍰']])
  })
})

describe('serializeTsv', () => {
  it('quotes cells with quotes, tabs and line breaks, doubling the quotes', () => {
    expect(
      serializeTsv([
        ['a\tb', 'c'],
        ['say "hi"', 'x\ny'],
      ]),
    ).toBe('"a\tb"\tc\n"say ""hi"""\t"x\ny"')
  })

  it('round-trips through parseTsv, including single empty cells and empty rows of cells', () => {
    const rows = [['a\tb', 'c'], ['say "hi"', 'x\ny'], [''], ['', '']]
    expect(parseTsv(serializeTsv(rows))).toEqual(rows)
  })
})

// ---------------------------------------------------------------------------------------------
// positional paste
// ---------------------------------------------------------------------------------------------

describe('planPositionalPaste', () => {
  it('writes one value into the target cell and counts a replacement', () => {
    const plan = planPositionalPaste(
      gridOf(rowsBase()),
      { row: 'r2', col: 'value' },
      {
        text: 'B',
        selection: [],
      },
    )
    expect(plan.changes).toEqual([{ type: 'set', row: 'r2', col: 'value', text: 'B' }])
    expect(plan.report).toEqual({ added: 0, replaced: 1, unchanged: 0, refused: [] })
  })

  it('writes nothing for a value the cell already has, and counts it as unchanged', () => {
    const plan = planPositionalPaste(
      gridOf(rowsBase()),
      { row: 'r1', col: 'key' },
      {
        text: 'highway',
        selection: [],
      },
    )
    expect(plan.changes).toEqual([])
    expect(plan.report.unchanged).toBe(1)
  })

  it('fills the whole selected range with a single value', () => {
    const selection = [
      { row: 'r1', col: 'key' },
      { row: 'r1', col: 'value' },
      { row: 'r2', col: 'key' },
      { row: 'r2', col: 'value' },
    ]
    const plan = planPositionalPaste(
      gridOf(rowsBase()),
      { row: 'r1', col: 'key' },
      {
        text: 'x',
        selection,
      },
    )
    expect(plan.changes).toHaveLength(4)
    expect(plan.changes.every((c) => c.type === 'set' && c.text === 'x')).toBe(true)
    expect(plan.report.replaced).toBe(4)
  })

  it('extends a block larger than the selection from the selection top left', () => {
    const plan = planPositionalPaste(
      gridOf(rowsBase()),
      { row: 'r1', col: 'key' },
      {
        text: 'a\tb\nc\td',
        selection: [{ row: 'r1', col: 'key' }],
      },
    )
    expect(plan.changes).toEqual([
      { type: 'set', row: 'r1', col: 'key', text: 'a' },
      { type: 'set', row: 'r1', col: 'value', text: 'b' },
      { type: 'set', row: 'r2', col: 'key', text: 'c' },
      { type: 'set', row: 'r2', col: 'value', text: 'd' },
    ])
  })

  it('drops the cells past the last column and refuses them with their text', () => {
    const plan = planPositionalPaste(
      gridOf(rowsBase()),
      { row: 'r1', col: 'value' },
      {
        text: 'x\ty',
        selection: [],
      },
    )
    expect(plan.changes).toEqual([{ type: 'set', row: 'r1', col: 'value', text: 'x' }])
    expect(plan.report.refused).toEqual([{ line: 1, text: 'y', reason: 'outside the sheet' }])
  })

  it('turns rows past the last row into inserts through the trailing row', () => {
    const plan = planPositionalPaste(
      gridOf(rowsBase(), 'trail'),
      { row: 'r2', col: 'key' },
      {
        text: 'k1\tv1\nk2\tv2\nk3\tv3',
        selection: [],
      },
    )
    expect(plan.changes).toEqual([
      { type: 'set', row: 'r2', col: 'key', text: 'k1' },
      { type: 'set', row: 'r2', col: 'value', text: 'v1' },
      { type: 'insert', row: 'new1', cells: { key: 'k2', value: 'v2' } },
      { type: 'insert', row: 'new2', cells: { key: 'k3', value: 'v3' } },
    ])
    expect(plan.report).toEqual({ added: 4, replaced: 2, unchanged: 0, refused: [] })
  })

  it('starts on the trailing row as an insert when the target is the trailing row', () => {
    const plan = planPositionalPaste(
      gridOf(rowsBase(), 'trail'),
      { row: 'trail', col: 'key' },
      {
        text: 'k\tv',
        selection: [],
      },
    )
    expect(plan.changes).toEqual([{ type: 'insert', row: 'new1', cells: { key: 'k', value: 'v' } }])
    expect(plan.report.added).toBe(2)
  })

  it('refuses rows past the last row when the sheet has no trailing row', () => {
    const plan = planPositionalPaste(
      gridOf(rowsBase()),
      { row: 'r2', col: 'key' },
      {
        text: 'k1\tv1\nk2\tv2\nk3\tv3',
        selection: [],
      },
    )
    expect(plan.changes.map((c) => c.type)).toEqual(['set', 'set'])
    expect(plan.report.refused.map((r) => [r.line, r.text, r.reason])).toEqual([
      [2, 'k2', 'below the last row'],
      [2, 'v2', 'below the last row'],
      [3, 'k3', 'below the last row'],
      [3, 'v3', 'below the last row'],
    ])
  })

  it('refuses read-only cells when the text would change them, and counts the same text as unchanged', () => {
    const rows = [row('r1', 'highway', 'residential'), { ...row('ro', 'a', 'b'), readOnly: true }]
    const plan = planPositionalPaste(
      gridOf(rows),
      { row: 'ro', col: 'key' },
      {
        text: 'a\tz',
        selection: [],
      },
    )
    expect(plan.changes).toEqual([])
    expect(plan.report.unchanged).toBe(1)
    expect(plan.report.refused).toEqual([{ line: 1, text: 'z', reason: 'read-only' }])
  })

  it('clears a cell for an empty quoted cell, and leaves an absent cell empty', () => {
    const rows = [row('r1', 'highway', 'residential'), { id: 'e', label: 'e', cells: {} }]
    const cleared = planPositionalPaste(
      gridOf(rows),
      { row: 'r1', col: 'value' },
      {
        text: '""',
        selection: [],
      },
    )
    expect(cleared.changes).toEqual([{ type: 'clear', row: 'r1', col: 'value' }])
    expect(cleared.report.replaced).toBe(1)

    const absent = planPositionalPaste(
      gridOf(rows),
      { row: 'e', col: 'value' },
      {
        text: '""',
        selection: [],
      },
    )
    expect(absent.changes).toEqual([])
    expect(absent.report.unchanged).toBe(1)
  })

  it('applies the column clean to the text', () => {
    const cleaning: SheetColumn[] = [
      { id: 'key', header: 'Key', width: '2fr', clean: (t) => t.trim() },
      { id: 'value', header: 'Value', width: '3fr' },
    ]
    const plan = planPositionalPaste(
      gridOf(rowsBase(), undefined, cleaning),
      { row: 'r2', col: 'key' },
      {
        text: '  x  ',
        selection: [],
      },
    )
    expect(plan.changes).toEqual([{ type: 'set', row: 'r2', col: 'key', text: 'x' }])
  })

  it('keeps a quoted cell with a tab and a line break as one value', () => {
    const plan = planPositionalPaste(
      gridOf(rowsBase()),
      { row: 'r1', col: 'key' },
      {
        text: '"a\tb\nc"\td',
        selection: [],
      },
    )
    expect(plan.changes).toEqual([
      { type: 'set', row: 'r1', col: 'key', text: 'a\tb\nc' },
      { type: 'set', row: 'r1', col: 'value', text: 'd' },
    ])
  })

  it('counts a cell with several values as replaced', () => {
    const rows: SheetRow[] = [
      {
        id: 'm',
        label: 'm',
        cells: {
          key: text('name'),
          value: {
            value: {
              kind: 'mixed',
              values: [
                { text: 'A', count: 1 },
                { text: undefined, count: 1 },
              ],
            },
          },
        },
      },
    ]
    const plan = planPositionalPaste(
      gridOf(rows),
      { row: 'm', col: 'value' },
      { text: 'x', selection: [] },
    )
    expect(plan.changes).toEqual([{ type: 'set', row: 'm', col: 'value', text: 'x' }])
    expect(plan.report.replaced).toBe(1)
  })

  it('gives no change for an empty text, or a target the sheet does not have', () => {
    expect(
      planPositionalPaste(
        gridOf(rowsBase()),
        { row: 'r1', col: 'key' },
        { text: '', selection: [] },
      ),
    ).toEqual({ changes: [], report: { added: 0, replaced: 0, unchanged: 0, refused: [] } })
    expect(
      planPositionalPaste(
        gridOf(rowsBase()),
        { row: 'nope', col: 'key' },
        { text: 'x', selection: [] },
      ).changes,
    ).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// tags as text: the twelve forms of design section 6
// ---------------------------------------------------------------------------------------------

describe('parseTagText, the example table of the design', () => {
  it('1. a single pair is an entry', () => {
    expect(parseTagText('surface=asphalt')).toEqual({
      entries: [{ key: 'surface', value: 'asphalt', line: 1 }],
      refused: [],
      superseded: [],
    })
  })

  it('2 and 3. a pair with an existing key is an entry too (the plan decides replace or unchanged)', () => {
    expect(parseTagText('name=B').entries).toEqual([{ key: 'name', value: 'B', line: 1 }])
    expect(parseTagText('name=A').entries).toEqual([{ key: 'name', value: 'A', line: 1 }])
  })

  it('4. spaces around the first = are trimmed, and a tab separates key from value', () => {
    expect(parseTagText('lit = yes\nsmoothness\tgood').entries).toEqual([
      { key: 'lit', value: 'yes', line: 1 },
      { key: 'smoothness', value: 'good', line: 2 },
    ])
  })

  it('5. a quoted key and a quoted value are read as JSON strings', () => {
    expect(parseTagText('"name"="Café \\"Zur Post\\""').entries).toEqual([
      { key: 'name', value: 'Café "Zur Post"', line: 1 },
    ])
  })

  it('6. a value with = keeps everything after the first =', () => {
    expect(parseTagText('website=https://example.org/?a=1&b=2').entries).toEqual([
      { key: 'website', value: 'https://example.org/?a=1&b=2', line: 1 },
    ])
  })

  it('7. empty and comment lines are skipped; a repeated key keeps the last line and names the replaced one', () => {
    const parsed = parseTagText('maxspeed=30\n\n# note\nmaxspeed=50')
    expect(parsed.entries).toEqual([{ key: 'maxspeed', value: '50', line: 4 }])
    expect(parsed.superseded).toEqual([{ key: 'maxspeed', line: 1, by: 4 }])
    expect(parsed.refused).toEqual([])
  })

  it('8. a JSON object of values: numbers and booleans become text, null is refused for its key', () => {
    const parsed = parseTagText('{"lanes": 2, "oneway": "yes", "x": null}')
    expect(parsed.entries).toEqual([
      { key: 'lanes', value: '2', line: 0 },
      { key: 'oneway', value: 'yes', line: 0 },
    ])
    expect(parsed.refused).toEqual([{ line: 0, text: 'x', reason: 'not a text' }])
  })

  it('9. Overpass form: the brackets are removed and ][ splits the line', () => {
    expect(parseTagText('["highway"="primary"]["ref"="B 1"]').entries).toEqual([
      { key: 'highway', value: 'primary', line: 1 },
      { key: 'ref', value: 'B 1', line: 1 },
    ])
  })

  it('10. lines without a separator, with an empty key or with an empty value are refused, each with its line', () => {
    const parsed = parseTagText('foo\n=bar\nbaz=')
    expect(parsed.entries).toEqual([])
    expect(parsed.refused).toEqual([
      { line: 1, text: 'foo', reason: 'no separator' },
      { line: 2, text: '=bar', reason: 'empty key' },
      { line: 3, text: 'baz=', reason: 'empty value' },
    ])
  })

  it("11. a line without a separator is refused here; reading it as the value of the cell is the plan's rule (step 3)", () => {
    expect(parseTagText('asphalt').refused).toEqual([
      { line: 1, text: 'asphalt', reason: 'no separator' },
    ])
  })

  it('12. a value of 300 characters is kept whole, not cut', () => {
    const value = 'x'.repeat(300)
    expect(parseTagText(`note=${value}`).entries).toEqual([{ key: 'note', value, line: 1 }])
  })
})

describe('parseTagText, further forms', () => {
  it('reads Windows line ends', () => {
    expect(parseTagText('a=1\r\nb=2\r\n').entries).toEqual([
      { key: 'a', value: '1', line: 1 },
      { key: 'b', value: '2', line: 2 },
    ])
  })

  it('ignores a byte order mark at the start, before a line or a JSON object', () => {
    expect(parseTagText('﻿name=A').entries).toEqual([{ key: 'name', value: 'A', line: 1 }])
    expect(parseTagText('﻿{"name":"A"}').entries).toEqual([{ key: 'name', value: 'A', line: 0 }])
  })

  it('keeps an emoji in a value', () => {
    expect(parseTagText('note=🍰 cake 🎂').entries).toEqual([
      { key: 'note', value: '🍰 cake 🎂', line: 1 },
    ])
  })

  it('keeps a colon in a key', () => {
    expect(parseTagText('addr:street=Main Street').entries).toEqual([
      { key: 'addr:street', value: 'Main Street', line: 1 },
    ])
  })

  it('keeps spaces inside a key', () => {
    expect(parseTagText('old name=Foo').entries).toEqual([
      { key: 'old name', value: 'Foo', line: 1 },
    ])
  })

  it('refuses a JSON array as a whole', () => {
    expect(parseTagText('["a","b"]')).toEqual({
      entries: [],
      refused: [{ line: 0, text: '["a","b"]', reason: 'a JSON array, not tags' }],
      superseded: [],
    })
  })

  it('refuses each non-text value of a JSON object and keeps the others', () => {
    const parsed = parseTagText('{"name":"A","x":null,"y":{"z":1},"w":["a"]}')
    expect(parsed.entries).toEqual([{ key: 'name', value: 'A', line: 0 }])
    expect(parsed.refused.map((r) => [r.text, r.reason])).toEqual([
      ['x', 'not a text'],
      ['y', 'not a text'],
      ['w', 'not a text'],
    ])
  })

  it('reads the object under tags or properties when a JSON object holds one', () => {
    expect(parseTagText('{"tags":{"name":"A"}}').entries).toEqual([
      { key: 'name', value: 'A', line: 0 },
    ])
    expect(parseTagText('{"properties":{"name":"B"}}').entries).toEqual([
      { key: 'name', value: 'B', line: 0 },
    ])
  })

  it('reads an Overpass line that is not JSON as lines, not as an array', () => {
    expect(parseTagText('["highway"="primary"]').entries).toEqual([
      { key: 'highway', value: 'primary', line: 1 },
    ])
  })

  it('reads a key in quotes that holds = and the value after its separator', () => {
    expect(parseTagText('"a=b"=c').entries).toEqual([{ key: 'a=b', value: 'c', line: 1 }])
  })

  it('reads a value in quotes that is only quotes as an empty value, and refuses it', () => {
    expect(parseTagText('key=""').refused).toEqual([
      { line: 1, text: 'key=""', reason: 'empty value' },
    ])
  })

  it('skips // comment lines', () => {
    expect(parseTagText('// note\nname=A').entries).toEqual([{ key: 'name', value: 'A', line: 2 }])
  })

  it('normalises to NFC and trims both sides', () => {
    expect(parseTagText('  name  =  Café  ').entries).toEqual([
      { key: 'name', value: 'Café', line: 1 },
    ])
  })

  it('reads 500 lines in well under the 20 ms target (asserted with a generous bound)', () => {
    const input = Array.from({ length: 500 }, (_, i) => `key${i}=value ${i}`).join('\n')
    const started = performance.now()
    const parsed = parseTagText(input)
    const elapsed = performance.now() - started
    expect(parsed.entries).toHaveLength(500)
    expect(parsed.refused).toEqual([])
    expect(elapsed).toBeLessThan(200)
  })
})

describe('serializeTags', () => {
  it('writes key=value lines in the order given', () => {
    expect(serializeTags({ highway: 'residential', name: 'A' })).toBe('highway=residential\nname=A')
  })

  it('writes quotes, backslashes and line breaks as JSON strings, and a line break as \\n', () => {
    expect(serializeTags({ name: 'say "hi"' })).toBe('name="say \\"hi\\""')
    expect(serializeTags({ note: 'a\nb' })).toBe('note="a\\nb"')
    expect(serializeTags({ path: 'x\\y' })).toBe('path="x\\\\y"')
  })

  it('quotes a key with =, or one starting with #, [ or /', () => {
    expect(serializeTags({ 'a=b': 'c' })).toBe('"a=b"=c')
    expect(serializeTags({ '#x': 'c' })).toBe('"#x"=c')
    expect(serializeTags({ '[x': 'c' })).toBe('"[x"=c')
    expect(serializeTags({ '/x': 'c' })).toBe('"/x"=c')
  })

  it('leaves out empty keys and values, and writes no tags as an empty text', () => {
    expect(serializeTags({ a: '', b: 'x' })).toBe('b=x')
    expect(serializeTags({})).toBe('')
  })

  it('round-trips through parseTagText for values with =, a tab, a quote, a line break and an emoji', () => {
    const tags = {
      website: 'https://example.org/?a=1&b=2',
      name: 'tab\there',
      note: 'say "hi"',
      description: 'first\nsecond',
      'a=b': 'c',
      '#hash': 'v',
      '/path': 'x',
      'back\\slash': 'x\\y',
      cake: 'cake 🍰',
      'addr:street': 'Main "Street" = 1',
    }
    const parsed = parseTagText(serializeTags(tags))
    expect(parsed.refused).toEqual([])
    expect(parsed.superseded).toEqual([])
    expect(Object.fromEntries(parsed.entries.map((e) => [e.key, e.value]))).toEqual(tags)
  })
})
