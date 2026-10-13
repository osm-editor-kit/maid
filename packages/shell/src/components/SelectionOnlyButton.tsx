import { EyeIcon } from '@heroicons/react/20/solid'
import { ToolButton } from '@osm-editor-kit/maid-ui'
import { useEngine, useShell } from '../shell-context'

/**
 * The top bar's "show only the selection" switch. On, all of the OSM data is hidden at any zoom and only what is
 * selected is drawn (layers.ts, `selectionOnly`). A view option for this visit: it is neither stored nor in the URL.
 */
export function SelectionOnlyButton() {
  const { engine } = useShell()
  const on = useEngine((e) => e.selectionOnly)
  return (
    <ToolButton
      label="Show only the selection"
      pressed={on}
      icon={<EyeIcon />}
      onClick={() => engine.setSelectionOnly(!on)}
    />
  )
}
