/**
 * The writer of a rectangle: turns the four corners the mode accepted into nodes and one closed way, as one undo step.
 * The corners are final when they come here (the reducer checked them). A place on a way gets a node inserted into
 * that way (iD's add midpoint); a node corner is reused; open ground gets a new node.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import { actionAddEntity, actionAddMidpoint, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { m } from '../messages.ts'
import type { Corner, Ring } from './state.ts'

/**
 * Writes the rectangle as one undo step. Returns the id of the new way. The engine's `change` redraws once, after the
 * step. The way is tagged `area=yes`, as the drawing tool tags a new area until it has its type.
 */
export function commitRectangle(engine: MaidEngine, editor: Editor, ring: Ring): string {
  const { context, history } = editor
  let wayId = ''
  engine.change(() => {
    const nodes = ring.map((corner: Corner) => {
      if (corner.type === 'node') return corner.id
      const node = new OsmNode(context, { loc: corner.loc })
      if (corner.type === 'way') {
        // the midpoint adds the node to the edge of the way it was clicked on
        history.perform(actionAddMidpoint({ loc: corner.loc, edge: corner.edge }, node))
      } else {
        history.perform(actionAddEntity(node))
      }
      return node.id
    })
    const way = new OsmWay(context, { nodes: [...nodes, nodes[0]!], tags: { area: 'yes' } })
    history.perform(actionAddEntity(way))
    history.commit({ annotation: m.rectangle_annotation(), selectedIDs: [way.id] })
    wayId = way.id
  })
  return wayId
}
