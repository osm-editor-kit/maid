/**
 * Input and output of the street drawing (`streetGeometry`): every road of an area with its lanes at their widths,
 * joined at junctions, in [lon, lat]. The input is each way's cross-section (its lanes as offsets from the way's line);
 * how a cross-section is read from the tags is the caller's (Maid: the diagram's scene, module-lanes `sceneBands`).
 */

export type StreetLaneDirection = 'forward' | 'backward' | 'both_ways'

/** One lane of a way's cross-section, as offsets from the way's line in metres, right of its drawing direction positive */
export type StreetLane = {
  /** Stable id of the lane (the diagram's slot id) */
  id: string
  left: number
  right: number
  direction: StreetLaneDirection
  /** What uses the lane (`car`, `bus`, `bicycle`, …), passed through to the output */
  kind: string
  /** `turn:lanes` value of the lane */
  turn?: string
}

export type StreetWay = {
  id: string
  tags: Readonly<Record<string, string | undefined>>
  nodes: readonly string[]
  /** The lanes left to right in the way's drawing direction; a way without lanes is left out */
  lanes: readonly StreetLane[]
}

export type StreetInput = {
  ways: readonly StreetWay[]
  /** [lon, lat] of a node; undefined for a node not loaded (the way is drawn through the others) */
  loc(nodeId: string): readonly [number, number] | undefined
}

export type LonLat = [number, number]

export type StreetLanePolygon = {
  wayId: string
  laneId: string
  kind: string
  direction: StreetLaneDirection
  turn?: string
  /** Closed ring, first point not repeated */
  ring: LonLat[]
  /**
   * A lane of the road this one runs on into, narrowing to nothing on this road (a lane added or dropped where two
   * roads join): drawn like the lane it belongs to
   */
  taper?: boolean
}

export type StreetJunction = {
  nodeId: string
  /** The junction's surface between the ends of its roads, closed ring, first point not repeated */
  ring: LonLat[]
  /** The kerbs of its corners between neighbouring roads */
  kerbs: LonLat[][]
}

export type StreetLineKind = 'lane' | 'centre' | 'kerb'

export type StreetLine = {
  wayId: string
  kind: StreetLineKind
  line: LonLat[]
}

export type StreetArrow = {
  wayId: string
  laneId: string
  loc: LonLat
  /** Direction of travel, clockwise from north, in degrees */
  bearing: number
  turn: string
}

export type StreetGeometry = {
  lanes: StreetLanePolygon[]
  junctions: StreetJunction[]
  lines: StreetLine[]
  arrows: StreetArrow[]
}
