// Rapid declares these id types globally (modules/types/ids.ts). Kept global so the ported files need no edits.
export {}
declare global {
  type EntityID = string
  type NodeID = string
  type WayID = string
  type RelationID = string
  type GraphID = string
  type SequenceID = string
  type ServiceID = string
  type GeometryType = 'point' | 'vertex' | 'line' | 'area' | 'relation'
  type Nullable<T> = T | null | undefined
}
