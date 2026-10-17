import { CommandBar } from '@osm-editor-kit/maid-ui'
import { useEditCommands } from '../commands'

/**
 * The edit menu in the sidebar: the same commands as on a right click, as icon buttons, joined
 * into one segment per group with space between the groups (see `CommandBar`). The tooltip of
 * each says what it does, its key, and why it cannot run now.
 */
export function Operations() {
  const commands = useEditCommands()
  if (commands.length === 0) return null
  return (
    // a toolbar row under the header: no headline, the icons speak for themselves. The space under
    // it sets it off from the sections below.
    <div className="pb-3">
      <CommandBar label="Edit" items={commands} />
    </div>
  )
}
