import { setWorkerCount } from 'maplibre-gl'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { createShell, type AppConfig } from './shell'
import { ShellContext } from './shell-context'

/**
 * The shell's entry: makes the editor from the app's config and renders it into `rootElement`.
 * One editor per page (the packages' stores are singletons). Returns a function that unmounts it.
 */
export function mountEditor(rootElement: HTMLElement, app: AppConfig) {
  const shell = createShell(app)

  // MapLibre uses one worker by default. Maid's four sources then queue up behind each other.
  if (shell.config.workers > 0) setWorkerCount(shell.config.workers)

  // No StrictMode: its double mount would create the map twice and distort timings.
  const root = createRoot(rootElement)
  const show = (content: React.ReactNode) =>
    root.render(<ShellContext value={shell}>{content}</ShellContext>)
  const harness = import.meta.env.DEV ? new URLSearchParams(location.search).get('harness') : null
  // Dev server only: the Tags sheet on its own, for tools/bench/tags-check.ts (see sheet-harness.tsx)
  if (harness === 'tags') {
    void import('./sheet-harness').then(({ TagHarness }) => show(<TagHarness />))
  } else if (harness === 'fields') {
    // Dev server only: the fields of several features on their own (fields-harness.tsx)
    void import('./fields-harness').then(({ FieldsHarness }) => show(<FieldsHarness />))
  } else {
    show(<App />)
  }
  return () => root.unmount()
}
