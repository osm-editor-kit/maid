import { describe, expect, it } from 'bun:test'
import type { Field } from '@osm-editor-kit/maid-presets'
import { checkCycle, checkLabel, checkStateFor, impliesYes, nextCheckValue } from '../logic.ts'
import { checkBoxOf, checkFieldOf } from './check-logic.ts'

const field = (over: Partial<Field>): Field => ({
  id: 'test',
  type: 'check',
  label: 'Test',
  options: [],
  universal: false,
  ...over,
})

/** iD's armrest field as Maid builds it: id-tagging-schema lists the unset value as "undefined". */
const ARMREST = field({
  id: 'armrest',
  key: 'armrest',
  label: 'Armrests',
  options: [
    { value: 'undefined', label: 'Unknown' },
    { value: 'yes', label: 'One or more armrests' },
    { value: 'no', label: 'No armrests' },
  ],
})

/** The state the check field draws for a tag value (one feature), as CheckField computes it. */
function drawn(f: Field, value: string | undefined) {
  const checked = checkStateFor(
    f.type,
    value,
    impliesYes(f, { [f.key ?? '']: value ?? '' }),
    undefined,
  )
  return {
    ...checkBoxOf(checked),
    label: checkLabel(f, f.type, value, false),
  }
}

describe('checkFieldOf', () => {
  it('maps the option "undefined" to the unset value, as iD does', () => {
    const normal = checkFieldOf(ARMREST)
    expect(normal.options).toEqual([
      { value: '', label: 'Unknown' },
      { value: 'yes', label: 'One or more armrests' },
      { value: 'no', label: 'No armrests' },
    ])
  })

  it('returns the same field when there is no "undefined" option', () => {
    const covered = field({ key: 'covered', options: [{ value: 'yes', label: 'Yes' }] })
    expect(checkFieldOf(covered)).toBe(covered)
  })

  it('does not change the field it is given', () => {
    checkFieldOf(ARMREST)
    expect(ARMREST.options[0]).toEqual({ value: 'undefined', label: 'Unknown' })
  })
})

describe('the three states of an armrest-like check (iD: unset, yes, no)', () => {
  const normal = checkFieldOf(ARMREST)

  it('the cycle is unset, yes, no, and the unset value is never written as "undefined"', () => {
    const cycle = checkCycle(normal)
    expect(cycle).toEqual([undefined, 'yes', 'no'])
    expect(cycle).not.toContain('undefined')
  })

  it('unset: grey dash in an empty box, mixed for assistive technology, "Unknown"', () => {
    expect(drawn(normal, undefined)).toEqual({
      box: 'unknown',
      ariaChecked: 'mixed',
      label: 'Unknown',
    })
  })

  it('yes: check, true, the yes option label', () => {
    expect(drawn(normal, 'yes')).toEqual({
      box: 'on',
      ariaChecked: true,
      label: 'One or more armrests',
    })
  })

  it('no: empty box, false, the no option label', () => {
    expect(drawn(normal, 'no')).toEqual({ box: 'off', ariaChecked: false, label: 'No armrests' })
  })

  it('a click walks unset, yes, no, unset and never stops on "undefined"', () => {
    const cycle = checkCycle(normal)
    expect(nextCheckValue('check', undefined, cycle)).toBe('yes')
    expect(nextCheckValue('check', 'yes', cycle)).toBe('no')
    expect(nextCheckValue('check', 'no', cycle)).toBeUndefined()
  })

  it('a stored "undefined" is a raw value, as in iD: checked, quoted in the text', () => {
    expect(drawn(normal, 'undefined')).toEqual({
      box: 'on',
      ariaChecked: true,
      label: '"undefined"',
    })
  })
})

describe('checkBoxOf', () => {
  it('maps each checkStateFor result to a box and aria-checked', () => {
    expect(checkBoxOf(true)).toEqual({ box: 'on', ariaChecked: true })
    expect(checkBoxOf(false)).toEqual({ box: 'off', ariaChecked: false })
    expect(checkBoxOf('unset')).toEqual({ box: 'unknown', ariaChecked: 'mixed' })
    expect(checkBoxOf('mixed')).toEqual({ box: 'dash', ariaChecked: 'mixed' })
  })
})

describe('other check types', () => {
  it('a check without options: unset, yes, no', () => {
    const covered = field({ key: 'covered' })
    expect(drawn(covered, undefined)).toEqual({
      box: 'unknown',
      ariaChecked: 'mixed',
      label: 'Unknown',
    })
    expect(drawn(covered, 'yes')).toEqual({ box: 'on', ariaChecked: true, label: 'Yes' })
    expect(drawn(covered, 'no')).toEqual({ box: 'off', ariaChecked: false, label: 'No' })
  })

  it('a raw value outside yes and no is checked, as iD checks it', () => {
    expect(drawn(field({ key: 'covered' }), 'limited')).toEqual({
      box: 'on',
      ariaChecked: true,
      label: '"limited"',
    })
  })

  it('defaultCheck has no third state: unset is an empty box', () => {
    const two = field({ type: 'defaultCheck', key: 'two_sided' })
    expect(drawn(two, undefined)).toEqual({ box: 'off', ariaChecked: false, label: 'Unknown' })
    expect(drawn(two, 'yes')).toEqual({ box: 'on', ariaChecked: true, label: 'Yes' })
  })

  it('onewayCheck: 1 is yes', () => {
    expect(drawn(field({ type: 'onewayCheck', key: 'oneway' }), '1')).toEqual({
      box: 'on',
      ariaChecked: true,
      label: 'Yes',
    })
  })
})
