import { defineModule } from '@osm-editor-kit/maid-core'
import { resizeOperation } from './operation.ts'
import { ResizeOnMap } from './ResizeOnMap.tsx'

/**
 * Edit menu Resize (K): a box with handles around the selected features, dragged as in a graphics program; Shift keeps
 * the proportions, Alt the centre. The operation starts the resize mode; the map content draws the box and the panel.
 * Plan: docs/research/drawing-tools/7-resize.md.
 */
export function resize() {
  return defineModule({
    id: 'shapes-resize',
    setup(api) {
      api.register('edit.operation', resizeOperation)
      api.register('map.content', { id: 'shapes-resize', component: ResizeOnMap })
    },
  })
}
