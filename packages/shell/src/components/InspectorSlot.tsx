import { m } from '@osm-editor-kit/maid-i18n'
import { lazyComponent, Sidebar, SidebarEmpty } from '@osm-editor-kit/maid-ui'
import { useSelection } from '../selection'
import { usePresetsPending } from '../shell-context'

/**
 * The inspector itself (type picker, fields, tags sheet, operations, the sections of modules) is a chunk
 * of its own: nothing is selected when the page opens, so the first picture does not need it. The chunk is
 * loaded once the first view is drawn (`preloadLazyComponents`, see MapView), or at once when the URL
 * starts with a selection. The fallback has the label of the real sidebar, so its frame does not change.
 */
const inspectorFrame = (
  <Sidebar label="Selected feature">
    <div aria-busy="true" />
  </Sidebar>
)
const SelectedInspector = lazyComponent(
  () => import('./Inspector').then((module) => ({ default: module.Inspector })),
  inspectorFrame,
)

/** The sidebar: the empty hint while nothing is selected, else the inspector */
export function InspectorSlot() {
  const { ids } = useSelection()
  // the type, the fields and the type picker come from the presets, which are made after the first picture:
  // the same frame as while the chunk loads, until they are there
  const pending = usePresetsPending()
  if (ids.length === 0) {
    return (
      <Sidebar label="Inspector">
        <SidebarEmpty title={m.sidebar_empty_title()}>{m.sidebar_empty_hint()}</SidebarEmpty>
      </Sidebar>
    )
  }
  return pending ? inspectorFrame : <SelectedInspector />
}
