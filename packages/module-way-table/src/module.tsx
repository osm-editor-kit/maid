import { defineModule } from '@osm-editor-kit/maid-core'
import type { DockViewProps } from '@osm-editor-kit/maid-ui'
import { m } from './messages.ts'
import { createWayTableStore } from './way-table-store.ts'
import { WayTableView } from './WayTableView.tsx'

export type WayTableOptions = {
  /** Ways per side shown at first (default 3). "Show more" adds 3 at a time, up to 9. */
  readonly maxPerSide?: number
}

const DEFAULT_MAX_PER_SIDE = 3

/**
 * The way table: `dock.view` "Way table", a tab in the bottom dock. It shows the selected way's neighbours as columns
 * and its keys as rows, with the colour of each cell against the selected way (docs/research/way-table.md).
 * The dock renders only the open tab, so the table computes nothing while it is closed.
 *
 * The shell's dock gives a view its editor, selection and `readOnly` answer (the features a filter makes read-only). The
 * table writes nothing to a read-only feature: a plan that would change one is refused as a whole.
 */
export function wayTable(options: WayTableOptions = {}) {
  return defineModule({
    id: 'way-table',
    setup(api) {
      const store = createWayTableStore(options.maxPerSide ?? DEFAULT_MAX_PER_SIDE)
      function View(props: DockViewProps) {
        return <WayTableView {...props} store={store} />
      }
      api.register('dock.view', {
        id: 'way-table',
        get label() {
          return m.way_table_tab()
        },
        component: View,
      })
    },
  })
}
