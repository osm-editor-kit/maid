import { setWorkerCount, setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 is ESM only and loads its worker from a URL. Let Vite bundle the worker.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { config } from './editor'
import './index.css'

setWorkerUrl(workerUrl)
// MapLibre uses one worker by default. Maid's four sources then queue up behind each other.
if (config.workers > 0) setWorkerCount(config.workers)

// No StrictMode: its double mount would create the map twice and distort timings.
createRoot(document.getElementById('root')!).render(<App />)
