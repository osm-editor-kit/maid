import { defineModule } from '@osm-editor-kit/maid-core'
import { extractOperations } from './extract-operations.ts'
import { moveSideTagsOperations } from './operations.ts'
import { signRules } from './sign-rules.ts'

/**
 * Side paths of a road, as the iD fork iD-Radnetz (FixMyBerlin) handles them. Registers
 * - `edit.operation` "Tags to left sidewalk" and "Tags to left cycle track" (and right, both): a road
 *   with `sidewalk:left=separate` that still has `sidewalk:left:surface` and the like gives those tags to the
 *   separate way on that side (plain `surface`), and keeps only `sidewalk:left=separate`.
 * - `edit.operation` "Extract left cycle track", "… sidewalk", "… as one path" and "Extract + merge": iD-Radnetz's
 *   extraction of a side into a new way parallel to the road, and its merge with the footway beside it (TILDA's tags)
 * Plan and open steps: docs/research/sidepaths.md
 */
export function sidepaths() {
  return defineModule({
    id: 'sidepaths',
    setup(api) {
      for (const operation of [...extractOperations, ...moveSideTagsOperations])
        api.register('edit.operation', operation)
      // the traffic sign rules decide the extracted way's highway and access: load them before the first extraction
      signRules()
    },
  })
}

export { separateWays } from './find.ts'
export { moveSideTagsPlan } from './move-side-tags.ts'
