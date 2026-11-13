// The inspector section of a route relation: the button that starts the route planner mode of the route, and the
// way to start it on a way of the route (the edit menu). While a reroute of this route is under way, its panel is over
// the map (ReroutePanel, put there by RerouteOnMap), and the section says so.
import { device } from '@osm-editor-kit/maid-i18n'
import type { InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import { m } from './messages.ts'
import { rerouteActions, useRerouteRelationId } from './reroute-store.ts'

const BUTTON =
  'rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800'
const HINT = 'text-sm text-zinc-600 dark:text-zinc-400'

export function RerouteSection({ entity }: InspectorSectionProps) {
  const relationId = useRerouteRelationId()
  if (relationId === entity.id) return <p className={HINT}>{m.reroute_section_running()}</p>
  return (
    <div className="flex flex-col gap-2">
      <p className={HINT}>{m.reroute_hint()}</p>
      <div>
        <button
          type="button"
          className={BUTTON}
          onClick={() => rerouteActions.beginRoute(entity.id, entity.id)}
        >
          {m.reroute_start()}
        </button>
      </div>
      <p className={HINT}>{m.reroute_section_or({ ...device() })}</p>
    </div>
  )
}
