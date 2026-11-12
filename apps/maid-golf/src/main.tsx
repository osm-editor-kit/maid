import { mountEditor } from '@osm-editor-kit/maid-shell'
import '@osm-editor-kit/maid-shell/styles.css'
import { setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 is ESM only and loads its worker from a URL. Let Vite bundle the worker.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { app } from './maid.config'

setWorkerUrl(workerUrl)

mountEditor(document.getElementById('root')!, app)
