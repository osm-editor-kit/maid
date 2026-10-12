import { MapPinIcon, TrashIcon } from '@heroicons/react/20/solid'
import { ToolButton, ToolGroup } from '@osm-editor-kit/maid-ui'
import { engine, useEngine } from '../editor'
import { useSelectedId } from '../url/state'
import { MAC } from './UndoRedo'

/** Top bar: what a click on the map adds, and deleting the selection */
export function ModeButtons() {
  const mode = useEngine((e) => e.mode)
  const [selectedId, setSelectedId] = useSelectedId()
  return (
    <>
      <ToolGroup label="Add">
        <ToolButton
          label="Add a point: click the map to place it"
          shortcut="1"
          text="Point"
          icon={<MapPinIcon />}
          pressed={mode === 'add-point'}
          onClick={() => engine.setMode(mode === 'add-point' ? 'browse' : 'add-point')}
        />
      </ToolGroup>
      <ToolGroup label="Edit">
        <ToolButton
          label={selectedId ? 'Delete the selected feature' : 'Select a feature to delete it'}
          shortcut={selectedId ? (MAC ? '⌘⌫' : 'Ctrl+Backspace') : undefined}
          icon={<TrashIcon />}
          disabled={!selectedId}
          onClick={() => {
            if (selectedId && engine.deleteEntity(selectedId)) void setSelectedId(null)
          }}
        />
      </ToolGroup>
    </>
  )
}
