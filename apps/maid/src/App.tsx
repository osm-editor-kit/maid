import { NuqsAdapter } from 'nuqs/adapters/react'
import { MapProvider } from 'react-map-gl/maplibre'
import { Inspector } from './components/Inspector'
import { MapView } from './components/MapView'
import { StatusBar } from './components/StatusBar'
import { ZoomControls } from './components/ZoomControls'
import { config } from './editor'

export function App() {
  return (
    <NuqsAdapter>
      <MapProvider>
        <main className="relative h-full">
          <MapView />
          {config.ui && (
            <>
              <Inspector />
              <ZoomControls />
              <StatusBar />
            </>
          )}
        </main>
      </MapProvider>
    </NuqsAdapter>
  )
}
