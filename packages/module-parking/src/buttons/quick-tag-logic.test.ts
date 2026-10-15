import { describe, expect, test } from 'bun:test'
import {
  cellState,
  clearSide,
  focusKeyOf,
  isPressed,
  nextIndex,
  planCell,
  planQuickTag,
  pressedState,
  roadTags,
  valueIndex,
  type RoadTags,
} from './quick-tag-logic.ts'
import { QUICK_TAGS, type QuickTag, type QuickTagGroup } from './quick-tags.ts'

/** The button with an id, from the data */
function button(id: string): QuickTag {
  const tag = QUICK_TAGS.find((item) => item.id === id)
  if (!tag) throw new Error(`no button ${id}`)
  return tag
}

/** The cell of a row and side: its buttons in the order a click goes through them */
function cell(row: QuickTagGroup, side: 'left' | 'right' | 'both'): QuickTag[] {
  return QUICK_TAGS.filter((tag) => tag.row === row && tag.side === side)
}

/** The roads after a plan: each road with its changed tags, or as it was */
function applied(roads: readonly RoadTags[], plan: ReturnType<typeof planCell>): RoadTags[] {
  return roads.map((road) => ({
    id: road.id,
    tags: plan?.changes.find((change) => change.id === road.id)?.tags ?? road.tags,
  }))
}

/** One click on a cell over the roads, applied: the roads as the history would leave them */
function clickCell(
  roads: readonly RoadTags[],
  row: QuickTagGroup,
  side: 'left' | 'right' | 'both',
) {
  const plan = planCell(roads, cell(row, side))
  return { plan, roads: applied(roads, plan) }
}

describe('pressed', () => {
  test('a side button is pressed by its own key', () => {
    expect(isPressed({ 'parking:left': 'lane' }, button('parking_left_lane'))).toBe(true)
    expect(isPressed({ 'parking:right': 'lane' }, button('parking_left_lane'))).toBe(false)
  })

  test('`both` is pressed when the two sides share the value; a side is not pressed then', () => {
    const tags = { 'parking:both:fee': 'yes' }
    expect(isPressed(tags, button('parking_both_fee_yes'))).toBe(true)
    expect(isPressed(tags, button('parking_left_fee_yes'))).toBe(false)
    expect(isPressed(tags, button('parking_right_fee_yes'))).toBe(false)
    // two equal side keys say the same as the `both` key
    const twice = { 'parking:left:fee': 'yes', 'parking:right:fee': 'yes' }
    expect(isPressed(twice, button('parking_both_fee_yes'))).toBe(true)
    expect(isPressed(twice, button('parking_left_fee_yes'))).toBe(false)
  })

  test('a side is pressed only when it differs from the other side', () => {
    const left = { 'parking:left:fee': 'yes' }
    expect(isPressed(left, button('parking_left_fee_yes'))).toBe(true)
    expect(isPressed(left, button('parking_right_fee_yes'))).toBe(false)
    expect(isPressed(left, button('parking_both_fee_yes'))).toBe(false)
  })

  test('equal sides press `both` only; different sides press each side', () => {
    const equal = { 'parking:both': 'lane' }
    expect(isPressed(equal, button('parking_both_lane'))).toBe(true)
    expect(isPressed(equal, button('parking_left_lane'))).toBe(false)
    expect(isPressed(equal, button('parking_right_lane'))).toBe(false)
    const twice = { 'parking:left': 'lane', 'parking:right': 'lane' }
    expect(isPressed(twice, button('parking_both_lane'))).toBe(true)
    expect(isPressed(twice, button('parking_left_lane'))).toBe(false)
    expect(isPressed(twice, button('parking_right_lane'))).toBe(false)
    const apart = { 'parking:left': 'lane', 'parking:right': 'separate' }
    expect(isPressed(apart, button('parking_left_lane'))).toBe(true)
    expect(isPressed(apart, button('parking_right_separate'))).toBe(true)
    expect(isPressed(apart, button('parking_right_lane'))).toBe(false)
    expect(isPressed(apart, button('parking_both_lane'))).toBe(false)
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

describe('the value of a cell', () => {
  const position = cell('position', 'left')

  test('a road has the index of the value its side reads, even when both sides share it', () => {
    expect(valueIndex({ 'parking:left': 'separate' }, position)).toBe(2)
    expect(valueIndex({ 'parking:both': 'lane' }, position)).toBe(1)
    expect(valueIndex({}, position)).toBeUndefined()
    expect(valueIndex({ 'parking:left': 'no' }, cell('fee', 'left'))).toBeUndefined()
  })

  test('the state of a shared value: the cell has it, but it is not pressed', () => {
    const state = cellState([{ 'parking:both': 'lane' }], position)
    expect(state.current).toBe(1)
    expect(state.mixed).toBe(false)
    expect(state.pressed).toBe('off')
  })

  test('the next value after the last one is none, then the first again', () => {
    expect(nextIndex(undefined, 3)).toBe(0)
    expect(nextIndex(0, 3)).toBe(1)
    expect(nextIndex(2, 3)).toBeUndefined()
    expect(nextIndex(0, 1)).toBeUndefined()
    expect(nextIndex(undefined, 1)).toBe(0)
  })

  test('roads that have different values are mixed: the cell is not one value', () => {
    const state = cellState([{ 'parking:left': 'no' }, { 'parking:left': 'lane' }], position)
    expect(state.mixed).toBe(true)
    expect(state.current).toBeUndefined()
    expect(state.pressed).toBe('mixed')
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

describe('the cycle of a cell, one road', () => {
  test('fee on the left: yes, then no, then not set, then yes again', () => {
    let roads: RoadTags[] = [{ id: 'w1', tags: {} }]
    const seen: Record<string, string | undefined>[] = []
    for (let click = 0; click < 4; click++) {
      const result = clickCell(roads, 'fee', 'left')
      roads = result.roads
      seen.push(roads[0]?.tags ?? {})
    }
    expect(seen).toEqual([
      { 'parking:left:fee': 'yes' },
      { 'parking:left:fee': 'no' },
      {},
      { 'parking:left:fee': 'yes' },
    ])
  })

  test('the plan says which value a click sets, and which it removes', () => {
    const set = planCell([{ id: 'w1', tags: { 'parking:left:fee': 'yes' } }], cell('fee', 'left'))
    expect(set?.tag.id).toBe('parking_left_fee_no')
    expect(set?.on).toBe(true)
    const removed = planCell(
      [{ id: 'w1', tags: { 'parking:left:fee': 'no' } }],
      cell('fee', 'left'),
    )
    expect(removed?.tag.id).toBe('parking_left_fee_no')
    expect(removed?.on).toBe(false)
  })

  test('position on the left: no, lane, separate, then not set', () => {
    let roads: RoadTags[] = [{ id: 'w1', tags: {} }]
    const values: (string | undefined)[] = []
    for (let click = 0; click < 4; click++) {
      roads = clickCell(roads, 'position', 'left').roads
      values.push(roads[0]?.tags['parking:left'])
    }
    expect(values).toEqual(['no', 'lane', 'separate', undefined])
  })

  test('a shared value is cycled on from the side: left goes on, the right keeps its value', () => {
    const roads: RoadTags[] = [{ id: 'w1', tags: { 'parking:both': 'lane' } }]
    expect(clickCell(roads, 'position', 'left').roads[0]?.tags).toEqual({
      'parking:left': 'separate',
      'parking:right': 'lane',
    })
  })

  test('markings on both sides: yes, then not set', () => {
    let roads: RoadTags[] = [{ id: 'w1', tags: {} }]
    roads = clickCell(roads, 'markings', 'both').roads
    expect(roads[0]?.tags).toEqual({ 'parking:both:markings': 'yes' })
    roads = clickCell(roads, 'markings', 'both').roads
    expect(roads[0]?.tags).toEqual({})
  })

  test('the reasons of no parking: construction, structure, dual carriage, then not set', () => {
    let roads: RoadTags[] = [{ id: 'w1', tags: {} }]
    const reasons: (string | undefined)[] = []
    for (let click = 0; click < 4; click++) {
      roads = clickCell(roads, 'reason', 'right').roads
      reasons.push(roads[0]?.tags['parking:right:reason'])
      if (click === 0) expect(roads[0]?.tags['parking:right']).toBe('no')
    }
    expect(reasons).toEqual(['construction', 'structure', 'dual_carriage', undefined])
    expect(roads[0]?.tags).toEqual({})
  })

  test('the lane toggle on one side: on, then off, which removes its orientation too', () => {
    let roads: RoadTags[] = [{ id: 'w1', tags: {} }]
    roads = clickCell(roads, 'lane', 'left').roads
    expect(roads[0]?.tags).toEqual({
      'parking:left': 'lane',
      'parking:left:orientation': 'parallel',
    })
    roads = clickCell(roads, 'lane', 'left').roads
    expect(roads[0]?.tags).toEqual({})
  })
})

describe('the cycle of a cell, several roads', () => {
  test('roads that all have the same value: the next value on all of them', () => {
    const roads: RoadTags[] = [
      { id: 'w1', tags: { 'parking:left:fee': 'yes' } },
      { id: 'w2', tags: { 'parking:left:fee': 'yes' } },
    ]
    const { plan, roads: after } = clickCell(roads, 'fee', 'left')
    expect(plan?.changes.map((change) => change.id)).toEqual(['w1', 'w2'])
    expect(after.map((road) => road.tags)).toEqual([
      { 'parking:left:fee': 'no' },
      { 'parking:left:fee': 'no' },
    ])
  })

  test('roads that differ (mixed): the first click sets the first value on all of them', () => {
    const roads: RoadTags[] = [
      { id: 'w1', tags: { 'parking:left:fee': 'no' } },
      { id: 'w2', tags: { 'parking:left:fee': 'yes' } },
    ]
    expect(
      cellState(
        roads.map((road) => road.tags),
        cell('fee', 'left'),
      ).pressed,
    ).toBe('mixed')
    const { plan, roads: after } = clickCell(roads, 'fee', 'left')
    expect(plan?.tag.id).toBe('parking_left_fee_yes')
    expect(plan?.on).toBe(true)
    // only the road that did not have it changes: one undo step for both
    expect(plan?.changes).toEqual([{ id: 'w1', tags: { 'parking:left:fee': 'yes' } }])
    expect(after.map((road) => road.tags)).toEqual([
      { 'parking:left:fee': 'yes' },
      { 'parking:left:fee': 'yes' },
    ])
  })

  test('roads with no value: the first value on both, then the cycle goes on together', () => {
    let roads: RoadTags[] = [
      { id: 'w1', tags: { highway: 'residential' } },
      { id: 'w2', tags: {} },
    ]
    roads = clickCell(roads, 'fee', 'left').roads
    expect(roads.map((road) => road.tags['parking:left:fee'])).toEqual(['yes', 'yes'])
    roads = clickCell(roads, 'fee', 'left').roads
    expect(roads.map((road) => road.tags['parking:left:fee'])).toEqual(['no', 'no'])
    roads = clickCell(roads, 'fee', 'left').roads
    expect(roads.map((road) => road.tags)).toEqual([{ highway: 'residential' }, {}])
  })

  test('two roads with the same value: one undo step takes the value away from both', () => {
    const roads: RoadTags[] = [
      { id: 'w1', tags: { 'parking:left': 'lane' } },
      { id: 'w2', tags: { 'parking:left': 'lane', highway: 'primary' } },
    ]
    const plan = planCell(roads, cell('position', 'left'))
    expect(plan?.changes).toEqual([
      { id: 'w1', tags: { 'parking:left': 'separate' } },
      { id: 'w2', tags: { 'parking:left': 'separate', highway: 'primary' } },
    ])
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

  test('the lane cell of both sides is a toggle, not a cycle', () => {
    let roads: RoadTags[] = [{ id: 'w1', tags: {} }]
    roads = clickCell(roads, 'lane', 'both').roads
    expect(roads[0]?.tags).toEqual({
      'parking:both': 'lane',
      'parking:both:orientation': 'parallel',
    })
    roads = clickCell(roads, 'lane', 'both').roads
    expect(roads[0]?.tags).toEqual({})
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

  test('clearing both sides removes every parking key of both, and keeps the rest', () => {
    const tags = {
      highway: 'residential',
      'parking:left': 'no',
      'parking:left:reason': 'construction',
      'parking:right': 'lane',
      'parking:both:fee': 'yes',
      'parking:lane': 'old schema',
    }
    expect(clearSide(tags, 'both')).toEqual({
      highway: 'residential',
      'parking:lane': 'old schema',
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

  test('the clear-both button removes the parking tags of both sides in one plan', () => {
    const roads = [
      { id: 'w1', tags: { highway: 'residential', 'parking:left': 'no', 'parking:right': 'lane' } },
      { id: 'w2', tags: { highway: 'service' } },
    ]
    const plan = planCell(roads, [button('maid_clear_both')])
    expect(plan?.on).toBe(true)
    expect(plan?.changes).toEqual([{ id: 'w1', tags: { highway: 'residential' } }])
    expect(
      planCell(
        [{ id: 'w1', tags: { 'parking:both': 'lane', 'parking:left:fee': 'yes' } }],
        [button('maid_clear_both')],
      )?.changes,
    ).toEqual([{ id: 'w1', tags: {} }])
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

describe('a parking value takes the reason of its side with it', () => {
  test('lane or separate on a side removes the reason of no parking on that side', () => {
    const roads: RoadTags[] = [
      { id: 'w1', tags: { 'parking:left': 'no', 'parking:left:reason': 'construction' } },
    ]
    // the cell goes on from no to lane
    expect(clickCell(roads, 'position', 'left').roads[0]?.tags).toEqual({ 'parking:left': 'lane' })
    const separate: RoadTags[] = [
      { id: 'w1', tags: { 'parking:right': 'lane', 'parking:right:reason': 'structure' } },
    ]
    // the cell goes on from lane to separate, on the right side
    expect(clickCell(separate, 'position', 'right').roads[0]?.tags).toEqual({
      'parking:right': 'separate',
    })
  })

  test('both: a position value on both sides removes the reason of both sides', () => {
    const roads: RoadTags[] = [
      { id: 'w1', tags: { 'parking:both': 'no', 'parking:both:reason': 'structure' } },
    ]
    expect(clickCell(roads, 'position', 'both').roads[0]?.tags).toEqual({ 'parking:both': 'lane' })
  })

  test('no keeps the reason: it is the no parking the reason belongs to', () => {
    const roads: RoadTags[] = [{ id: 'w1', tags: { 'parking:left:reason': 'construction' } }]
    expect(clickCell(roads, 'position', 'left').roads[0]?.tags).toEqual({
      'parking:left': 'no',
      'parking:left:reason': 'construction',
    })
  })

  test('the reason of the other side is kept', () => {
    const roads: RoadTags[] = [
      {
        id: 'w1',
        tags: {
          'parking:left': 'no',
          'parking:left:reason': 'construction',
          'parking:right:reason': 'structure',
          'parking:right': 'no',
        },
      },
    ]
    expect(clickCell(roads, 'position', 'left').roads[0]?.tags).toEqual({
      'parking:left': 'lane',
      'parking:right': 'no',
      'parking:right:reason': 'structure',
    })
  })
})

describe('the focus on the map', () => {
  test('a button is about its side, and its key is its first edit', () => {
    expect(focusKeyOf(button('parking_both_fee_no'))).toBe('parking:both:fee')
    expect(button('parking_both_fee_no').side).toBe('both')
    expect(focusKeyOf(button('maid_clear_right'))).toBe('parking:right')
  })
})
