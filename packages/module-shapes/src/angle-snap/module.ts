import { defineModule } from '@osm-editor-kit/maid-core'
import { constrainAngle } from './angle-snap.ts'

/**
 * Hold Shift while drawing or dragging: segments turn in 45° steps, corners lock to 90°.
 * Plan: docs/research/drawing-tools/README.md; the hook: docs/adr/0011-drawing-tool-hooks.md.
 * The help hint is not added: the shell has no list of shortcuts that a module can extend.
 */
export function angleSnap() {
  return defineModule({
    id: 'shapes-angle-snap',
    setup(api) {
      api.register('draw.constraint', { id: 'angle-snap', constrain: constrainAngle })
    },
  })
}
