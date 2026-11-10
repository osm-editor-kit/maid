import { defineModule } from '@osm-editor-kit/maid-core'
import { ExtrudeOnMap } from './ExtrudeOnMap.tsx'
import { extrudeOperation } from './operation.ts'

/**
 * Edit menu Extrude (J), as JOSM's: handles on the sides of the selected way pull a side out or in at a right angle,
 * with new corners (a bump) or, with Shift, by moving the side; a click on the outline adds a corner. The operation
 * starts the extrude mode; the map content draws the handles, the preview and the panel.
 * Plan: docs/research/drawing-tools/9-extrude.md.
 */
export function extrude() {
  return defineModule({
    id: 'shapes-extrude',
    setup(api) {
      api.register('edit.operation', extrudeOperation)
      api.register('map.content', { id: 'shapes-extrude', component: ExtrudeOnMap })
    },
  })
}
