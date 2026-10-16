import { defineModule } from '@osm-editor-kit/maid-core'
import { DivideOnMap } from './DivideOnMap.tsx'
import { divideOperation } from './operation.ts'

/**
 * Edit menu Divide: one selected area with four corners is cut into columns by rows (parking spaces, terraced houses).
 * The operation starts the divide mode; the map content draws its preview and panel. Plan: docs/research/drawing-tools/5-grid-and-rows.md.
 */
export function divideArea() {
  return defineModule({
    id: 'shapes-divide',
    setup(api) {
      api.register('edit.operation', divideOperation)
      api.register('map.content', { id: 'shapes-divide', component: DivideOnMap })
    },
  })
}
