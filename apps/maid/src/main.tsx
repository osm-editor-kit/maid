import { setAppConfig } from '@osm-editor-kit/maid-shell'
import '@osm-editor-kit/maid-shell/styles.css'
import { initTheme } from '@osm-editor-kit/maid-ui'
import { setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 is ESM only and loads its worker from a URL. Let Vite bundle the worker.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { editorConfig } from './maid.config'

// before the first render, so the page does not flash in the wrong theme
initTheme()

setWorkerUrl(workerUrl)

// The shell creates its editor from this config when its entry is first imported, so the config is
// set first and the entry is loaded after (a bridge until the shell has createApp, see app-config.ts).
setAppConfig(editorConfig)
const { mountEditor } = await import('@osm-editor-kit/maid-shell/mount')
mountEditor(document.getElementById('root')!)
