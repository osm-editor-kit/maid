import { defineModule } from '@osm-editor-kit/maid-core'

/** Hold Shift while drawing or dragging: segments turn in 45° steps, corners lock to 90°. Plan: docs/research/drawing-tools/README.md */
export function angleSnap() {
  return defineModule({
    id: 'shapes-angle-snap',
    setup() {},
  })
}
