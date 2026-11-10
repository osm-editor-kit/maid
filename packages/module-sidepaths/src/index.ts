import { defineModule } from '@osm-editor-kit/maid-core'
import { moveSideTagsOperations } from './operations.ts'

/**
 * Side paths of a road, as the iD fork iD-Radnetz (FixMyBerlin) handles them. Registers
 * - `edit.operation` "Move sidewalk tags to the … sidewalk" and "Move cycleway tags to the … cycle track": a road
 *   with `sidewalk:left=separate` that still has `sidewalk:left:surface` and the like gives those tags to the
 *   separate way on that side (plain `surface`), and keeps only `sidewalk:left=separate`.
 * Plan and open steps: docs/research/sidepaths.md
 */
export function sidepaths() {
  return defineModule({
    id: 'sidepaths',
    setup(api) {
      for (const operation of moveSideTagsOperations) api.register('edit.operation', operation)
    },
  })
}

export { separateWays } from './find.ts'
export { moveSideTagsPlan } from './move-side-tags.ts'
