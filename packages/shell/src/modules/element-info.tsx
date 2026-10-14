import { defineModule } from '@osm-editor-kit/maid-core'
import { Time, type InspectorSection, type InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import type { ReactNode } from 'react'

/** Version, changeset, user and timestamp of the selected entity, and whether it is edited. */
function ElementInfo({ entity, editor }: InspectorSectionProps) {
  const current = editor.history.staging.graph.hasEntity(entity.id)
  const original = editor.history.base.graph.hasEntity(entity.id)
  const props = current?.props ?? {}
  // the shown form may differ from the value: a time is a `<Time>`, whose tooltip gives the other form,
  // so such a row gets no native title (a title would show the raw ISO string on top of it)
  type Row = [label: string, value: string | number | undefined, shown?: ReactNode]
  const size: Row[] =
    entity.type === 'way'
      ? [['Nodes', entity.size]]
      : entity.type === 'relation'
        ? [['Members', entity.size]]
        : []
  const rows: Row[] = [
    ['ID', entity.id],
    ...size,
    ['Version', props.version],
    ['Changeset', props.changeset],
    ['User', props.user],
    ['Timestamp', props.timestamp, <Time key="timestamp" value={props.timestamp} />],
  ]
  const edited = current !== original
  return (
    <dl className="font-mono text-xs">
      {rows.map(([label, value, shown]) => (
        <div
          key={label}
          className="flex gap-2 border-b border-zinc-950/5 py-1 last:border-0 dark:border-white/5"
        >
          <dt className="w-2/5 shrink-0 truncate text-zinc-500 dark:text-zinc-400">{label}</dt>
          <dd className="min-w-0 flex-1 truncate" title={shown ? undefined : String(value ?? '')}>
            {shown ?? value ?? '—'}
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
export function elementInfo() {
  return defineModule({
    id: 'element-info',
    setup(api) {
      const section: InspectorSection = {
        id: 'element-info',
        title: 'Element',
        // id, version and so on are looked at now and then: folded away until asked for
        disclosure: 'closed',
        detail: (entity) => entity.id,
        component: ElementInfo,
      }
      api.register('inspector.section', section)
    },
  })
}
