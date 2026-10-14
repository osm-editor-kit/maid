import { isAutomated } from '@osm-editor-kit/maid-core'
import { Brand, notify, Shell, Toaster, TopBar } from '@osm-editor-kit/maid-ui'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { useEffect, useState } from 'react'
import { MapProvider } from 'react-map-gl/maplibre'
import { BottomDock } from './components/BottomDock'
import { FetchPauses } from './components/FetchPauses'
import { FilterButton } from './components/FilterButton'
import { InspectorSlot } from './components/InspectorSlot'
import { MapNotices } from './components/MapNotices'
import { MapView } from './components/MapView'
import { ModeButtons } from './components/ModeButtons'
import { RestorePrompt } from './components/RestorePrompt'
import { SaveButton } from './components/SaveButton'
import { SearchButton } from './components/SearchButton'
import { SelectionOnlyButton } from './components/SelectionOnlyButton'
import { TopBarPanels } from './components/TopBarPanels'
import { UndoRedo } from './components/UndoRedo'
import { UserButton } from './components/UserButton'
import { ZoomControls } from './components/ZoomControls'
import { useSelection } from './selection'
import { useShell } from './shell-context'
import { useShortcuts } from './useShortcuts'

function Editor() {
  const { brand, config } = useShell()
  useShortcuts()
  // On a phone the inspector is a sheet: it opens when something is selected and can be closed
  const { param } = useSelection()
  const [sheet, setSheet] = useState({ open: false, selection: param })
  if (sheet.selection !== param) setSheet({ open: Boolean(param), selection: param })
  // `ui=0` leaves only the map, for screenshots and measurements of the map alone
  if (!config.ui) {
    return (
      <Shell>
        <MapView />
      </Shell>
    )
  }
  return (
    <Shell
      topBar={
        <TopBar
          start={<Brand name={brand.name} detail={brand.detail} />}
          center={
            <div className="flex items-center gap-3">
              <ModeButtons />
              <UndoRedo />
            </div>
          }
          end={
            <>
              <SearchButton />
              <TopBarPanels />
              <SelectionOnlyButton />
              <FilterButton />
              <SaveButton />
              <UserButton />
            </>
          }
        />
      }
      sidebar={<InspectorSlot />}
      sheetOpen={sheet.open}
      onSheetOpenChange={(open) => setSheet({ open, selection: param })}
      dock={<BottomDock />}
    >
      <MapView />
      <MapNotices />
      <ZoomControls />
      <RestorePrompt />
    </Shell>
  )
}

/**
 * A `background=custom:` link: its template is shown for this visit, once, when the shell is up (so a refusal can
 * be a toast). Nothing is stored (ADR 0009). Under automation the imagery is off, so the link is not used.
 */
function useBackgroundLink() {
  const { config, visitBackground } = useShell()
  useEffect(() => {
    if (!config.background || !visitBackground || isAutomated()) return
    const result = visitBackground(config.background)
    if (!result.ok)
      notify.failed(result.reason, {
        id: 'background-link',
        fallback: 'The background link was not used',
      })
  }, [config, visitBackground])
}

export function App() {
  const { editor } = useShell()
  useBackgroundLink()
  return (
    <NuqsAdapter>
      <MapProvider>
        <Editor />
        <Toaster />
        <FetchPauses source={editor.fetchPauses} />
      </MapProvider>
    </NuqsAdapter>
  )
}
