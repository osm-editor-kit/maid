import { setWorkerCount } from 'maplibre-gl'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { config } from './editor'

/**
 * The shell's entry. Load it with a dynamic `import()` after `setAppConfig`, never before: loading
 * it creates the editor from the app's config (see app-config.ts). One editor per page.
 */
export function mountEditor(rootElement: HTMLElement) {
  // MapLibre uses one worker by default. Maid's four sources then queue up behind each other.
  if (config.workers > 0) setWorkerCount(config.workers)

  // No StrictMode: its double mount would create the map twice and distort timings.
  const root = createRoot(rootElement)
  // Dev server only: the Tags sheet on its own, for tools/bench/tags-check.ts (see sheet-harness.tsx)
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('harness') === 'tags') {
    void import('./sheet-harness').then(({ TagHarness }) => root.render(<TagHarness />))
  } else if (
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get('harness') === 'fields'
  ) {
    // Dev server only: the fields of several features on their own (fields-harness.tsx)
    void import('./fields-harness').then(({ FieldsHarness }) => root.render(<FieldsHarness />))
  } else {
    root.render(<App />)
  }
}
