import { describe, expect, test } from 'bun:test'
import { focusOf } from './features.ts'
import { parseOsmChange } from './parse.ts'
import { planOf } from './plan.ts'
import type { OsmElement, ServerState } from './types.ts'

function file(xml: string) {
  const result = parseOsmChange(`<osmChange version="0.6">${xml}</osmChange>`)
  if (!result.ok) throw new Error(result.error.id)
  return result.file
}

const node = (
  id: number,
  version: number,
  lat: number,
  tags: Record<string, string>,
): OsmElement => ({
  type: 'node',
  id,
  version,
  tags,
  lat,
  lon: 13,
})

describe('focusOf', () => {
  // n1 needs a decision (both changed a), n2 is merged, n-1 is new; each 0.01° (1.1 km) further north
  const changes = file(
    `<create><node id="-1" lat="52.02" lon="13"/></create>
     <modify>
       <node id="1" version="1" lat="52" lon="13"><tag k="a" v="file"/></node>
       <node id="2" version="1" lat="52.01" lon="13"><tag k="a" v="file"/></node>
     </modify>`,
  )
  const states = new Map<string, ServerState>([
    ['n1', { current: node(1, 2, 52, { a: 'server' }), base: node(1, 1, 52, { a: 'base' }) }],
    [
      'n2',
      {
        current: node(2, 2, 52.01, { a: 'base', b: 'new' }),
        base: node(2, 1, 52.01, { a: 'base' }),
      },
    ],
  ])
  const none = () => undefined

  test('the elements to decide first', () => {
    expect(focusOf(planOf(changes, states, new Map(), {}), none)).toEqual([13, 52, 13, 52])
  })

  test('without decisions the merged ones, then the rest', () => {
    const decided = new Map(states)
    decided.set('n1', { current: node(1, 1, 52, { a: 'base' }) })
    expect(focusOf(planOf(changes, decided, new Map(), {}), none)).toEqual([13, 52.01, 13, 52.01])
    const onlyNew = file(
      '<create><node id="-1" lat="52.02" lon="13"/><node id="-2" lat="52.03" lon="13.01"/></create>',
    )
    expect(focusOf(planOf(onlyNew, new Map(), new Map(), {}), none)).toEqual([
      13, 52.02, 13.01, 52.03,
    ])
  })

  test('a box larger than the limit shows only the first element of the group', () => {
    const spread = file(
      '<create><node id="-1" lat="52" lon="13"/><node id="-2" lat="52.1" lon="13"/></create>',
    )
    expect(focusOf(planOf(spread, new Map(), new Map(), {}), none)).toEqual([13, 52, 13, 52])
    expect(focusOf(planOf(spread, new Map(), new Map(), {}), none, 20_000)).toEqual([
      13, 52, 13, 52.1,
    ])
  })

  test('a way by the positions of its nodes, from the file or the editor', () => {
    const way = file('<create><way id="-1"><nd ref="5"/><nd ref="6"/></way></create>')
    const loc = (key: string) =>
      key === 'n5'
        ? ([13, 52] as [number, number])
        : key === 'n6'
          ? ([13.001, 52.001] as [number, number])
          : undefined
    expect(focusOf(planOf(way, new Map(), new Map(), {}), loc)).toEqual([13, 52, 13.001, 52.001])
  })
})
