import { SidebarSection } from '@osm-editor-kit/maid-ui'
import { useEditCommands } from '../commands'

/**
 * The edit menu in the sidebar: what can be done with the selection, as buttons with their
 * keys. One that cannot run now is greyed out and says why in its tooltip.
 */
export function Operations() {
  const commands = useEditCommands()
  if (commands.length === 0) return null
  return (
    <SidebarSection title="Edit">
      <div className="flex flex-wrap gap-1.5">
        {commands.map((command) => (
          <button
            key={command.id}
            type="button"
            disabled={command.reason !== undefined}
            title={command.reason}
            onClick={command.run}
            className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-white px-2 text-xs font-medium inset-ring-1 inset-ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-blue-500 enabled:hover:bg-zinc-50 disabled:cursor-default disabled:text-zinc-400 dark:bg-zinc-800 dark:inset-ring-white/10 dark:enabled:hover:bg-zinc-700 dark:disabled:text-zinc-500"
          >
            {command.label}
            {command.shortcut && (
              <kbd className="font-sans text-zinc-500 dark:text-zinc-400">{command.shortcut}</kbd>
            )}
          </button>
        ))}
      </div>
    </SidebarSection>
  )
}
