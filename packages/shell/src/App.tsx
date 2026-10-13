import { Brand, Shell, Toaster, TopBar } from '@osm-editor-kit/maid-ui'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { useState } from 'react'
import { MapProvider } from 'react-map-gl/maplibre'
import { BottomDock } from './components/BottomDock'
import { FetchPauses } from './components/FetchPauses'
import { FilterButton } from './components/FilterButton'
import { Inspector } from './components/Inspector'
import { MapNotices } from './components/MapNotices'
import { MapView } from './components/MapView'
import { ModeButtons } from './components/ModeButtons'
import { RestorePrompt } from './components/RestorePrompt'
import { SaveButton } from './components/SaveButton'
import { TopBarPanels } from './components/TopBarPanels'
import { UndoRedo } from './components/UndoRedo'
import { UserButton } from './components/UserButton'
import { useShortcuts } from './components/useShortcuts'
import { ZoomControls } from './components/ZoomControls'
import { useSelection } from './selection'
import { useShell } from './shell-context'

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
              <TopBarPanels />
              <FilterButton />
              <SaveButton />
              <UserButton />
            </>
          }
        />
      }
      sidebar={<Inspector />}
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

export function App() {
  const { editor } = useShell()
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
