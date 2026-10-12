import { Brand, Shell, ThemeSwitch, TopBar } from '@osm-editor-kit/maid-ui'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { useState } from 'react'
import { MapProvider } from 'react-map-gl/maplibre'
import { BottomDock } from './components/BottomDock'
import { Inspector } from './components/Inspector'
import { MapNotices } from './components/MapNotices'
import { MapView } from './components/MapView'
import { ModeButtons } from './components/ModeButtons'
import { RestorePrompt } from './components/RestorePrompt'
import { UndoRedo } from './components/UndoRedo'
import { useShortcuts } from './components/useShortcuts'
import { ZoomControls } from './components/ZoomControls'
import { config } from './editor'
import { useSelection } from './selection'

function Editor() {
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
          start={<Brand name="Maid" detail="MapLibre iD Editor" />}
          center={
            <div className="flex items-center gap-3">
              <ModeButtons />
              <UndoRedo />
            </div>
          }
          end={<ThemeSwitch />}
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
  return (
    <NuqsAdapter>
      <MapProvider>
        <Editor />
      </MapProvider>
    </NuqsAdapter>
  )
}
