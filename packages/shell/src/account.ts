import type { OsmAccount, PrefsEndpoint } from '@osm-editor-kit/maid-ui'
import type { Auth } from './auth'
import type { Config } from './config'

/**
 * The account that modules see (`useOsmAccount` in maid-ui): where the person's user preferences are. On the mock's
 * data they are the mock's, without a login, so nothing reaches OSM from a local or automated run. On real data they
 * are the preferences of the server the person is logged in to, and there are none while logged out.
 */
export function createAccount(auth: Auth, config: Pick<Config, 'source' | 'apiUrl'>): OsmAccount {
  let current: PrefsEndpoint | undefined

  function compute(): PrefsEndpoint | undefined {
    if (config.source === 'mock') return { server: 'mock', apiUrl: config.apiUrl }
    const user = auth.getState().user
    const authHeader = auth.authHeader()
    if (!user || !authHeader) return undefined
    return { server: auth.server, apiUrl: auth.apiUrl, authHeader, user }
  }

  /** The same object while nothing changed, as useSyncExternalStore needs */
  function prefsEndpoint() {
    const next = compute()
    const same =
      next?.server === current?.server &&
      next?.apiUrl === current?.apiUrl &&
      next?.authHeader === current?.authHeader &&
      next?.user === current?.user
    if (!same) current = next
    return current
  }

  return { prefsEndpoint, subscribe: (listener) => auth.subscribe(listener) }
}
