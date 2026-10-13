import { initTheme } from '@osm-editor-kit/maid-ui'
import { setWorkerCount, setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 is ESM only and loads its worker from a URL. Let Vite bundle the worker.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { config } from './editor'
import './index.css'

// before the first render, so the page does not flash in the wrong theme
initTheme()

setWorkerUrl(workerUrl)
// MapLibre uses one worker by default. Maid's four sources then queue up behind each other.
if (config.workers > 0) setWorkerCount(config.workers)

// No StrictMode: its double mount would create the map twice and distort timings.
const root = createRoot(document.getElementById('root')!)
// Dev server only: the Tags sheet on its own, for tools/bench/tags-check.ts (see sheet-harness.tsx)
if (import.meta.env.DEV && new URLSearchParams(location.search).get('harness') === 'tags') {
  void import('./sheet-harness').then(({ TagHarness }) => root.render(<TagHarness />))
} else {
  root.render(<App />)
}
