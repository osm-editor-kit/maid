/**
 * The lanes of a road as bands across it: one band per lane slot of the lane model (`parseWayLanes`), each with its
 * offset from the way's centre line and its width in metres. Pure: the map overlay (LanesOnMap.tsx) draws them.
 *
 * Order: the cross-section as the lane diagram and the lane table show it (LanesSection.tsx `columnsOf`), left to right
 * with travel upwards: the backward lanes reversed (their pipes run left to right in *their* travel), the lanes used in
 * both directions, the forward lanes. With `driving_side=left` the forward lanes are on the left and the backward
 * lanes on the right.
 *
 * Offsets are signed in the way's drawing direction, as MapLibre's `line-offset` takes them: negative is left of the
 * way as it is drawn, positive right. A road with `oneway=-1` is parsed in its travel direction (the lane model mirrors
 * the tags, its lanes are `forward`), which runs against the drawing: its offsets are turned round.
 *
 * The bands are centred on the way. `placement=*` (the way drawn along a lane edge, not the road's middle) is not read.
 */
import { DEFAULT_WIDTHS_M, formatLaneSlotId } from '@osm-editor-kit/osm-lane-diagram'
import {
  getDrivingSideFromTags,
  parseWayLanes,
  type LaneDirection,
  type LaneSlot,
} from '@osm-editor-kit/osm-lanes'
import { plainTags, type Tags } from '../edit.ts'

export type LaneBandKind = 'car' | 'bus' | 'bicycle' | 'other'

export type LaneBand = {
  /** The diagram's slot id (`way/<id>/lane/<direction>/<index>`), as `laneFocus` holds it */
  slotId: string
  direction: LaneDirection
  /** OSM pipe order within the direction */
  index: number
  /** Distance of the band's middle from the way, signed: negative is left of the way's drawing direction */
  offsetMetres: number
  widthMetres: number
  kind: LaneBandKind
  /** The lane's `turn:lanes` value, when tagged */
  turn?: string
}

/** Width of a lane without `width:lanes`: the diagram's defaults, so map and diagram agree */
export const DEFAULT_LANE_WIDTH = DEFAULT_WIDTHS_M.motor
export const DEFAULT_BICYCLE_LANE_WIDTH = DEFAULT_WIDTHS_M.cycle

function isReverseOneway(tags: Record<string, string>): boolean {
  const oneway = tags.oneway?.toLowerCase()
  return oneway === '-1' || oneway === 'reverse'
}

/** The band's kind from the lane model's: a lane closed to vehicles (`vehicle:lanes=no`) that is no bus or cycle lane is other */
function kindOf(slot: LaneSlot): LaneBandKind {
  switch (slot.kind) {
    case 'bicycle':
      return 'bicycle'
    case 'bus':
      return 'bus'
    case 'both_ways_turn':
      return 'car'
    case 'travel':
      return slot.vehicleAccess?.toLowerCase() === 'no' ? 'other' : 'car'
  }
}

function widthOf(slot: LaneSlot, kind: LaneBandKind): number {
  if (slot.widthMeters !== undefined && slot.widthMeters > 0) return slot.widthMeters
  return kind === 'bicycle' ? DEFAULT_BICYCLE_LANE_WIDTH : DEFAULT_LANE_WIDTH
}

/** The slots left to right as the diagram shows them (travel upwards) */
function crossSectionOrder(slots: readonly LaneSlot[], drivingSide: 'left' | 'right'): LaneSlot[] {
  const of = (direction: LaneDirection) =>
    slots.filter((slot) => slot.direction === direction).toSorted((a, b) => a.index - b.index)
  const backward = of('backward').toReversed()
  const both = of('both_ways')
  const forward = of('forward')
  return drivingSide === 'left'
    ? [...forward, ...both, ...backward]
    : [...backward, ...both, ...forward]
}

/**
 * The bands of a road, left to right across it as the diagram shows them. `wayId` is the number of the way's id
 * (`osmNumber`, scene.ts). Empty when the tags give no lanes.
 */
export function laneBands(wayId: number, tags: Tags): LaneBand[] {
  const plain = plainTags(tags)
  const model = parseWayLanes(plain)
  const ordered = crossSectionOrder(model.slots, getDrivingSideFromTags(plain))
  const sized = ordered.map((slot) => {
    const kind = kindOf(slot)
    return { slot, kind, width: widthOf(slot, kind) }
  })
  const total = sized.reduce((sum, band) => sum + band.width, 0)
  // the lane model's left-to-right runs along travel; on a oneway=-1 road travel is against the drawing
  const sign = isReverseOneway(plain) ? -1 : 1
  let left = -total / 2
  return sized.map(({ slot, kind, width }) => {
    const middle = left + width / 2
    left += width
    return {
      slotId: formatLaneSlotId(wayId, slot.direction, slot.index),
      direction: slot.direction,
      index: slot.index,
      // + 0 turns -0 into 0
      offsetMetres: sign * middle + 0,
      widthMetres: width,
      kind,
      ...(slot.turn === undefined ? {} : { turn: slot.turn }),
    }
  })
}
