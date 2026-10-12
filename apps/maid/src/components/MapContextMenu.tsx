import { ContextMenu } from '@osm-editor-kit/maid-ui'
import { useEditCommands, usePasteCommand } from '../commands'
import { engine } from '../editor'

/** Where a right click or a long press happened: on the screen and on the map */
export type MenuPlace = { x: number; y: number; lon: number; lat: number }

/**
 * The edit menu at the pointer, as iD opens it on a right click and on a long press: what can
 * be done with the selection, and "Paste" at this place if something was copied. Shows
 * nothing when there is nothing to choose.
 */
export function MapContextMenu({ place, onClose }: { place: MenuPlace; onClose: () => void }) {
  const items = [...useEditCommands(), ...usePasteCommand(place)]
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
