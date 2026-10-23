import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { MAX_ELEMENTS, parseOsmChange } from './parse.ts'

const outdated = await Bun.file(join(import.meta.dir, '../test-files/outdated.osc')).text()

function errorOf(text: string) {
  const result = parseOsmChange(text)
  if (result.ok) throw new Error('parsed')
  return result.error
}

const wrap = (body: string) => `<osmChange version="0.6">${body}</osmChange>`

describe('parseOsmChange', () => {
  test('the test file: creates, modifies and deletes with versions, tags, nodes and if-unused', () => {
    const result = parseOsmChange(outdated)
    if (!result.ok) throw new Error(result.error.id)
    const { file } = result
    expect(file.generator).toBe('Go Map!! (test)')
    expect(file.changes.map((change) => change.action)).toEqual([
      ...Array(5).fill('create'),
      ...Array(5).fill('modify'),
      ...Array(2).fill('delete'),
    ])
    expect(file.changes[0]!.element).toEqual({
      type: 'node',
      id: -1,
      tags: { amenity: 'bicycle_parking', bicycle_parking: 'stands', capacity: '6' },
      lat: 52.3866,
      lon: 13.399,
    })
    expect(file.changes[3]!.element).toMatchObject({ type: 'way', id: -4, nodes: [-2, -3] })
    const street = file.changes.find((change) => change.element.id === 4394952)!
    expect(street.element).toMatchObject({
      version: 22,
      nodes: [3316730880, 13103664535, 34648668],
    })
    expect(street.element.tags.name).toBe('Briesingstraße')
    const bank = file.changes.at(-1)!
    expect(bank).toEqual({
      action: 'delete',
      ifUnused: true,
      element: {
        type: 'node',
        id: 421299912,
        version: 12,
        tags: {},
        lat: 52.3865106,
        lon: 13.4016296,
      },
    })
  })

  test('entities and single quotes in values; a relation with members; version 0 is no version', () => {
    const result = parseOsmChange(
      wrap(
        `<modify><relation id='5' version='3'><member type='way' ref='7' role='outer'/><tag k='name' v='A &amp; B &quot;C&quot; &#228;'/></relation></modify>` +
          `<create><node id="-1" version="0" lat="1" lon="2"/></create>`,
      ),
    )
    if (!result.ok) throw new Error(result.error.id)
    expect(result.file.changes[0]!.element).toEqual({
      type: 'relation',
      id: 5,
      version: 3,
      tags: { name: 'A & B "C" ä' },
      members: [{ type: 'way', ref: 7, role: 'outer' }],
    })
    expect(result.file.changes[1]!.element).toEqual({
      type: 'node',
      id: -1,
      tags: {},
      lat: 1,
      lon: 2,
    })
  })

  test('a deleted node may come without a position, a modified one not', () => {
    expect(parseOsmChange(wrap('<delete><node id="1" version="2"/></delete>')).ok).toBe(true)
    expect(errorOf(wrap('<modify><node id="1" version="2"/></modify>')).id).toBe(
      'osmchange_error_position',
    )
  })

  test('refusals, each with its message', () => {
    expect(errorOf('not xml <').id).toBe('osmchange_error_xml')
    expect(errorOf('<osm version="0.6"></osm>').id).toBe('osmchange_error_not_osmchange')
    expect(errorOf('<osmChange><create><node id="1"').id).toBe('osmchange_error_xml')
    expect(errorOf(wrap('')).id).toBe('osmchange_error_empty')
    expect(errorOf(wrap('<upload/>'))).toEqual({
      id: 'osmchange_error_element',
      values: { name: 'upload' },
    })
    expect(errorOf(wrap('<create><node id="5" lat="1" lon="1"/></create>'))).toEqual({
      id: 'osmchange_error_create_id',
      values: { id: 'n5' },
    })
    expect(errorOf(wrap('<modify><way id="-5"><nd ref="1"/><nd ref="2"/></way></modify>')).id).toBe(
      'osmchange_error_existing_id',
    )
    expect(errorOf(wrap('<create><way id="-1"><nd ref="1"/></way></create>')).id).toBe(
      'osmchange_error_way_nodes',
    )
    expect(
      errorOf(
        wrap('<modify><node id="1" lat="1" lon="1"/></modify><delete><node id="1"/></delete>'),
      ),
    ).toEqual({ id: 'osmchange_error_twice', values: { id: 'n1' } })
    expect(
      errorOf(wrap('<create><way id="-1"><nd ref="-7"/><nd ref="2"/></way></create>')),
    ).toEqual({
      id: 'osmchange_error_new_reference',
      values: { id: 'n-7' },
    })
    expect(errorOf(wrap('<create><node id="-1" lat="95" lon="1"/></create>')).id).toBe(
      'osmchange_error_position',
    )
  })

  test(`more than ${MAX_ELEMENTS} elements are refused`, () => {
    const nodes = Array.from(
      { length: MAX_ELEMENTS + 1 },
      (_, index) => `<node id="-${index + 1}" lat="1" lon="1"/>`,
    ).join('')
    expect(errorOf(wrap(`<create>${nodes}</create>`))).toEqual({
      id: 'osmchange_error_too_many',
      values: { max: MAX_ELEMENTS },
    })
  })
})
