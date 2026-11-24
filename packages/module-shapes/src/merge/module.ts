import { defineModule } from '@osm-editor-kit/maid-core'
import type { MergeOptions } from './merge.ts'
import { mergeAreasOperationWith } from './operation.ts'

/**
 * Edit menu Merge (C) for two areas: one outline. Plan: docs/research/drawing-tools/README.md
 * `tags: 'combine'` merges areas with different tags when no key has two values that do not fit (`building=yes`
 * gives way to `building=house`); the default wants equal tags.
 */
export function mergeAreas(options: MergeOptions = {}) {
  return defineModule({
    id: 'shapes-merge',
    setup(api) {
      api.register('edit.operation', mergeAreasOperationWith(options))
    },
  })
}
