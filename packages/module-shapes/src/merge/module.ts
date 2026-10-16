import { defineModule } from '@osm-editor-kit/maid-core'
import { mergeAreasOperation } from './operation.ts'

/** Edit menu Merge (C) for two areas: one outline. Plan: docs/research/drawing-tools/README.md */
export function mergeAreas() {
  return defineModule({
    id: 'shapes-merge',
    setup(api) {
      api.register('edit.operation', mergeAreasOperation)
    },
  })
}
