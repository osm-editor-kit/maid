import { Brand, Shell, ThemeSwitch, TopBar } from '@osm-editor-kit/maid-ui'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { MapProvider } from 'react-map-gl/maplibre'
import { BottomDock } from './components/BottomDock'
import { Inspector } from './components/Inspector'
import { MapView } from './components/MapView'
import { StatusLine } from './components/StatusLine'
import { UndoRedo } from './components/UndoRedo'
import { ZoomControls } from './components/ZoomControls'
import { config, engine } from './editor'
import { useSelectedId } from './url/state'

function Editor() {
  const [, setSelectedId] = useSelectedId()
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return
    engine.setSelected(null)
    void setSelectedId(null)
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
          center={<UndoRedo />}
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
