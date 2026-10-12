import { defineModule, type Editor, type MaidModule } from '@osm-editor-kit/maid-core'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
// Type only. The `inspector.section` point is declared by the app that uses this module.
import type { InspectorSection } from '../extension-points'

/** Version, changeset, user and timestamp of the selected entity, and whether it is edited. */
function ElementInfo({ entity, editor }: { entity: EntityInfo; editor: Editor }) {
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
          className="flex gap-2 border-b border-neutral-200 py-1 last:border-0 dark:border-neutral-700"
        >
          <dt className="w-2/5 shrink-0 truncate text-neutral-600 dark:text-neutral-400">
            {label}
          </dt>
          <dd className="min-w-0 flex-1 truncate" title={String(value ?? '')}>
            {value ?? '—'}
          </dd>
        </div>
      ))}
      {edited && (
        <div className="flex gap-2 py-1">
          <dt className="w-2/5 shrink-0 text-neutral-600 dark:text-neutral-400">Status</dt>
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
        component: ElementInfo,
      }
      api.register('inspector.section', section)
    },
  })
}
