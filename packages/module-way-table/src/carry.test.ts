import { describe, expect, test } from 'bun:test'
import { carryTargets, planCarry, planSetOnAll } from './carry.ts'
import { buildWayChain, type WayChain } from './chain.ts'
import type { PlanTarget } from './plan.ts'
import { sceneOf } from './test-graph.ts'

const road = { highway: 'residential' }

/** A chain of L1, L0 (left), C (reference), R1, R2 (right), for the target lists */
const chain: WayChain = {
  reference: 'C',
  ways: [
    { id: 'L0', reversed: false },
    { id: 'L1', reversed: false },
    { id: 'C', reversed: false },
    { id: 'R1', reversed: false },
    { id: 'R2', reversed: false },
  ],
  centerIndex: 2,
  junctions: [],
  stops: { backward: 'end', forward: 'end' },
}

const target = (
  id: string,
  tags: Record<string, string>,
  extra: Partial<PlanTarget> = {},
): PlanTarget => ({
  id,
  tags,
  reversed: false,
  ...extra,
})

describe('carryTargets', () => {
  test('the next N ways on one side, nearest first', () => {
    expect(carryTargets(chain, 'forward', 1)).toEqual(['R1'])
    expect(carryTargets(chain, 'forward', 5)).toEqual(['R1', 'R2'])
    expect(carryTargets(chain, 'backward', 2)).toEqual(['L1', 'L0'])
    expect(carryTargets(chain, 'backward', 0)).toEqual([])
  })

  test('both sides alternate, nearest first, and never include the reference', () => {
    expect(carryTargets(chain, 'both', 2)).toEqual(['L1', 'R1', 'L0', 'R2'])
    expect(carryTargets(chain, 'both', 1)).toEqual(['L1', 'R1'])
  })

  test('a chain that stops at a junction has fewer targets: no guessing past it', () => {
    const cut: WayChain = {
      ...chain,
      ways: chain.ways.slice(0, 3),
      stops: { backward: 'end', forward: 'junction' },
    }
    expect(carryTargets(cut, 'both', 3)).toEqual(['L1', 'L0'])
  })

  test('the targets of a real chain follow the chain', () => {
    const scene = sceneOf([
      { id: 'L1', nodes: ['a', 'b'], tags: road },
      { id: 'C', nodes: ['b', 'c'], tags: road },
      { id: 'R1', nodes: ['c', 'd'], tags: road },
    ])
    const real = buildWayChain(scene, 'C', { maxPerSide: 3 })
    expect(real).toBeDefined()
    if (real) expect(carryTargets(real, 'both', 3)).toEqual(['L1', 'R1'])
  })
})

describe('planCarry', () => {
  const targets = [
    target('T1', { highway: 'residential' }),
    target('T2', { surface: 'paving' }),
    target('T3', { surface: 'asphalt' }),
  ]

  test('fill-empty writes only where the key is missing', () => {
    const plan = planCarry({ key: 'surface', value: 'asphalt', targets, mode: 'fill-empty' })
    expect(plan).toEqual({
      ok: true,
      changes: [{ id: 'T1', set: { surface: 'asphalt' }, remove: [] }],
      skipped: [
        { id: 'T2', reason: 'already-set' },
        { id: 'T3', reason: 'same-value' },
      ],
    })
  })

  test('overwrite writes where the value differs or the key is missing', () => {
    const plan = planCarry({ key: 'surface', value: 'asphalt', targets, mode: 'overwrite' })
    expect(plan).toEqual({
      ok: true,
      changes: [
        { id: 'T1', set: { surface: 'asphalt' }, remove: [] },
        { id: 'T2', set: { surface: 'asphalt' }, remove: [] },
      ],
      skipped: [{ id: 'T3', reason: 'same-value' }],
    })
  })

  test('set on all is the overwrite mode', () => {
    expect(planSetOnAll({ key: 'surface', value: 'asphalt', targets })).toEqual(
      planCarry({ key: 'surface', value: 'asphalt', targets, mode: 'overwrite' }),
    )
  })

  test('a directional row is not carried to a reversed way, and a plain row is', () => {
    const mixed = [target('ok', {}), target('rev', {}, { reversed: true })]
    const directional = planCarry({
      key: 'cycleway:left',
      value: 'lane',
      targets: mixed,
      mode: 'fill-empty',
    })
    expect(directional).toEqual({
      ok: true,
      changes: [{ id: 'ok', set: { 'cycleway:left': 'lane' }, remove: [] }],
      skipped: [{ id: 'rev', reason: 'direction-dependent' }],
    })
    const plain = planCarry({
      key: 'surface',
      value: 'asphalt',
      targets: mixed,
      mode: 'fill-empty',
    })
    expect(plain.ok && plain.changes.map((c) => c.id)).toEqual(['ok', 'rev'])
  })

  test('a value the mirror changes (oneway) is not carried to a reversed way either', () => {
    const plan = planCarry({
      key: 'oneway',
      value: 'yes',
      targets: [target('rev', {}, { reversed: true }), target('fwd', {})],
      mode: 'fill-empty',
    })
    expect(plan).toEqual({
      ok: true,
      changes: [{ id: 'fwd', set: { oneway: 'yes' }, remove: [] }],
      skipped: [{ id: 'rev', reason: 'direction-dependent' }],
    })
  })

  test('an empty value changes nothing', () => {
    const plan = planCarry({ key: 'surface', value: '', targets, mode: 'overwrite' })
    expect(plan.ok && plan.changes).toEqual([])
    expect(plan.ok && plan.skipped.every((s) => s.reason === 'no-change')).toBe(true)
  })

  test('a read-only target refuses the whole plan, even when it would not change', () => {
    const plan = planCarry({
      key: 'surface',
      value: 'asphalt',
      targets: [target('T1', {}), target('T2', { surface: 'asphalt' }, { readOnly: true })],
      mode: 'fill-empty',
    })
    expect(plan).toEqual({ ok: false, reason: 'read-only', ids: ['T2'] })
  })
})
