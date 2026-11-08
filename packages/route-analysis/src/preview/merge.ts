import type { LonLat, RouteInput } from '../types.ts'
import type { RoutePreview } from './postpass.ts'

/** The input with the preview filled in, and which members came from it */
export type PreviewedInput = {
  input: RouteInput
  /** Member ids whose shape is the preview's: drawn muted, read only, loaded for real on a click */
  previewed: ReadonlySet<string>
}

/**
 * Fills the members that are not loaded with the preview's simplified shapes. Loaded data always wins: a member in
 * `input.ways` or `input.nodes` keeps its own shape, and an end node that is loaded keeps its own position, so a
 * preview way joins the loaded ones next to it. The inner points of a preview way get ids of their own
 * (`w5:1`, `w5:2` ...) that nothing else shares. Tags come from the preview where the input has none.
 *
 * A preview way without geometry (untagged in OSM, so Postpass has no shape) or without end nodes stays not loaded.
 * No junctions are known for preview ways: `outsideWays` is left as it is.
 */
export function withPreview(input: RouteInput, preview: RoutePreview): PreviewedInput {
  const ways = new Map(input.ways)
  const nodes = new Map(input.nodes)
  const memberTags = new Map(input.memberTags)
  const previewed = new Set<string>()
  for (const member of input.members) {
    if (member.type === 'way' && !ways.has(member.id)) {
      const way = preview.ways.get(member.id)
      if (!way?.line || !way.ends) continue
      const line = way.line
      const ids = line.map((_, index) =>
        index === 0
          ? way.ends![0]
          : index === line.length - 1
            ? way.ends![1]
            : `${member.id}:${index}`,
      )
      ids.forEach((id, index) => {
        if (!nodes.has(id)) nodes.set(id, line[index] as LonLat)
      })
      ways.set(member.id, ids)
      if (!memberTags.has(member.id) && Object.keys(way.tags).length > 0)
        memberTags.set(member.id, way.tags)
      previewed.add(member.id)
    } else if (member.type === 'node' && !nodes.has(member.id)) {
      const node = preview.nodes.get(member.id)
      if (!node) continue
      nodes.set(member.id, node.at)
      if (!memberTags.has(member.id) && Object.keys(node.tags).length > 0)
        memberTags.set(member.id, node.tags)
      previewed.add(member.id)
    }
  }
  return { input: { ...input, ways, nodes, memberTags }, previewed }
}

/**
 * The input of a relation that is not loaded at all, from the preview alone: a stage of a superroute before it is
 * opened. Undefined when the preview does not have the relation.
 */
export function previewInput(
  preview: RoutePreview,
  relationId: string,
): PreviewedInput | undefined {
  const relation = preview.relations.get(relationId)
  if (!relation) return undefined
  return withPreview(
    { tags: relation.tags, members: relation.members, ways: new Map(), nodes: new Map() },
    preview,
  )
}

/** How many members of the relation are neither loaded nor in the preview with a shape */
export function stillMissing(input: RouteInput) {
  return input.members.filter((member) =>
    member.type === 'way'
      ? !input.ways.has(member.id)
      : member.type === 'node'
        ? !input.nodes.has(member.id)
        : false,
  ).length
}
