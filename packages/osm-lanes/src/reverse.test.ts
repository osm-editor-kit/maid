import { describe, expect, it } from 'bun:test'
import { parseWayLanes } from './parse'
import { reverseWayTags } from './reverse'

describe('reverseWayTags', () => {
  it('keeps the pipes of the lane keys and swaps only forward and backward', () => {
    expect(
      reverseWayTags({
        highway: 'primary',
        lanes: '3',
        'lanes:forward': '2',
        'lanes:backward': '1',
        'turn:lanes:forward': 'left|through',
        'width:lanes:backward': '3.25',
        'cycleway:left': 'lane',
      }),
    ).toEqual({
      highway: 'primary',
      lanes: '3',
      'lanes:backward': '2',
      'lanes:forward': '1',
      'turn:lanes:backward': 'left|through',
      'width:lanes:forward': '3.25',
      'cycleway:right': 'lane',
    })
  })

  it('leaves the plain keys of a oneway as they are', () => {
    const reversed = reverseWayTags({
      highway: 'primary',
      oneway: 'yes',
      'turn:lanes': 'left|through',
    })
    expect(reversed['turn:lanes']).toBe('left|through')
    expect(reversed.oneway).toBe('-1')
  })
})

describe('oneway=-1', () => {
  it('reads the lanes in the order of travel, the turns as tagged', () => {
    const model = parseWayLanes({
      highway: 'primary',
      oneway: '-1',
      lanes: '2',
      'turn:lanes': 'left|through',
      'width:lanes': '3|2.5',
    })
    expect(
      model.slots.map((slot) => [slot.direction, slot.index, slot.turn, slot.widthMeters]),
    ).toEqual([
      ['forward', 0, 'left', 3],
      ['forward', 1, 'through', 2.5],
    ])
  })
})
