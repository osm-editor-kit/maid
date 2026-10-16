import { defineModule } from '@osm-editor-kit/maid-core'
import { CutOnMap } from './CutOnMap.tsx'
import { cutOperation } from './operation.ts'

/** Edit menu Cut: draw a line across an area to cut it in two. Plan: docs/research/drawing-tools/README.md */
export function cutArea() {
  return defineModule({
    id: 'shapes-cut',
    setup(api) {
      api.register('edit.operation', cutOperation)
      api.register('map.content', { id: 'shapes-cut', component: CutOnMap })
    },
  })
}
