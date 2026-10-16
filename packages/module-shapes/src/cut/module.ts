import { defineModule } from '@osm-editor-kit/maid-core'

/** Edit menu Cut: draw a line across an area to cut it in two. Plan: docs/research/drawing-tools/README.md */
export function cutArea() {
  return defineModule({
    id: 'shapes-cut',
    setup() {},
  })
}
