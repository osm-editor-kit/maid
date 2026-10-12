import { ContextMenu } from '@osm-editor-kit/maid-ui'
import { useEditCommands, usePasteCommand } from '../commands'
import { engine } from '../editor'

/**
 * Where a right click or a long press happened: on the screen and on the map. `ground` is set
 * when no feature was there: then the menu offers only what is not about the selection.
 */
export type MenuPlace = { x: number; y: number; lon: number; lat: number; ground?: boolean }

/**
 * The edit menu at the pointer, as iD opens it on a right click and on a long press: what can
 * be done with the selection, and "Paste" at this place if something was copied. On open ground
 * only "Paste". Shows nothing when there is nothing to choose.
 */
export function MapContextMenu({ place, onClose }: { place: MenuPlace; onClose: () => void }) {
  const selection = useEditCommands()
  const paste = usePasteCommand(place)
  // on open ground the selection is not what the menu is about: only Paste, as in iD's browse mode
  const items = place.ground ? paste : [...selection, ...paste]
  if (items.length === 0) return null
  return (
    <ContextMenu
      at={place}
      label="Edit"
      items={items}
      onClose={() => {
        // the menu goes without the pointer leaving its item
        engine.previewOperation(null)
        onClose()
      }}
    />
  )
}
