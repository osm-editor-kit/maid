/**
 * What an edit changed about an entity, as iD's visual diff shows it (css/20_map.css, `highlight-edited`): created
 * here (`added`), its place or its nodes changed (`moved`), or only its tags (`retagged`). The builder sets it as the
 * feature's `ed` property, so the highlight is a paint of the layers (layers.ts) and needs no feature state.
 *
 * Compared with the base graph, the data as it was loaded: `history.staging.graph.base`. Nothing is kept per edit.
 */
import {
  type Graph,
  type OsmEntity,
  OsmNode,
  OsmRelation,
  OsmWay,
} from '@osm-editor-kit/maid-model'
import type { Tags } from '@osm-editor-kit/maid-style'

export type EditKind = 'added' | 'moved' | 'retagged'

/** The kind of an edit of the entity `id`, or undefined when it is as it was loaded (or unknown) */
export function editKindOf(graph: Graph, id: string): EditKind | undefined {
  const head = graph.hasEntity(id)
  if (!head) return undefined
  const base = graph.base.entities.get(id)
  if (!base) return 'added'
  if (movedBetween(graph, base, head)) return 'moved'
  return sameTags(base.tags, head.tags) ? undefined : 'retagged'
}

/**
 * A node's place, a way's nodes, or a relation's members changed. A way or a relation counts as moved when one of its
 * nodes moved: iD marks the segments next to the node, the builder marks the whole way (an approximation).
 */
function movedBetween(graph: Graph, base: OsmEntity, head: OsmEntity): boolean {
  if (base instanceof OsmNode && head instanceof OsmNode) return !sameLoc(base, head)
  if (base instanceof OsmWay && head instanceof OsmWay) {
    if (!sameList(base.nodes, head.nodes)) return true
    return head.nodes.some((node) => nodeMoved(graph, node))
  }
  if (base instanceof OsmRelation && head instanceof OsmRelation) {
    const sameMembers =
      base.members.length === head.members.length &&
      base.members.every((m, i) => m.id === head.members[i]?.id && m.role === head.members[i]?.role)
    if (!sameMembers) return true
    return head.members.some((member) => member.type === 'way' && wayMoved(graph, member.id))
  }
  return false
}

/** A way of a multipolygon that moved changes the area the relation draws (the untagged outer way has no feature) */
function wayMoved(graph: Graph, id: string): boolean {
  const head = graph.hasEntity(id)
  const base = graph.base.entities.get(id)
  return head instanceof OsmWay && base instanceof OsmWay && movedBetween(graph, base, head)
}

/** A node that is edited and was loaded, and whose place changed. A new or a deleted node is left to the way's node list. */
function nodeMoved(graph: Graph, id: string): boolean {
  if (!graph.local.entities.has(id)) return false
  const head = graph.hasEntity(id)
  const base = graph.base.entities.get(id)
  return head instanceof OsmNode && base instanceof OsmNode && !sameLoc(base, head)
}

function sameLoc(a: OsmNode, b: OsmNode): boolean {
  return a.loc?.[0] === b.loc?.[0] && a.loc?.[1] === b.loc?.[1]
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

function sameTags(a: Tags, b: Tags): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}
