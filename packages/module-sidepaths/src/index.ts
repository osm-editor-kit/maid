import { defineModule } from '@osm-editor-kit/maid-core'
import { operationGroup } from '@osm-editor-kit/maid-operations'
import { extractOperations } from './extract-operations.ts'
import { m } from './messages.ts'
import { moveSideTagsOperations } from './operations.ts'
import { signRules } from './sign-rules.ts'

/**
 * Side paths of a road, as the iD fork iD-Radnetz (FixMyBerlin) handles them. Registers
 * - `edit.operation` "Tags to left sidewalk" and "Tags to left cycle track" (and right, both): a road
 *   with `sidewalk:left=separate` that still has `sidewalk:left:surface` and the like gives those tags to the
 *   separate way on that side (plain `surface`), and keeps only `sidewalk:left=separate`.
 * - `edit.operation` "Extract side path", one entry with a flyout of "Extract left cycle track", "… sidewalk", "… as one
 *   path" and "Extract + merge": iD-Radnetz's extraction of a side into a new way parallel to the road, and its merge
 *   with the footway beside it (TILDA's tags)
 * Plan and open steps: docs/research/sidepaths.md
 */
export function sidepaths() {
  return defineModule({
    id: 'sidepaths',
    setup(api) {
      // the extractions are one entry with a flyout of the sides and kinds that apply (Tobias, 2026-11-13)
      const extract = operationGroup({
        id: 'extract-side-path',
        label: () => m.extract_group_label(),
        icon: 'iD-operation-extract',
        group: 'structure',
        members: extractOperations,
      })
      for (const operation of [extract, ...moveSideTagsOperations])
        api.register('edit.operation', operation)
      // the traffic sign rules decide the extracted way's highway and access: load them before the first extraction
      signRules()
    },
  })
}

export { separateWays } from './find.ts'
export { moveSideTagsPlan } from './move-side-tags.ts'
