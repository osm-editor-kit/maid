import { describe, expect, test } from 'bun:test'
import { DEFAULT_BICYCLE_LANE_WIDTH, DEFAULT_LANE_WIDTH, laneBands } from './lane-bands.ts'

const ids = (tags: Record<string, string>) => laneBands(7, tags).map((band) => band.slotId)
const offsets = (tags: Record<string, string>) =>
  laneBands(7, tags).map((band) => band.offsetMetres)

describe('laneBands', () => {
  test('a oneway road: its lanes left to right in pipe order, centred on the way', () => {
    const bands = laneBands(7, {
      highway: 'primary',
      oneway: 'yes',
      lanes: '3',
      'turn:lanes': 'left|through|right',
    })
    expect(bands.map((band) => band.slotId)).toEqual([
      'way/7/lane/forward/0',
      'way/7/lane/forward/1',
      'way/7/lane/forward/2',
    ])
    expect(bands.map((band) => band.offsetMetres)).toEqual([-3, 0, 3])
    expect(bands.map((band) => band.widthMetres)).toEqual([3, 3, 3])
    expect(bands.map((band) => band.turn)).toEqual(['left', 'through', 'right'])
    expect(bands.every((band) => band.kind === 'car')).toBe(true)
  })

  test('a two-way road: backward lanes reversed on the left, forward lanes on the right', () => {
    const tags = {
      highway: 'secondary',
      lanes: '4',
      'lanes:forward': '2',
      'lanes:backward': '2',
      'turn:lanes:backward': 'left|through',
      'turn:lanes:forward': 'through|right',
    }
    const bands = laneBands(7, tags)
    expect(bands.map((band) => band.slotId)).toEqual([
      'way/7/lane/backward/1',
      'way/7/lane/backward/0',
      'way/7/lane/forward/0',
      'way/7/lane/forward/1',
    ])
    expect(offsets(tags)).toEqual([-4.5, -1.5, 1.5, 4.5])
    // backward/0 is the backward travel's leftmost lane: next to the middle of the road
    expect(bands[1]!.turn).toBe('left')
    expect(bands[0]!.turn).toBe('through')
    expect(bands.map((band) => band.direction)).toEqual([
      'backward',
      'backward',
      'forward',
      'forward',
    ])
  })

  test('a lane used in both directions sits between the two directions', () => {
    const tags = {
      highway: 'tertiary',
      lanes: '3',
      'lanes:forward': '1',
      'lanes:backward': '1',
      'lanes:both_ways': '1',
      'turn:lanes:both_ways': 'left',
    }
    expect(ids(tags)).toEqual([
      'way/7/lane/backward/0',
      'way/7/lane/both_ways/0',
      'way/7/lane/forward/0',
    ])
    expect(offsets(tags)).toEqual([-3, 0, 3])
    expect(laneBands(7, tags)[1]!.kind).toBe('car')
  })

  test('a German cycle lane in the pipes but not in `lanes`: a narrower bicycle band at the edge', () => {
    const bands = laneBands(7, {
      highway: 'secondary',
      oneway: 'yes',
      lanes: '2',
      'bicycle:lanes': 'no|no|designated',
      'vehicle:lanes': 'yes|yes|no',
    })
    expect(bands.map((band) => band.kind)).toEqual(['car', 'car', 'bicycle'])
    expect(bands.map((band) => band.widthMetres)).toEqual([
      DEFAULT_LANE_WIDTH,
      DEFAULT_LANE_WIDTH,
      DEFAULT_BICYCLE_LANE_WIDTH,
    ])
    const total = 2 * DEFAULT_LANE_WIDTH + DEFAULT_BICYCLE_LANE_WIDTH
    expect(bands[0]!.offsetMetres).toBeCloseTo(-total / 2 + DEFAULT_LANE_WIDTH / 2)
    expect(bands[2]!.offsetMetres).toBeCloseTo(total / 2 - DEFAULT_BICYCLE_LANE_WIDTH / 2)
    expect(bands[2]!.slotId).toBe('way/7/lane/forward/2')
  })

  test('a bus lane and a lane closed to vehicles have their kinds', () => {
    const bands = laneBands(7, {
      highway: 'primary',
      oneway: 'yes',
      lanes: '3',
      'bus:lanes': 'no|no|designated',
      'vehicle:lanes': 'no|yes|yes',
    })
    expect(bands.map((band) => band.kind)).toEqual(['other', 'car', 'bus'])
  })

  test('oneway=-1: the lanes run against the drawing, so their offsets are turned round', () => {
    const tags = {
      highway: 'primary',
      oneway: '-1',
      lanes: '2',
      'turn:lanes': 'left|through',
    }
    const bands = laneBands(7, tags)
    // the lane model parses it in its travel direction: the lanes are forward, as in the diagram and the table
    expect(bands.map((band) => band.slotId)).toEqual([
      'way/7/lane/forward/0',
      'way/7/lane/forward/1',
    ])
    // the leftmost lane in travel is on the right of the way as drawn
    expect(bands.map((band) => band.offsetMetres)).toEqual([1.5, -1.5])
    // the pipes run in the order of travel and the turns stay as tagged (osm-lanes `reverseWayTags`)
    expect(bands.map((band) => band.turn)).toEqual(['left', 'through'])
  })

  test('width:lanes sets each band, and the bands stay edge to edge', () => {
    const bands = laneBands(7, {
      highway: 'primary',
      oneway: 'yes',
      lanes: '3',
      'width:lanes': '3.5|2.75|4 m',
    })
    expect(bands.map((band) => band.widthMetres)).toEqual([3.5, 2.75, 4])
    const total = 3.5 + 2.75 + 4
    expect(bands.map((band) => band.offsetMetres)).toEqual([
      -total / 2 + 1.75,
      -total / 2 + 3.5 + 1.375,
      total / 2 - 2,
    ])
    for (let i = 1; i < bands.length; i++) {
      const previous = bands[i - 1]!
      const band = bands[i]!
      expect(previous.offsetMetres + previous.widthMetres / 2).toBeCloseTo(
        band.offsetMetres - band.widthMetres / 2,
      )
    }
  })

  test('directional widths on a two-way road', () => {
    const bands = laneBands(7, {
      highway: 'secondary',
      lanes: '3',
      'lanes:forward': '2',
      'lanes:backward': '1',
      'width:lanes:forward': '3|2.5',
      'width:lanes:backward': '3.25',
    })
    expect(bands.map((band) => band.widthMetres)).toEqual([3.25, 3, 2.5])
  })

  test('driving_side=left: the forward lanes on the left', () => {
    expect(
      ids({
        highway: 'primary',
        driving_side: 'left',
        lanes: '2',
        'lanes:forward': '1',
        'lanes:backward': '1',
      }),
    ).toEqual(['way/7/lane/forward/0', 'way/7/lane/backward/0'])
  })

  test('the slot id carries the way number, negative for a new way', () => {
    expect(laneBands(-3, { highway: 'primary', oneway: 'yes', lanes: '1' })[0]!.slotId).toBe(
      'way/-3/lane/forward/0',
    )
  })

  test('a lone lane is centred on the way', () => {
    expect(offsets({ highway: 'primary', oneway: 'yes', lanes: '1' })).toEqual([0])
  })

  test('undefined tag values are left out', () => {
    expect(
      ids({ highway: 'primary', oneway: 'yes', lanes: '1', name: undefined } as never),
    ).toEqual(['way/7/lane/forward/0'])
  })
})

describe('laneBands with placement', () => {
  test('placement:forward=left_of:1: the way runs along the left edge of the first forward lane', () => {
    const bands = laneBands(7, {
      highway: 'secondary',
      lanes: '3',
      'lanes:forward': '2',
      'lanes:backward': '1',
      'width:lanes:forward': '3|3',
      'width:lanes:backward': '3',
    })
    const placed = laneBands(7, {
      highway: 'secondary',
      lanes: '3',
      'lanes:forward': '2',
      'lanes:backward': '1',
      'width:lanes:forward': '3|3',
      'width:lanes:backward': '3',
      'placement:forward': 'left_of:1',
    })
    expect(bands.map((band) => band.offsetMetres)).toEqual([-3, 0, 3])
    expect(placed.map((band) => band.offsetMetres)).toEqual([-1.5, 1.5, 4.5])
  })

  test('placement=middle_of:2 on a oneway', () => {
    const placed = laneBands(7, {
      highway: 'primary',
      oneway: 'yes',
      lanes: '3',
      placement: 'middle_of:2',
    })
    expect(placed.map((band) => band.offsetMetres)).toEqual([-3, 0, 3])
    const right = laneBands(7, {
      highway: 'primary',
      oneway: 'yes',
      lanes: '2',
      placement: 'right_of:2',
    })
    expect(right.map((band) => band.offsetMetres)).toEqual([-4.5, -1.5])
  })

  test('placement:backward counts from the left in backward travel', () => {
    const placed = laneBands(7, {
      highway: 'secondary',
      lanes: '2',
      'lanes:forward': '1',
      'lanes:backward': '1',
      'placement:backward': 'left_of:1',
    })
    // the left edge of the backward lane, in its travel, is its right edge as drawn: the middle of the road
    expect(placed.map((band) => band.offsetMetres)).toEqual([-1.5, 1.5])
  })

  test('a placement on a lane that is not there keeps the bands centred', () => {
    const placed = laneBands(7, {
      highway: 'primary',
      oneway: 'yes',
      lanes: '2',
      placement: 'left_of:5',
    })
    expect(placed.map((band) => band.offsetMetres)).toEqual([-1.5, 1.5])
  })
})
