import { describe, expect, test } from 'bun:test'
import {
  addRange,
  conditionFromEditor,
  editorFromCondition,
  EMPTY_EDITOR,
  monthEnds,
  removeRange,
  setMonthEdge,
  setRangeEdge,
  toggleDay,
  type EditorState,
} from './condition-editor.ts'
import { conditionText, formatCondition, parseCondition } from './condition.ts'

const range = (from: string, to: string) => ({ from, to })

describe('parseCondition: time patterns', () => {
  test.each([
    ['09:00-18:00', [{ ranges: [range('09:00', '18:00')] }]],
    ['Fr 14:00-17:00', [{ days: 'Fr', ranges: [range('14:00', '17:00')] }]],
    ['Mo-Fr 06:00-16:00', [{ days: 'Mo-Fr', ranges: [range('06:00', '16:00')] }]],
    [
      'Mo-Fr 06:00-09:00,15:00-19:00',
      [{ days: 'Mo-Fr', ranges: [range('06:00', '09:00'), range('15:00', '19:00')] }],
    ],
    [
      'Mo-Fr 06:00-16:00; Sa 07:00-16:00',
      [
        { days: 'Mo-Fr', ranges: [range('06:00', '16:00')] },
        { days: 'Sa', ranges: [range('07:00', '16:00')] },
      ],
    ],
    // a day with no time: all day
    [
      'Mo-Sa 00:00-09:00; Su',
      [
        { days: 'Mo-Sa', ranges: [range('00:00', '09:00')] },
        { days: 'Su', ranges: [] },
      ],
    ],
    ['PH 10:00-12:00', [{ days: 'PH', ranges: [range('10:00', '12:00')] }]],
    ['Su', [{ days: 'Su', ranges: [] }]],
  ])('reads %s as groups', (condition, groups) => {
    expect(parseCondition(condition)).toEqual({ terms: [{ kind: 'time', groups }] })
  })

  test('a month span and an nth weekday', () => {
    expect(parseCondition('May-Oct: We[1] 14:00-18:00')).toEqual({
      terms: [
        {
          kind: 'time',
          months: 'May-Oct',
          groups: [{ days: 'We[1]', ranges: [range('14:00', '18:00')] }],
        },
      ],
    })
  })

  test('the empty condition has no terms', () => {
    expect(parseCondition('')).toEqual({ terms: [] })
    expect(formatCondition({ terms: [] })).toBe('')
  })
})

describe('parseCondition: non-time conditions and AND', () => {
  test('stay, permit holder and a vehicle class', () => {
    expect(parseCondition('stay > 2 hours')).toEqual({
      terms: [{ kind: 'stay', op: '>', amount: 2, unit: 'hours' }],
    })
    expect(parseCondition('stay <= 30 minutes')).toEqual({
      terms: [{ kind: 'stay', op: '<=', amount: 30, unit: 'minutes' }],
    })
    expect(parseCondition('permit holder')).toEqual({
      terms: [{ kind: 'phrase', text: 'permit holder' }],
    })
    expect(parseCondition('motorcar')).toEqual({
      terms: [{ kind: 'vehicle', vehicle: 'motorcar' }],
    })
  })

  test('AND joins the terms', () => {
    expect(parseCondition('Mo-Fr 08:00-18:00 AND permit holder')).toEqual({
      terms: [
        { kind: 'time', groups: [{ days: 'Mo-Fr', ranges: [range('08:00', '18:00')] }] },
        { kind: 'phrase', text: 'permit holder' },
      ],
    })
  })
})

describe('parseCondition: what stays raw', () => {
  test.each([
    // a comma between weekday groups, and a comma with a space inside a range list (both valid text, not in the grammar)
    'Mo-Fr 09:00-18:00, Sa 09:00-14:00',
    'Mo-Fr 00:00-13:00, 20:00-23:59',
    // a day list, an hour without its zero, a word not known, a stay with a bad number
    'Mo,We 08:00-10:00',
    'Mo-Fr 8:00-18:00',
    'stay > 02 hours',
    'sunny',
    // an empty term after AND
    'permit holder AND ',
  ])('keeps %s as written', (condition) => {
    const parsed = parseCondition(condition)
    expect(parsed).toEqual({ raw: condition })
    expect(conditionText(parsed)).toBe(condition)
  })
})

describe('conditionText: the inverse of parseCondition', () => {
  test.each([
    'Mo-Fr 06:00-16:00; Sa 07:00-16:00',
    'May-Oct: We[1] 14:00-18:00',
    'Mo-Sa 00:00-09:00; Su',
    'PH 10:00-12:00',
    'stay > 2 hours',
    'permit holder AND Mo-Fr 08:00-18:00',
    '',
  ])('writes %s back exactly', (condition) => {
    expect(conditionText(parseCondition(condition))).toBe(condition)
  })
})

const state = (
  days: EditorState['days'],
  ranges: EditorState['ranges'],
  months = '',
): EditorState => ({
  days,
  ranges,
  months,
})

describe('the editor: condition from state', () => {
  test('a time alone, every day', () => {
    expect(conditionFromEditor(state([], [range('08:00', '18:00')]))).toBe('08:00-18:00')
  })

  test('a run of days is one group; separate days are separate groups', () => {
    expect(
      conditionFromEditor(state(['Mo', 'Tu', 'We', 'Th', 'Fr'], [range('06:00', '16:00')])),
    ).toBe('Mo-Fr 06:00-16:00')
    expect(conditionFromEditor(state(['Mo', 'Tu', 'Sa'], [range('06:00', '16:00')]))).toBe(
      'Mo-Tu 06:00-16:00; Sa 06:00-16:00',
    )
  })

  test('PH comes after the runs of the week', () => {
    expect(conditionFromEditor(state(['PH', 'Mo'], [range('10:00', '12:00')]))).toBe(
      'Mo 10:00-12:00; PH 10:00-12:00',
    )
  })

  test('several ranges are one group, separated by a comma', () => {
    expect(
      conditionFromEditor(
        state(['Mo', 'Tu', 'We', 'Th', 'Fr'], [range('06:00', '09:00'), range('15:00', '19:00')]),
      ),
    ).toBe('Mo-Fr 06:00-09:00,15:00-19:00')
  })

  test('months come before the days', () => {
    expect(conditionFromEditor(state(['We'], [range('14:00', '18:00')], 'May-Oct'))).toBe(
      'May-Oct: We 14:00-18:00',
    )
  })

  test('no days and no times is no condition (months need a day or a time)', () => {
    expect(conditionFromEditor(state([], [], 'May'))).toBe('')
    expect(conditionFromEditor(EMPTY_EDITOR)).toBe('')
  })

  test('days without times: the days all day', () => {
    expect(conditionFromEditor(state(['Su'], []))).toBe('Su')
  })
})

describe('the editor: state from condition', () => {
  test.each([
    '08:00-18:00',
    'Mo-Fr 06:00-16:00',
    'Mo-Fr 06:00-09:00,15:00-19:00',
    'Mo 06:00-16:00; PH 06:00-16:00',
    'Su',
    'May-Oct: We 14:00-18:00',
    'Mo-Su 10:00-12:00',
  ])('%s reads and writes back', (condition) => {
    const editor = editorFromCondition(condition)
    expect(editor).toBeDefined()
    expect(conditionFromEditor(editor as EditorState)).toBe(condition)
  })

  test('a condition with several time groups, nth weekdays or other terms is not editable', () => {
    expect(editorFromCondition('Mo-Fr 06:00-16:00; Sa 07:00-16:00')).toBeUndefined()
    expect(editorFromCondition('Mo-Sa 00:00-09:00; Su')).toBeUndefined()
    expect(editorFromCondition('We[1] 14:00-18:00')).toBeUndefined()
    expect(editorFromCondition('Fr-Mo 08:00-10:00')).toBeUndefined()
    expect(editorFromCondition('permit holder')).toBeUndefined()
    expect(editorFromCondition('Mo-Fr 06:00-16:00, Sa 07:00-16:00')).toBeUndefined()
    expect(editorFromCondition('Mo-Fr 06:00-16:00 AND permit holder')).toBeUndefined()
  })

  test('the empty condition is the empty state', () => {
    expect(editorFromCondition('')).toEqual(EMPTY_EDITOR)
  })
})

describe('the editor: changes', () => {
  test('toggling weekdays keeps the week order', () => {
    let next = toggleDay(EMPTY_EDITOR, 'Sa')
    next = toggleDay(next, 'Mo')
    expect(next.days).toEqual(['Mo', 'Sa'])
    next = toggleDay(next, 'Sa')
    expect(next.days).toEqual(['Mo'])
  })

  test('removing the last day and the last time clears the months', () => {
    const withMonths = state(['Mo'], [], 'May-Oct')
    expect(toggleDay(withMonths, 'Mo').months).toBe('')
    expect(toggleDay(withMonths, 'Mo').days).toEqual([])
  })

  test('a range is added with a default and removed', () => {
    const added = addRange(EMPTY_EDITOR)
    expect(added.ranges).toEqual([range('08:00', '18:00')])
    expect(removeRange(added, 0).ranges).toEqual([])
  })

  test('an empty time is not taken', () => {
    const editor = state([], [range('08:00', '18:00')])
    expect(setRangeEdge(editor, 0, 'from', '')).toBe(editor)
    expect(setRangeEdge(editor, 0, 'to', '20:00').ranges).toEqual([range('08:00', '20:00')])
  })

  test('the months: one month, a span, and no months', () => {
    const editor = state(['We'], [range('14:00', '18:00')])
    const may = setMonthEdge(editor, 'from', 'May')
    expect(may.months).toBe('May')
    const span = setMonthEdge(may, 'to', 'Oct')
    expect(span.months).toBe('May-Oct')
    expect(monthEnds(span)).toEqual({ from: 'May', to: 'Oct' })
    expect(setMonthEdge(span, 'from', '').months).toBe('')
    expect(setMonthEdge(may, 'to', 'May').months).toBe('May')
  })
})
