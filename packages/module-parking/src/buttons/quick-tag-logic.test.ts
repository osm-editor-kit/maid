import { describe, expect, test } from 'bun:test'
import {
  clearSide,
  focusKeyOf,
  isPressed,
  planQuickTag,
  pressedState,
  roadTags,
} from './quick-tag-logic.ts'
import { QUICK_TAGS, type QuickTag } from './quick-tags.ts'

/** The button with an id, from the data */
function button(id: string): QuickTag {
  const tag = QUICK_TAGS.find((item) => item.id === id)
  if (!tag) throw new Error(`no button ${id}`)
  return tag
}

describe('pressed', () => {
  test('a side button is pressed by its own key', () => {
    expect(isPressed({ 'parking:left': 'lane' }, button('parking_left_lane'))).toBe(true)
    expect(isPressed({ 'parking:right': 'lane' }, button('parking_left_lane'))).toBe(false)
  })

  test('`both` counts for left and right; a `both` button needs the value on the two sides', () => {
    const tags = { 'parking:both:fee': 'yes' }
    expect(isPressed(tags, button('parking_left_fee_yes'))).toBe(true)
    expect(isPressed(tags, button('parking_right_fee_yes'))).toBe(true)
    expect(isPressed(tags, button('parking_both_fee_yes'))).toBe(true)
    expect(isPressed({ 'parking:left:fee': 'yes' }, button('parking_both_fee_yes'))).toBe(false)
    expect(isPressed({ 'parking:left:fee': 'yes' }, button('parking_right_fee_yes'))).toBe(false)
    // two equal side keys say the same as the `both` key
    const twice = { 'parking:left:fee': 'yes', 'parking:right:fee': 'yes' }
    expect(isPressed(twice, button('parking_both_fee_yes'))).toBe(true)
  })

  test('a side key wins over `both`: the other side reads its own value', () => {
    const tags = { 'parking:both:orientation': 'parallel', 'parking:left:orientation': 'diagonal' }
    expect(isPressed(tags, button('parking_left_orientation_diagonal'))).toBe(true)
    expect(isPressed(tags, button('parking_left_orientation_parallel'))).toBe(false)
    expect(isPressed(tags, button('parking_right_orientation_parallel'))).toBe(true)
    expect(isPressed(tags, button('parking_both_orientation_parallel'))).toBe(false)
  })

  test('the combined pressed state over several roads: on, mixed, off', () => {
    const lane = button('parking_both_lane')
    expect(pressedState([{ 'parking:both': 'lane' }, { 'parking:both': 'lane' }], lane)).toBe('on')
    expect(pressedState([{ 'parking:both': 'lane' }, {}], lane)).toBe('mixed')
    expect(pressedState([{}, {}], lane)).toBe('off')
    expect(pressedState([], lane)).toBe('off')
  })

  test('a combined button is pressed when all its values are in the tags, however they are spelled', () => {
    const both = button('maid_both_lane_parallel')
    expect(isPressed({ 'parking:left': 'lane', 'parking:right': 'lane' }, both)).toBe(false)
    expect(
      isPressed({ 'parking:both': 'lane', 'parking:both:orientation': 'parallel' }, both),
    ).toBe(true)
  })

  test('a reason button needs both its no and its reason', () => {
    const reason = button('maid_left_no_reason_construction')
    expect(isPressed({ 'parking:left': 'no' }, reason)).toBe(false)
    expect(isPressed({ 'parking:left': 'no', 'parking:left:reason': 'construction' }, reason)).toBe(
      true,
    )
  })

  test('a clearing button is never pressed', () => {
    expect(isPressed({ 'parking:left': 'no' }, button('maid_clear_left'))).toBe(false)
  })
})

describe('toggling', () => {
  test('setting a side button sets its key', () => {
    expect(roadTags({}, button('parking_left_no'), true)).toEqual({ 'parking:left': 'no' })
  })

  test('clicking a pressed button removes its key', () => {
    expect(roadTags({ 'parking:left': 'no' }, button('parking_left_no'), false)).toEqual({})
  })

  test('removing a side that `both` gives splits `both`: the other side keeps the value', () => {
    const tags = { 'parking:both': 'lane' }
    const plan = planQuickTag([{ id: 'w1', tags }], button('parking_left_lane'), false)
    expect(plan).toEqual([{ id: 'w1', tags: { 'parking:right': 'lane' } }])
  })

  test('removing the `both` button removes the value from the two sides, however it is spelled', () => {
    expect(roadTags({ 'parking:both': 'lane' }, button('parking_both_lane'), false)).toEqual({})
    const twice = { 'parking:left': 'lane', 'parking:right': 'lane', 'parking:left:fee': 'no' }
    expect(roadTags(twice, button('parking_both_lane'), false)).toEqual({
      'parking:left:fee': 'no',
    })
  })

  test('setting a side while `both` is set splits `both`', () => {
    expect(roadTags({ 'parking:both': 'lane' }, button('parking_left_no'), true)).toEqual({
      'parking:left': 'no',
      'parking:right': 'lane',
    })
  })

  test('setting a side to the value of the other side writes `both`, as the directional fields do', () => {
    expect(roadTags({ 'parking:right': 'lane' }, button('parking_left_lane'), true)).toEqual({
      'parking:both': 'lane',
    })
  })

  test('setting `both` replaces the two sides of its key', () => {
    const tags = { 'parking:left': 'no', 'parking:right': 'separate', 'parking:left:fee': 'yes' }
    expect(roadTags(tags, button('parking_both_lane'), true)).toEqual({
      'parking:both': 'lane',
      'parking:left:fee': 'yes',
    })
  })

  test('a button that is already set changes nothing', () => {
    expect(
      planQuickTag(
        [{ id: 'w1', tags: { 'parking:left': 'lane' } }],
        button('parking_left_lane'),
        true,
      ),
    ).toEqual([])
  })
})

describe('the combined buttons', () => {
  test('lane parking on both sides, parallel: equal sides are written as `both`', () => {
    const expected = { 'parking:both': 'lane', 'parking:both:orientation': 'parallel' }
    expect(roadTags({}, button('maid_both_lane_parallel'), true)).toEqual(expected)
    expect(roadTags({ 'parking:both': 'no' }, button('maid_both_lane_parallel'), true)).toEqual(
      expected,
    )
  })

  test('no parking on a side with a reason sets both keys', () => {
    expect(
      roadTags({ 'parking:both': 'lane' }, button('maid_left_no_reason_construction'), true),
    ).toEqual({
      'parking:left': 'no',
      'parking:left:reason': 'construction',
      'parking:right': 'lane',
    })
  })

  test('no parking on both sides with a reason sets `both`', () => {
    expect(roadTags({}, button('maid_both_no_reason_dual_carriage'), true)).toEqual({
      'parking:both': 'no',
      'parking:both:reason': 'dual_carriage',
    })
  })

  test('clicking a pressed combined button removes its keys', () => {
    const tags = {
      'parking:left': 'lane',
      'parking:left:orientation': 'parallel',
      'parking:right': 'no',
    }
    expect(roadTags(tags, button('maid_left_lane_parallel'), false)).toEqual({
      'parking:right': 'no',
    })
  })
})

describe('clearing a side', () => {
  test('removes every parking key of the side, and only those', () => {
    const tags = {
      highway: 'residential',
      'parking:left': 'no',
      'parking:left:orientation': 'parallel',
      'parking:left:width:lane': '1',
      'parking:left:fee:conditional': 'yes @ (Mo-Fr 08:00-18:00)',
      'parking:right': 'lane',
    }
    expect(clearSide(tags, 'left')).toEqual({ highway: 'residential', 'parking:right': 'lane' })
  })

  test('with `both` set, the other side keeps what `both` gave it', () => {
    const tags = { 'parking:both:orientation': 'parallel', 'parking:both': 'lane' }
    expect(clearSide(tags, 'left')).toEqual({
      'parking:right': 'lane',
      'parking:right:orientation': 'parallel',
    })
  })

  test('the clearing button clears its side in a plan, whatever the click says', () => {
    const roads = [
      { id: 'w1', tags: { 'parking:left': 'no', 'parking:right': 'lane' } },
      { id: 'w2', tags: { highway: 'service' } },
    ]
    expect(planQuickTag(roads, button('maid_clear_left'), false)).toEqual([
      { id: 'w1', tags: { 'parking:right': 'lane' } },
    ])
  })
})

describe('two features at once', () => {
  test('a button sets its tags on each road that lacks them, and leaves the others out (`both` has them)', () => {
    const roads = [
      { id: 'w1', tags: {} },
      { id: 'w2', tags: { 'parking:left': 'lane' } },
      { id: 'w3', tags: { 'parking:both': 'lane' } },
    ]
    expect(planQuickTag(roads, button('parking_left_lane'), true)).toEqual([
      { id: 'w1', tags: { 'parking:left': 'lane' } },
    ])
  })

  test('removing from several roads removes it where it is set', () => {
    const roads = [
      { id: 'w1', tags: { 'parking:left': 'no' } },
      { id: 'w2', tags: { 'parking:left': 'no', highway: 'primary' } },
    ]
    expect(planQuickTag(roads, button('parking_left_no'), false)).toEqual([
      { id: 'w1', tags: {} },
      { id: 'w2', tags: { highway: 'primary' } },
    ])
  })
})

describe('the focus on the map', () => {
  test('a button is about its side, and its key is its first edit', () => {
    expect(focusKeyOf(button('parking_both_fee_no'))).toBe('parking:both:fee')
    expect(button('parking_both_fee_no').side).toBe('both')
    expect(focusKeyOf(button('maid_clear_right'))).toBe('parking:right')
  })
})
