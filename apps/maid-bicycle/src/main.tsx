import { mountEditor } from '@osm-editor-kit/maid-shell'
import '@osm-editor-kit/maid-shell/styles.css'
import { initTheme } from '@osm-editor-kit/maid-ui'
import { setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 is ESM only and loads its worker from a URL. Let Vite bundle the worker.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { app } from './maid.config'

// before the first render, so the page does not flash in the wrong theme
initTheme()

setWorkerUrl(workerUrl)

mountEditor(document.getElementById('root')!, app)
