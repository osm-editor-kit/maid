import { createContext, useContext, useSyncExternalStore } from 'react'

/**
 * Where a module keeps small data of the person on their OpenStreetMap account: the user preferences of the server they
 * are logged in to (`/api/0.6/user/preferences`). On the mock's data it is the mock, which keeps them in memory without
 * a login, so automated runs and a person without an account can try a module offline (AGENTS.md, core rule 1).
 */
export type PrefsEndpoint = {
  /** `mock` while the data is the mock's; else the server the person is logged in to */
  server: 'mock' | 'osm' | 'dev'
  /** The API root, as for the map data: requests go to `<apiUrl>/api/0.6/user/preferences...` */
  apiUrl: string
  /** The `Authorization` header of the login; absent on the mock */
  authHeader?: string
  /** The display name of who is logged in; absent on the mock */
  user?: string
}

/** The person's account, as a module sees it. The shell provides it; it changes on login and logout. */
export type OsmAccount = {
  /** The endpoint now, or undefined when nobody is logged in (the same object until something changes) */
  prefsEndpoint: () => PrefsEndpoint | undefined
  subscribe: (listener: () => void) => () => void
}

const NONE: OsmAccount = { prefsEndpoint: () => undefined, subscribe: () => () => {} }

const OsmAccountContext = createContext<OsmAccount>(NONE)

/** Set by the shell around the editor; outside of it there is no account */
export const OsmAccountProvider = OsmAccountContext.Provider

/** The account of this editor, inside a component */
export function useOsmAccount(): OsmAccount {
  return useContext(OsmAccountContext)
}

/** Where the person's preferences are now, inside a component: re-renders on login and logout */
export function usePrefsEndpoint(): PrefsEndpoint | undefined {
  const account = useOsmAccount()
  return useSyncExternalStore(account.subscribe, account.prefsEndpoint)
}
