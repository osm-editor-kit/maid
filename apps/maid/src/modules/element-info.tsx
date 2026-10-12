import { defineModule, type MaidModule } from '@osm-editor-kit/maid-core'
import type { InspectorSection, InspectorSectionProps } from '@osm-editor-kit/maid-ui'

/** Version, changeset, user and timestamp of the selected entity, and whether it is edited. */
function ElementInfo({ entity, editor }: InspectorSectionProps) {
  const current = editor.history.staging.graph.hasEntity(entity.id)
  const original = editor.history.base.graph.hasEntity(entity.id)
  const props = current?.props ?? {}
  const rows: [label: string, value: string | number | undefined][] = [
    ['ID', entity.id],
    ['Version', props.version],
    ['Changeset', props.changeset],
    ['User', props.user],
    ['Timestamp', props.timestamp],
  ]
  const edited = current !== original
  return (
    <dl className="font-mono text-xs">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex gap-2 border-b border-zinc-950/5 py-1 last:border-0 dark:border-white/5"
        >
          <dt className="w-2/5 shrink-0 truncate text-zinc-500 dark:text-zinc-400">{label}</dt>
          <dd className="min-w-0 flex-1 truncate" title={String(value ?? '')}>
            {value ?? '—'}
          </dd>
        </div>
      ))}
      {edited && (
        <div className="flex gap-2 py-1">
          <dt className="w-2/5 shrink-0 text-zinc-500 dark:text-zinc-400">Status</dt>
          <dd className="min-w-0 flex-1 text-amber-700 dark:text-amber-400">
            edited, not uploaded
          </dd>
        </div>
      )}
    </dl>
  )
}

/** Adds an "Element" section to the inspector. */
export function elementInfo(): MaidModule {
  return defineModule({
    id: 'element-info',
    setup(api) {
      const section: InspectorSection = {
        id: 'element-info',
        title: 'Element',
        // id, version and so on are looked at now and then: folded away until asked for
        disclosure: 'closed',
        component: ElementInfo,
      }
      api.register('inspector.section', section)
    },
  })
}
