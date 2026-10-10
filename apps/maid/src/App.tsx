import { NuqsAdapter } from 'nuqs/adapters/react'
import { MapProvider } from 'react-map-gl/maplibre'
import { Inspector } from './components/Inspector'
import { MapView } from './components/MapView'
import { StatusBar } from './components/StatusBar'
import { ZoomControls } from './components/ZoomControls'
import { config, engine } from './editor'
import { useSelectedId } from './url'

function Shell() {
  const [, setSelectedId] = useSelectedId()
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return
    engine.setSelected(null)
    void setSelectedId(null)
  }
  return (
    <main className="relative h-full" onKeyDown={handleKeyDown}>
      <MapView />
      {config.ui && (
        <>
          <Inspector />
          <ZoomControls />
          <StatusBar />
        </>
      )}
    </main>
  )
}

export function App() {
  return (
    <NuqsAdapter>
      <MapProvider>
        <Shell />
      </MapProvider>
    </NuqsAdapter>
  )
}
