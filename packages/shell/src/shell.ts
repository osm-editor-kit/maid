import { createEditor, isLocalUrl, type EditorConfig } from '@osm-editor-kit/maid-core'
import { createFilterSet } from '@osm-editor-kit/maid-filters'
import type { Locale } from '@osm-editor-kit/maid-i18n'
import { connectLenses } from '@osm-editor-kit/maid-module-lenses'
import { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { getSettings } from '@osm-editor-kit/maid-ui'
import { createAuth } from './auth'
import { DEV_API, OSM_API, readConfig, type Config } from './config'
import { watchFavourites } from './favourites'
import { createShellJournal } from './journal'
import { migrateIdHash } from './url/id-url'
import { startShown } from './url/shown'

/** What an app says about itself. `mountEditor(root, app)` is the shell's one entry. */
export type AppConfig = {
  /**
   * Names what the app stores in the browser: the journal's database and the logged-in user
   * (`<id>:scene:small`, `<id>:osm-user:dev`). Default 'maid'. The packages' own stores (settings,
   * notes, lenses, ...) keep fixed names: two apps on one origin would share those.
   */
  id?: string
  /**
   * The language when the URL, the stored choice and the browser name none (before English). Not used under
   * automation, which is always English.
   */
  defaultLocale?: Locale
  /** The name and the line under it in the top bar. The name is also the changeset's `created_by` (with `version`) */
  brand?: { name: string; detail?: string }
  /**
   * The app's version, as in its package.json: `created_by` of every changeset is `<brand.name> <version>`,
   * e.g. `Maid Parking 0.1.0`. Each app passes its own; the value is checked when a changeset is uploaded.
   */
  version: string
  /** Login to OpenStreetMap and its development server. Without a client id, "Log in" explains what is missing. */
  osm?: {
    /** OAuth client ids on openstreetmap.org and on the development server; not secrets, read from the app's env file */
    clientId?: string
    devClientId?: string
    /** The origin the OAuth redirect is registered for, for example `http://127.0.0.1:5173` */
    loginOrigin?: string
    /** Named in the message when there is no client id; default `apps/<id>/.env.local` */
    envFile?: string
  }
  /** What the editor is made of: modules, presets, filters. Gets the settings read from the URL. */
  editor: (config: Config) => EditorConfig
  /**
   * Shows a custom background template from a `background=custom:` link, for this visit (the imagery module's
   * visitBackground). Says why a template is refused. Called once, after the shell is shown; not under automation.
   */
  visitBackground?: (template: string) => { ok: true } | { ok: false; reason: string }
}

/**
 * The parts of one running editor. The shell makes them in `createShell`, `mountEditor` puts them
 * in a context and components read them with `useShell()`. One editor per page: the packages'
 * stores are singletons.
 */
export type Shell = ReturnType<typeof createShell>

export function createShell(app: AppConfig) {
  const id = app.id ?? 'maid'

  // iD-style hash links become Maid query parameters before anything reads the URL
  migrateIdHash(window.location, window.history)

  const config = readConfig(window.location)

  /** The editor's data and modules. What this editor is comes from the app's config. */
  const editor = createEditor(app.editor(config))

  // The OSM API is a service of its own: its requests wait in the 'osm' gate, and a pause on it is its own.
  // A local API (the mock, on localhost) is not claimed: it stays with the 'local' gate, as hosts that no
  // service claims do, so the mock is never paused or limited as the real API is.
  const apiUrl = new URL(config.apiUrl)
  if (!isLocalUrl(apiUrl)) editor.services.register('osm', apiUrl.host)

  /** The filter states in the URL's notation, as the editor writes them: the same states are one value */
  const normalizeFilters = (param: string) => createFilterSet(editor.filters, param).toParam()

  /**
   * The filter states the session starts with: the URL's if it has any, else the person's stored
   * choice, else the editor's own. '' means every filter as the editor defines it. A value from the
   * URL is not written to storage (docs/adr/0009-decisions-of-2026-10-13.md).
   */
  const filtersStart = startShown(
    { url: config.filters, stored: getSettings().shown.filters, fallback: '' },
    normalizeFilters,
  )

  const engine = new MaidEngine({
    editor,
    apiUrl: config.apiUrl,
    minDataZoom: config.minDataZoom,
    filters: filtersStart.value,
    // the editor's fetch: gated per service, time-limited, paused on a rate limit
    fetch: editor.fetch,
  })

  // the lens the person chose restyles what the engine builds
  connectLenses(engine)
  watchFavourites(engine)

  return {
    id,
    brand: app.brand ?? { name: 'Maid', detail: 'MapLibre iD Editor' },
    version: app.version,
    config,
    editor,
    engine,
    visitBackground: app.visitBackground,
    normalizeFilters,
    filtersStart,
    auth: createAuth({
      id,
      envFile: app.osm?.envFile ?? `apps/${id}/.env.local`,
      server: config.loginServer,
      apiUrl: config.loginServer === 'osm' ? OSM_API : DEV_API,
      clientId:
        (config.loginServer === 'osm' ? app.osm?.clientId : app.osm?.devClientId) || undefined,
      // a deployed build logs in from the origin it is served from (its redirect is origin + base + land.html);
      // the app's loginOrigin pins local development to 127.0.0.1
      loginOrigin: config.liveBuild ? undefined : app.osm?.loginOrigin,
    }),
    journal: createShellJournal(id, config, editor),
  }
}
