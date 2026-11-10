import { describe, expect, test } from 'bun:test'
import { addLane, laneCounts, removeLane, setLaneValue } from './edit.ts'

const twoWay = { highway: 'primary', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1' }
const oneway = { highway: 'primary', oneway: 'yes', lanes: '2', 'turn:lanes': 'left|through' }

describe('setLaneValue', () => {
  test('one entry of a oneway road', () => {
    expect(setLaneValue(oneway, 'forward', 1, 'turn', 'through;right')['turn:lanes']).toBe(
      'left|through;right',
    )
  })

  test('a new pipe on a two-way road writes the directional key with empty entries', () => {
    const out = setLaneValue(twoWay, 'forward', 1, 'bus', 'designated')
    expect(out['bus:lanes:forward']).toBe('|designated')
    expect(out['bus:lanes']).toBeUndefined()
  })

  test('emptying the last value removes the key, other tags stay', () => {
    const out = setLaneValue({ ...oneway, 'width:lanes': '|3' }, 'forward', 1, 'width', '')
    expect('width:lanes' in out).toBe(false)
    expect(out['turn:lanes']).toBe('left|through')
  })

  test('writes nothing it was not asked for', () => {
    const out = setLaneValue(oneway, 'forward', 0, 'turn', 'left')
    expect(Object.keys(out).sort()).toEqual(Object.keys(oneway).sort())
  })
})

describe('addLane and removeLane', () => {
  test('a oneway road: count and every pipe grow at the kerb side', () => {
    const out = addLane(oneway, 'forward')
    expect(out.lanes).toBe('3')
    expect(out['turn:lanes']).toBe('left|through|')
    expect(laneCounts(out).forward).toBe(3)
  })

  test('a two-way road: total and the direction count', () => {
    const out = addLane(twoWay, 'backward')
    expect([out.lanes, out['lanes:forward'], out['lanes:backward']]).toEqual(['4', '2', '2'])
  })

  test('a two-way road with only lanes=2 gets explicit counts', () => {
    const out = addLane({ highway: 'residential', lanes: '2' }, 'forward')
    expect([out.lanes, out['lanes:forward'], out['lanes:backward']]).toEqual(['3', '2', '1'])
  })

  test('remove takes the lane out of every pipe of its direction', () => {
    const tags = {
      ...twoWay,
      'turn:lanes:forward': 'left|through',
      'turn:lanes:backward': 'through',
    }
    const out = removeLane(tags, 'forward', 0)
    expect(out['turn:lanes:forward']).toBe('through')
    expect(out['turn:lanes:backward']).toBe('through')
    expect([out.lanes, out['lanes:forward']]).toEqual(['2', '1'])
  })

  test('remove drops a pipe that is left empty', () => {
    const out = removeLane({ ...oneway, 'bus:lanes': '|designated' }, 'forward', 1)
    expect('bus:lanes' in out).toBe(false)
    expect(out['turn:lanes']).toBe('left')
  })

  test('a cycle lane in the pipes but not in lanes (German pattern): the counts step from the tagged counts', () => {
    const tags = {
      ...twoWay,
      'bicycle:lanes:forward': 'no|designated|yes',
      'turn:lanes:forward': 'through|through|right',
    }
    expect(laneCounts(tags).forward).toBe(3)
    const out = addLane(tags, 'forward')
    expect([out.lanes, out['lanes:forward'], out['lanes:backward']]).toEqual(['4', '3', '1'])
    expect(out['turn:lanes:forward']).toBe('through|through|right|')
  })
})
