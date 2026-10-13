import { ContextMenu } from '@osm-editor-kit/maid-ui'
import { useEditCommands, usePasteCommand } from '../commands'
import { useSelection } from '../selection'
import { useEngine, useShell } from '../shell-context'
import { dropStack } from '../stack'
import { featureItems, STACK_CHIP_CLASS, StackCount } from './StackPicker'

/**
 * Where a right click or a long press happened: on the screen and on the map. `ground` is set
 * when no feature was there: then the menu offers only what is not about the selection. `features`
 * are all the features at that place when there are several: the menu lists them first.
 */
export type MenuPlace = {
  x: number
  y: number
  lon: number
  lat: number
  ground?: boolean
  features?: string[]
}

/**
 * The edit menu at the pointer, as iD opens it on a right click and on a long press: first the
 * features at the place when there are several ("Here: N features", the selected one marked),
 * then what can be done with the selection, and "Paste" at this place if something was copied.
 * On open ground only "Paste". Shows nothing when there is nothing to choose.
 *
 * With several features the count ("2 of 3") is the menu's marker, a chip that moves and flips
 * with the menu. The stack ends with the menu: closing it, by Escape, a press outside or a
 * choice that closes it, drops the stack and so the pill too.
 */
export function MapContextMenu({ place, onClose }: { place: MenuPlace; onClose: () => void }) {
  const { engine } = useShell()
  const { ids: selected, select } = useSelection()
  const selection = useEditCommands()
  const paste = usePasteCommand(place)
  const features = place.features ?? []
  // choosing one selects it and the menu stays open on what it is about now
  const here = useEngine(() =>
    features.length > 1
      ? featureItems(
          engine,
          features,
          (id) => selected.includes(id),
          (id) => select(id),
          `Here: ${features.length} features`,
        )
      : [],
  )
  // on open ground the selection is not what the menu is about: only Paste, as in iD's browse mode
  const items = place.ground ? paste : [...here, ...selection, ...paste]
  if (items.length === 0) return null
  const marker =
    features.length > 1 ? (
      <span data-stack-marker className={STACK_CHIP_CLASS}>
        <StackCount index={features.indexOf(selected[0] ?? '')} total={features.length} />
      </span>
    ) : undefined
  return (
    <ContextMenu
      at={place}
      label="Edit"
      items={items}
      marker={marker}
      onClose={() => {
        // the menu goes without the pointer leaving its item
        engine.previewOperation(null)
        engine.setRelated(null)
        dropStack()
        onClose()
      }}
    />
  )
}
