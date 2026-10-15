import { describe, expect, test } from 'bun:test'
import { planCellWrite, planEdit, type PlanTarget, storedKeyOf } from './plan.ts'

const plain = (
  id: string,
  tags: Record<string, string>,
  extra: Partial<PlanTarget> = {},
): PlanTarget => ({
  id,
  tags,
  reversed: false,
  ...extra,
})

describe('storedKeyOf', () => {
  test('a reversed way stores the mirror of the display key', () => {
    expect(storedKeyOf('cycleway:left', false)).toBe('cycleway:left')
    expect(storedKeyOf('cycleway:left', true)).toBe('cycleway:right')
    expect(storedKeyOf('oneway', true)).toBe('oneway')
  })
})

describe('planEdit', () => {
  test('one change per way that changes, with the stored keys', () => {
    const plan = planEdit([plain('A', { surface: 'asphalt' }), plain('B', {})], () => ({
      set: { surface: 'paving' },
    }))
    expect(plan).toEqual({
      ok: true,
      changes: [
        { id: 'A', set: { surface: 'paving' }, remove: [] },
        { id: 'B', set: { surface: 'paving' }, remove: [] },
      ],
      skipped: [],
    })
  })

  test('a set that changes nothing is a no-change, and an empty value is a removal', () => {
    const plan = planEdit(
      [plain('A', { surface: 'asphalt' }), plain('B', { surface: 'asphalt' })],
      (target) => (target.id === 'A' ? { set: { surface: 'asphalt' } } : { set: { surface: '' } }),
    )
    expect(plan).toEqual({
      ok: true,
      changes: [{ id: 'B', set: {}, remove: ['surface'] }],
      skipped: [{ id: 'A', reason: 'no-change' }],
    })
  })

  test('a removal of a key the way lacks is a no-change', () => {
    const plan = planEdit([plain('A', {})], () => ({ remove: ['surface'] }))
    expect(plan).toEqual({ ok: true, changes: [], skipped: [{ id: 'A', reason: 'no-change' }] })
  })

  test('a skipped target gives its reason and no change', () => {
    const plan = planEdit([plain('A', {})], () => ({ skip: 'direction-dependent' }))
    expect(plan).toEqual({
      ok: true,
      changes: [],
      skipped: [{ id: 'A', reason: 'direction-dependent' }],
    })
  })

  test('a read-only target refuses the whole plan, and names the read-only ids', () => {
    const plan = planEdit(
      [plain('A', {}), plain('B', {}, { readOnly: true }), plain('C', {}, { readOnly: true })],
      () => ({ set: { surface: 'paving' } }),
    )
    expect(plan).toEqual({ ok: false, reason: 'read-only', ids: ['B', 'C'] })
  })

  test('a read-only target that would not change is skipped and does not refuse the plan', () => {
    const plan = planEdit(
      [plain('A', {}), plain('B', { surface: 'paving' }, { readOnly: true })],
      () => ({ set: { surface: 'paving' } }),
    )
    expect(plan).toEqual({
      ok: true,
      changes: [{ id: 'A', set: { surface: 'paving' }, remove: [] }],
      skipped: [{ id: 'B', reason: 'no-change' }],
    })
  })
})

describe('planCellWrite', () => {
  test('writes the value as typed under the stored key', () => {
    expect(planCellWrite(plain('A', {}), 'surface', 'paving')).toEqual({
      ok: true,
      changes: [{ id: 'A', set: { surface: 'paving' }, remove: [] }],
      skipped: [],
    })
  })

  test('a typed value in a mirrored cell goes to the raw key, not the mirrored one', () => {
    const reversed = plain('A', { 'cycleway:right': 'lane' }, { reversed: true })
    // the table shows cycleway:left for the stored cycleway:right: a typed `track` goes to cycleway:right
    expect(planCellWrite(reversed, 'cycleway:left', 'track')).toEqual({
      ok: true,
      changes: [{ id: 'A', set: { 'cycleway:right': 'track' }, remove: [] }],
      skipped: [],
    })
  })

  test('an empty value clears the stored key, where it is present', () => {
    expect(planCellWrite(plain('A', { surface: 'asphalt' }), 'surface', '')).toEqual({
      ok: true,
      changes: [{ id: 'A', set: {}, remove: ['surface'] }],
      skipped: [],
    })
    expect(planCellWrite(plain('A', {}), 'surface', undefined)).toEqual({
      ok: true,
      changes: [],
      skipped: [{ id: 'A', reason: 'no-change' }],
    })
  })

  test('a read-only way refuses the write', () => {
    expect(planCellWrite(plain('A', {}, { readOnly: true }), 'surface', 'paving')).toEqual({
      ok: false,
      reason: 'read-only',
      ids: ['A'],
    })
  })
})
