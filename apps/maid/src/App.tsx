import { Brand, Shell, ThemeSwitch, TopBar } from '@osm-editor-kit/maid-ui'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { MapProvider } from 'react-map-gl/maplibre'
import { BottomDock } from './components/BottomDock'
import { Inspector } from './components/Inspector'
import { MapView } from './components/MapView'
import { ModeButtons } from './components/ModeButtons'
import { StatusLine } from './components/StatusLine'
import { UndoRedo } from './components/UndoRedo'
import { useShortcuts } from './components/useShortcuts'
import { ZoomControls } from './components/ZoomControls'
import { config, engine } from './editor'
import { useSelection } from './selection'

function Editor() {
  const { select } = useSelection()
  useShortcuts()
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return
    // Escape first leaves a mode (and drops a way that is being drawn), then the selection
    if (engine.mode !== 'browse') {
      engine.draw.cancel()
      engine.setMode('browse')
      return
    }
    select(null)
  }
  // `ui=0` leaves only the map, for screenshots and measurements of the map alone
  if (!config.ui) {
    return (
      <Shell onKeyDown={handleKeyDown}>
        <MapView />
      </Shell>
    )
  }
  return (
    <Shell
      onKeyDown={handleKeyDown}
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
      statusBar={<StatusLine />}
    >
      <MapView />
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
