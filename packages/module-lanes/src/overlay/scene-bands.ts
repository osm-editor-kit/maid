/**
 * The bands of the map from the diagram's own scene, so map and diagram show the same lanes at the same places: the
 * cycle lanes the diagram adds from `cycleway:left|right|both` and `cycleway:lanes` included, with the diagram's
 * widths and its reading of `placement=*` (the way line, `placement_guide`). The scene runs with travel upwards; its
 * x minus the way line's x, in metres, is the band's offset to the right of the way in its direction of travel.
 */
import {
  buildRoadSpaceSegment,
  layoutRoadSpace,
  type SceneSlotRect,
} from '@osm-editor-kit/osm-lane-diagram'
import type { LaneDirection } from '@osm-editor-kit/osm-lanes'
import { wayLineXAt } from '../diagram/shapes.ts'
import { plainTags, type Tags } from '../edit.ts'

export type LaneBandKind = 'car' | 'bus' | 'bicycle' | 'other'

export type LaneBand = {
  /** The diagram's slot id (`way/<id>/lane/<direction>/<index>`), as `laneFocus` holds it */
  slotId: string
  direction: LaneDirection
  /** OSM pipe order within the direction (10000 and up: a cycle lane the diagram adds) */
  index: number
  /** Distance of the band's middle from the way, signed: negative is left of the way's drawing direction */
  offsetMetres: number
  widthMetres: number
  kind: LaneBandKind
  /** The lane's turn value, when tagged */
  turn?: string
}

const KINDS: Partial<Record<SceneSlotRect['kind'], LaneBandKind>> = {
  motor: 'car',
  both_ways: 'car',
  bus: 'bus',
  cycle: 'bicycle',
}

function isReverseOneway(tags: Record<string, string>): boolean {
  const oneway = tags.oneway?.toLowerCase()
  return oneway === '-1' || oneway === 'reverse'
}

/** The lanes on the carriageway of a way as bands, left to right as the diagram draws them */
export function sceneBands(wayId: number, tags: Tags): LaneBand[] {
  const plain = plainTags(tags)
  const segment = buildRoadSpaceSegment(plain, { wayId, role: 'current' })
  const scene = layoutRoadSpace({ segments: [segment] })
  const rects = scene.slotRects.filter(
    (rect) =>
      rect.wayId === wayId &&
      rect.zone === 'carriageway' &&
      KINDS[rect.kind] !== undefined &&
      rect.label !== 'sibling' &&
      rect.label !== 'step_fill' &&
      rect.points === undefined,
  )
  if (rects.length === 0 || scene.metersToPx <= 0) return []
  const middleOf = (rect: SceneSlotRect) => rect.x + rect.width / 2
  const left = Math.min(...rects.map((rect) => rect.x))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const sign = isReverseOneway(plain) ? -1 : 1
  return rects
    .toSorted((a, b) => a.x - b.x)
    .map((rect) => {
      const wayX =
        wayLineXAt(scene, rect.y + rect.height / 2) ?? scene.centrelineX ?? (left + right) / 2
      const lane = /\/lane\/(forward|backward|both_ways)\/(\d+)$/.exec(rect.slotId)
      const direction: LaneDirection =
        rect.direction === 'backward' || rect.direction === 'both_ways' ? rect.direction : 'forward'
      return {
        slotId: rect.slotId,
        direction,
        index: lane ? Number(lane[2]) : 0,
        // + 0 turns -0 into 0
        offsetMetres: (sign * (middleOf(rect) - wayX)) / scene.metersToPx + 0,
        widthMetres: rect.width / scene.metersToPx,
        kind: KINDS[rect.kind]!,
        ...(rect.turn === undefined ? {} : { turn: rect.turn }),
      }
    })
}
