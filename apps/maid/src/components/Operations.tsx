import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { SidebarSection } from '@osm-editor-kit/maid-ui'
import { editor, engine, useEngine } from '../editor'
import { useSelection } from '../selection'

/**
 * The edit menu: the operations that make sense for the selection, as buttons with their keys.
 * One that cannot run now is greyed out and says why in its tooltip.
 */
export function Operations() {
  const operations = useExtensionPoint(editor, 'edit.operation')
  const { select } = useSelection()
  // the version makes this read again after every edit: what applies depends on the data
  const offered = useEngine((e) => {
    const context = e.operationContext()
    return operations
      .filter((operation) => operation.applies(context))
      .map((operation) => ({ operation, reason: operation.disabled(context) }))
  })
  if (offered.length === 0) return null
  return (
    <SidebarSection title="Edit">
      <div className="flex flex-wrap gap-1.5">
        {offered.map(({ operation, reason }) => (
          <button
            key={operation.id}
            type="button"
            disabled={reason !== undefined}
            title={reason}
            onClick={() => {
              const next = engine.runOperation(operation)
              if (next) select(next)
            }}
            className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-white px-2 text-xs font-medium inset-ring-1 inset-ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-blue-500 enabled:hover:bg-zinc-50 disabled:cursor-default disabled:text-zinc-400 dark:bg-zinc-800 dark:inset-ring-white/10 dark:enabled:hover:bg-zinc-700 dark:disabled:text-zinc-500"
          >
            {operation.label}
            {operation.shortcut && (
              <kbd className="font-sans text-zinc-500 uppercase dark:text-zinc-400">
                {operation.shortcut}
              </kbd>
            )}
          </button>
        ))}
      </div>
    </SidebarSection>
  )
}
