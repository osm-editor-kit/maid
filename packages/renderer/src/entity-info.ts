import type { Geometry } from '@osm-editor-kit/maid-presets'
// What the inspector knows about one entity: its tags, geometry, preset and size (the engine's entity()).
// Reads the data, the presets and the filters through the engine's public members only.
import { isArea } from '@osm-editor-kit/maid-style'
import type { EntityInfo, MaidEngine } from './engine'

type EntityHost = Pick<MaidEngine, 'data' | 'options' | 'centreOf' | 'isReadOnly'>

export function entityInfo(engine: EntityHost, id: string | null): EntityInfo | undefined {
  if (!id) return undefined
  if (id[0] === 'n') {
    const node = engine.data.node(id)
    if (!node) return undefined
    const geometry: Geometry = engine.data.nodeWays.has(id) ? 'vertex' : 'point'
    const tags = node.tags
    return {
      id,
      type: 'node',
      geometry,
      tags,
      preset: engine.options.editor.presets?.match(tags, geometry, engine.centreOf(id)),
      readOnly: engine.isReadOnly(id),
    }
  }
  if (id[0] === 'w') {
    const way = engine.data.way(id)
    if (!way) return undefined
    const tags = way.tags
    const closed = way.nodes.length > 2 && way.nodes[0] === way.nodes[way.nodes.length - 1]
    const geometry: Geometry = isArea(way.tags, closed) ? 'area' : 'line'
    return {
      id,
      type: 'way',
      geometry,
      tags,
      preset: engine.options.editor.presets?.match(tags, geometry, engine.centreOf(id)),
      size: way.nodes.length,
      readOnly: engine.isReadOnly(id),
    }
  }
  const relation = engine.data.relation(id)
  if (!relation) return undefined
  const tags = relation.tags
  const geometry: Geometry = tags.type === 'multipolygon' ? 'area' : 'relation'
  return {
    id,
    type: 'relation',
    geometry,
    tags,
    preset: engine.options.editor.presets?.match(tags, geometry, engine.centreOf(id)),
    size: relation.members.length,
    readOnly: engine.isReadOnly(id),
  }
}
