import { defineModule } from '@osm-editor-kit/maid-core'
import { device } from '@osm-editor-kit/maid-i18n'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { refusalText } from '../cut/texts.ts'
import { m } from '../messages.ts'
import { RoomIcon } from './icon.tsx'
import { ROOM_ID, roomMode } from './mode.ts'
import { RoomOnMap } from './RoomOnMap.tsx'
import { roomTargetOf } from './target.ts'

/**
 * A button of its own in the add row (Tobias, 2026-11-03), on while one building is selected: click a wall, click the
 * corners of the room, click a wall again, and the room is a new area `indoor=room` on the level being edited. It
 * shares its two wall nodes with the building, which keeps its shape. Shift turns the guide in 45 degree steps,
 * Shift+Alt in 10 degree steps. Proposal and decisions: docs/research/drawing-tools/8-draw-against-walls.md.
 */
export function drawRoom() {
  return defineModule({
    id: 'shapes-room',
    setup(api) {
      const { editor } = api
      const targetOf = (selected: readonly string[]) =>
        roomTargetOf(editor.history.staging.graph, selected)
      api.register('map.content', { id: 'shapes-room', component: RoomOnMap })
      api.register('draw.tool', {
        id: ROOM_ID,
        geometry: 'area',
        placement: 'button',
        label: () => m.room_label(),
        text: () => m.room_text(),
        description: () => m.room_description({ ...device() }),
        icon: RoomIcon,
        unavailable(selected) {
          const target = targetOf(selected)
          if ('select' in target) return m.room_select_building()
          if ('refused' in target) return `${m.room_label()}: ${refusalText(target.refused)}`
          return undefined
        },
        start(engine: MaidEngine, selected = []) {
          const target = targetOf(selected)
          if (!('wayId' in target)) return
          // a drawing or a move under way ends first; the building stays selected while its room is drawn
          engine.setMode('browse')
          engine.enterModuleMode(roomMode(editor, engine, target.wayId))
        },
      })
    },
  })
}
