import { defineModule } from '@osm-editor-kit/maid-core'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { m } from '../messages.ts'
import { RectangleIcon } from './icon.tsx'
import { RECTANGLE_ID, rectangleMode } from './mode.ts'
import { RectangleOnMap } from './RectangleOnMap.tsx'

/**
 * Area dropdown and key 33 (3, then 3 again): three clicks draw a rectangle. Click 1 and 2 set one wall, the pointer's distance from it
 * gives the depth and click 3 commits (one undo step). The way is handed to the shell as a new one, so its type is asked.
 * Plan: docs/research/drawing-tools/2-three-click-rectangle.md; hooks: docs/adr/0011-drawing-tool-hooks.md.
 */
export function rectangle() {
  return defineModule({
    id: 'shapes-rectangle',
    setup(api) {
      const { editor } = api
      api.register('map.content', { id: 'shapes-rectangle', component: RectangleOnMap })
      api.register('draw.tool', {
        id: RECTANGLE_ID,
        geometry: 'area',
        label: () => m.rectangle_label(),
        icon: RectangleIcon,
        start(engine: MaidEngine) {
          // a drawing or a move under way ends first, and the editor's own mode is browse while the rectangle is drawn
          engine.setMode('browse')
          engine.enterModuleMode(rectangleMode(editor, engine))
        },
      })
    },
  })
}
