import { Brand, Shell, ThemeSwitch, TopBar } from '@osm-editor-kit/maid-ui'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { MapProvider } from 'react-map-gl/maplibre'
import { BottomDock } from './components/BottomDock'
import { Inspector } from './components/Inspector'
import { MapNotices } from './components/MapNotices'
import { MapView } from './components/MapView'
import { ModeButtons } from './components/ModeButtons'
import { UndoRedo } from './components/UndoRedo'
import { useShortcuts } from './components/useShortcuts'
import { ZoomControls } from './components/ZoomControls'
import { config } from './editor'

function Editor() {
  useShortcuts()
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
      dock={<BottomDock />}
    >
      <MapView />
      <MapNotices />
      <ZoomControls />
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
