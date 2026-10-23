import { describe, expect, test } from 'bun:test'
import { parseOsmChange } from './parse.ts'
import { planOf, usedByOf } from './plan.ts'
import type { OsmElement, ServerState } from './types.ts'

function file(xml: string) {
  const result = parseOsmChange(`<osmChange version="0.6">${xml}</osmChange>`)
  if (!result.ok) throw new Error(result.error.id)
  return result.file
}

const node = (id: number, version: number, tags: Record<string, string> = {}): OsmElement => ({
  type: 'node',
  id,
  version,
  tags,
  lat: 52,
  lon: 13,
})

describe('usedByOf', () => {
  const changes = file(
    `<modify><way id="1" version="1"><nd ref="5"/><nd ref="6"/></way><way id="2" version="1"><nd ref="6"/><nd ref="9"/></way></modify>
     <delete><way id="3" version="1"/><node id="9" version="1"/></delete>`,
  )
  test('a parent counts unless the file deletes it or changes it to let go', () => {
    // w1 lets go of n9, w2 still uses it, w3 is deleted, w4 is not in the file
    expect(usedByOf(changes, 'n9', ['w1', 'w2', 'w3', 'w4'])).toEqual(['w2', 'w4'])
  })
})

describe('planOf', () => {
  const changes = file(
    `<create><node id="-1" lat="1" lon="1"/></create>
     <modify>
       <node id="1" version="1" lat="52" lon="13"><tag k="a" v="file"/></node>
       <node id="2" version="1" lat="52" lon="13"><tag k="a" v="file"/></node>
       <node id="3" version="1" lat="52" lon="13"><tag k="a" v="file"/></node>
     </modify>
     <delete><node id="4" version="1"/></delete>`,
  )
  const states = new Map<string, ServerState>([
    ['n1', { current: node(1, 2, { a: 'server' }), base: node(1, 1, { a: 'base' }) }],
    ['n2', { current: node(2, 2, { a: 'base', b: 'new' }), base: node(2, 1, { a: 'base' }) }],
    ['n3', { current: node(3, 1, { a: 'base' }) }],
    ['n4', { current: 'deleted' }],
  ])

  test('decisions first, then merged, clean and skipped; counts and open conflicts', () => {
    const plan = planOf(changes, states, new Map(), {})
    expect(plan.items.map((item) => `${item.key}:${item.status}`)).toEqual([
      'n1:decide',
      'n2:auto',
      'n-1:clean',
      'n3:clean',
      'n4:skip',
    ])
    expect(plan.counts).toEqual({ decide: 1, auto: 1, clean: 2, skip: 1 })
    expect(plan.open).toBe(1)
    expect(plan.ready).toBe(false)
  })

  test('ready once every conflict has a choice; the item stays among the decisions', () => {
    const plan = planOf(changes, states, new Map(), { 'n1:tag:a': 'current' })
    expect(plan.open).toBe(0)
    expect(plan.ready).toBe(true)
    expect(plan.items[0]).toMatchObject({
      key: 'n1',
      status: 'decide',
      result: { tags: { a: 'server' } },
    })
  })

  test('not ready when nothing would be written', () => {
    const skipped = file('<delete><node id="4" version="1"/></delete>')
    expect(planOf(skipped, states, new Map(), {}).ready).toBe(false)
  })
})
