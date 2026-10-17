import { defineModule } from '@osm-editor-kit/maid-core'
import { type AngleSnapOptions, angleConstraint } from './angle-snap.ts'

/**
 * Hold Shift while drawing or dragging: segments turn in 45° steps, corners lock to 90°, and the length of a segment
 * is rounded to 0.1 m on the ground. `lengths: true` also shows each segment's length in metres while a node is placed,
 * with or without Shift (for the parking editor; too busy for the other modes).
 * Plan: docs/research/drawing-tools/README.md; the hook: docs/adr/0011-drawing-tool-hooks.md.
 * The help hint is not added: the shell has no list of shortcuts that a module can extend.
 */
export function angleSnap(options: AngleSnapOptions = {}) {
  return defineModule({
    id: 'shapes-angle-snap',
    setup(api) {
      api.register('draw.constraint', { id: 'angle-snap', constrain: angleConstraint(options) })
    },
  })
}
