import { m } from '@osm-editor-kit/maid-i18n'
import { lazyComponent, Sidebar, SidebarEmpty } from '@osm-editor-kit/maid-ui'
import { useSelection } from '../selection'

/**
 * The inspector itself (type picker, fields, tags sheet, operations, the sections of modules) is a chunk
 * of its own: nothing is selected when the page opens, so the first picture does not need it. The chunk is
 * loaded once the first view is drawn (`preloadLazyComponents`, see MapView), or at once when the URL
 * starts with a selection. The fallback has the label of the real sidebar, so its frame does not change.
 */
const SelectedInspector = lazyComponent(
  () => import('./Inspector').then((module) => ({ default: module.Inspector })),
  <Sidebar label="Selected feature">
    <div aria-busy="true" />
  </Sidebar>,
)

/** The sidebar: the empty hint while nothing is selected, else the inspector */
export function InspectorSlot() {
  const { ids } = useSelection()
  if (ids.length === 0) {
    return (
      <Sidebar label="Inspector">
        <SidebarEmpty title={m.sidebar_empty_title()}>{m.sidebar_empty_hint()}</SidebarEmpty>
      </Sidebar>
    )
  }
  return <SelectedInspector />
}
