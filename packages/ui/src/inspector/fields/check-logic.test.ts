import { describe, expect, it } from 'bun:test'
import type { Field } from '@osm-editor-kit/maid-presets'
import {
  checkAfterClick,
  checkCycle,
  checkLabel,
  checkStateFor,
  impliesYes,
  nextCheckValue,
} from '../logic.ts'
import { checkBoxOf } from './check-logic.ts'
import type { MixedValue } from './shared.ts'

const field = (over: Partial<Field>): Field => ({
  id: 'test',
  type: 'check',
  label: 'Test',
  options: [],
  universal: false,
  ...over,
})

/**
 * iD's armrest field as the presets build it: id-tagging-schema lists the unset value as "undefined", and the
 * presets turn that option into '' (optionValueOf), the unset value isUnsetOption takes. The bundled data is
 * checked in presets.test.ts.
 */
const ARMREST = field({
  id: 'armrest',
  key: 'armrest',
  label: 'Armrests',
  options: [
    { value: '', label: 'Unknown' },
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

/** The state the check field draws over several features (CheckField with `combined`), as it computes it. */
function drawnMixed(f: Field, mixed: MixedValue) {
  const checked = checkStateFor(f.type, undefined, false, mixed)
  return { ...checkBoxOf(checked), label: 'Multiple values' }
}

/** What the check field writes on a click over several features (CheckField's onChange). */
function clickedMixed(f: Field, mixed: MixedValue) {
  return checkAfterClick(
    f.type,
    undefined,
    checkCycle(f),
    checkStateFor(f.type, undefined, false, mixed) === 'mixed',
  )
}

describe('the three states of an armrest-like check (iD: unset, yes, no)', () => {
  it('the cycle is unset, yes, no, and the unset value is never written as "undefined"', () => {
    const cycle = checkCycle(ARMREST)
    expect(cycle).toEqual([undefined, 'yes', 'no'])
    expect(cycle).not.toContain('undefined')
  })

  it('unset: grey dash in an empty box, mixed for assistive technology, "Unknown"', () => {
    expect(drawn(ARMREST, undefined)).toEqual({
      box: 'unknown',
      ariaChecked: 'mixed',
      label: 'Unknown',
    })
  })

  it('yes: check, true, the yes option label', () => {
    expect(drawn(ARMREST, 'yes')).toEqual({
      box: 'on',
      ariaChecked: true,
      label: 'One or more armrests',
    })
  })

  it('no: empty box, false, the no option label', () => {
    expect(drawn(ARMREST, 'no')).toEqual({ box: 'off', ariaChecked: false, label: 'No armrests' })
  })

  it('a click walks unset, yes, no, unset and never stops on "undefined"', () => {
    const cycle = checkCycle(ARMREST)
    expect(nextCheckValue('check', undefined, cycle)).toBe('yes')
    expect(nextCheckValue('check', 'yes', cycle)).toBe('no')
    expect(nextCheckValue('check', 'no', cycle)).toBeUndefined()
  })

  it('a stored "undefined" is a raw value, as in iD: checked, quoted in the text', () => {
    expect(drawn(ARMREST, 'undefined')).toEqual({
      box: 'on',
      ariaChecked: true,
      label: '"undefined"',
    })
  })
})

describe('several features (the multi-selection inspector)', () => {
  it('a key that is yes on one feature and absent on another is mixed: "Multiple values", a dash', () => {
    const mixed: MixedValue = { kind: 'mixed', values: ['yes'], missing: true }
    expect(drawnMixed(ARMREST, mixed)).toEqual({
      box: 'dash',
      ariaChecked: 'mixed',
      label: 'Multiple values',
    })
  })

  it('a click on a mixed key sets yes on every feature, never "undefined"', () => {
    const mixed: MixedValue = { kind: 'mixed', values: ['yes', 'no'], missing: false }
    expect(clickedMixed(ARMREST, mixed)).toBe('yes')
  })

  it('features that all store a raw "undefined" share it as a raw value, not as the unset option', () => {
    const shared = checkStateFor('check', 'undefined', false, undefined)
    expect(shared).toBe(true)
    expect(checkLabel(ARMREST, 'check', 'undefined')).toBe('"undefined"')
  })

  it('a mixed key of raw values that differ only in case is one value, not mixed', () => {
    const mixed: MixedValue = { kind: 'mixed', values: ['Yes', 'yes'], missing: false }
    expect(checkStateFor('check', undefined, false, mixed)).toBe(true)
  })
})

describe('other check types with options from the presets', () => {
  it('defaultCheck with an unset option: the cycle is unset, yes, and "undefined" is never written', () => {
    const two = field({
      id: 'two_sided',
      type: 'defaultCheck',
      key: 'two_sided',
      options: [
        { value: '', label: 'Unknown' },
        { value: 'yes', label: 'Yes' },
      ],
    })
    const cycle = checkCycle(two)
    expect(cycle).toEqual([undefined, 'yes'])
    expect(nextCheckValue('defaultCheck', undefined, cycle)).toBe('yes')
    expect(nextCheckValue('defaultCheck', 'yes', cycle)).toBeUndefined()
  })

  it('onewayCheck: the cycle skips reversible and alternating, and never writes "undefined"', () => {
    const oneway = field({
      id: 'oneway',
      type: 'onewayCheck',
      key: 'oneway',
      options: [
        { value: '', label: 'Unknown' },
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'reversible', label: 'Reversible' },
        { value: 'alternating', label: 'Alternating' },
      ],
    })
    expect(checkCycle(oneway)).toEqual([undefined, 'yes', 'no'])
    expect(checkCycle(oneway)).not.toContain('undefined')
  })

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

describe('checkBoxOf', () => {
  it('maps each checkStateFor result to a box and aria-checked', () => {
    expect(checkBoxOf(true)).toEqual({ box: 'on', ariaChecked: true })
    expect(checkBoxOf(false)).toEqual({ box: 'off', ariaChecked: false })
    expect(checkBoxOf('unset')).toEqual({ box: 'unknown', ariaChecked: 'mixed' })
    expect(checkBoxOf('mixed')).toEqual({ box: 'dash', ariaChecked: 'mixed' })
  })
})
