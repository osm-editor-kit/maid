/**
 * In-memory OSM data. Deliberately small: enough to render and to measure.
 * (Evaluating @osm-editor-kit/osm-data as the store is an open step.)
 */
import type { Tags } from '@osm-editor-kit/maid-style'
export type OsmNode = {
  type: 'node'
  id: number
  lat: number
  lon: number
  tags?: Tags
}
export type OsmWay = {
  type: 'way'
  id: number
  nodes: number[]
  tags?: Tags
}
export type OsmMember = {
  type: 'node' | 'way' | 'relation'
  ref: number
  role: string
}
export type OsmRelation = {
  type: 'relation'
  id: number
  members: OsmMember[]
  tags?: Tags
}
export type OsmElement = OsmNode | OsmWay | OsmRelation
/** What a merge added. The feature builder only looks at these. */
export type MergeResult = {
  nodes: OsmNode[]
  ways: OsmWay[]
  relations: OsmRelation[]
}
export declare class OsmStore {
  nodes: Map<number, OsmNode>
  ways: Map<number, OsmWay>
  relations: Map<number, OsmRelation>
  /** How many times a node is used by ways. More than one means it is a junction. */
  nodeUses: Map<number, number>
  /** Ways that use a node, for rebuilding them when the node moves */
  nodeWays: Map<number, number[]>
  /** Nodes that are the first or last node of an unclosed way */
  endpoints: Set<number>
  /** Multipolygon relations a way is a member of */
  wayMultipolygons: Map<number, number[]>
  merge(elements: OsmElement[]): MergeResult
  counts(): {
    nodes: number
    ways: number
    relations: number
  }
}
