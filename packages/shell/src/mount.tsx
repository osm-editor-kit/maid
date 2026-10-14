import { isAutomated } from '@osm-editor-kit/maid-core'
import { chooseLocale, setLocale, type Locale } from '@osm-editor-kit/maid-i18n'
import { getSettings } from '@osm-editor-kit/maid-ui'
import { QueryClientProvider } from '@tanstack/react-query'
import { setWorkerCount } from 'maplibre-gl'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { createShell, type AppConfig } from './shell'
import { ShellContext } from './shell-context'

/**
 * The language of this visit (ADR 0009, decision 4): the URL, the stored choice, the browser, the app's `defaultLocale`, English.
 * Under automation it is always English, so that the browser checks keep their texts.
 */
function visitLocale(fallback?: Locale): Locale {
  if (isAutomated()) return 'en'
  return chooseLocale({
    url: location.href,
    stored: getSettings().lang,
    browser: navigator.languages,
    fallback,
  })
}

/**
 * The shell's entry: makes the editor from the app's config and renders it into `rootElement`.
 * One editor per page (the packages' stores are singletons). Returns a function that unmounts it.
 */
export function mountEditor(rootElement: HTMLElement, app: AppConfig) {
  // before anything is drawn: every text is read when it renders
  const locale = visitLocale(app.defaultLocale)
  setLocale(locale)
  document.documentElement.lang = locale

  const shell = createShell(app)

  // MapLibre uses one worker by default. Maid's four sources then queue up behind each other.
  if (shell.config.workers > 0) setWorkerCount(shell.config.workers)

  // No StrictMode: its double mount would create the map twice and distort timings.
  const root = createRoot(rootElement)
  // The editor's query client serves every panel of the shell: a panel's fetch is a query on it (fetching-audit.md)
  const show = (content: React.ReactNode) =>
    root.render(
      <ShellContext value={shell}>
        <QueryClientProvider client={shell.editor.queries}>{content}</QueryClientProvider>
      </ShellContext>,
    )
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
