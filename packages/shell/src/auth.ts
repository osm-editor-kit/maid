import { isAutomated } from '@osm-editor-kit/maid-core'
import type { Server } from '@osm-editor-kit/maid-ui'
import { useSyncExternalStore } from 'react'
import { useShell } from './shell-context'
import { publicUrl } from './url/public-url'

/**
 * Login to OpenStreetMap, for a person: to the real OSM when the data is the real map's, else to the OSM
 * development server (AGENTS.md, core rule 1). OAuth 2 with PKCE through `osm-api`: Maid is a public client
 * and has no secret.
 *
 * Nothing here talks to a server until a person presses "Log in": `osm-api` is loaded on that
 * click, and the name shown after a reload comes from this browser's storage. Under automation
 * (`isAutomated()`) the login is switched off and the stored name is not read.
 */
/** What an app says about its login: the server, its OAuth client and where the popup returns */
export type AuthOptions = {
  /** The app's id: names the stored token and user (`<id>:osm-token:<server>`, `<id>:osm-user:<server>`) */
  id: string
  /** The app's folder and its env file, named in the message when there is no client id */
  envFile: string
  /** The server to log in to, and its API */
  server: Server
  apiUrl: string
  /** OAuth client id for that server; not a secret. Without one, nobody can log in. */
  clientId?: string
  /** The origin the OAuth app's redirect URI is registered for; the popup can only answer a tab on it */
  loginOrigin?: string
}

/** Where osm-api keeps the token after a login. One key for every server, so the token moves to a key per server. */
const OSM_API_TOKEN_KEY = '__osmAuth'

/** The variable that holds the client id, in the env file and as a repository variable */
const CLIENT_ID_VARIABLE = { osm: 'OSM_CLIENT_ID', dev: 'OSM_DEV_CLIENT_ID' } as const

export type AuthState = {
  /** Why nobody can log in here, if so */
  unavailable?: string
  /** The display name of who is logged in */
  user?: string
  busy: boolean
  error?: string
}

/** The login of one editor to one server: its state, and what happens on "Log in" and "Log out" */
export function createAuth({ id, envFile, server, apiUrl, clientId, loginOrigin }: AuthOptions) {
  const TOKEN_KEY = `${id}:osm-token:${server}`
  const USER_KEY = `${id}:osm-user:${server}`

  function unavailable() {
    if (isAutomated()) return 'Login is switched off in automated browsers.'
    if (!clientId) {
      const variable = CLIENT_ID_VARIABLE[server]
      return `No client id: set VITE_${variable} in ${envFile}, or the repository variable ${variable} for GitHub Pages.`
    }
    if (loginOrigin && window.location.origin !== loginOrigin) {
      return `Open this editor at ${loginOrigin} to log in.`
    }
    return undefined
  }

  function read(key: string) {
    try {
      return localStorage.getItem(key) ?? undefined
    } catch {
      return undefined
    }
  }

  /** Removes a key from this browser's storage. Blocked storage has nothing to remove, and the caller goes on. */
  function forget(key: string) {
    try {
      localStorage.removeItem(key)
    } catch {
      // blocked: nothing was stored under the key that could be removed
    }
  }

  function storedUser() {
    if (isAutomated() || !read(TOKEN_KEY)) return undefined
    return read(USER_KEY)
  }

  const holder: { state: AuthState } = {
    state: { unavailable: unavailable(), user: storedUser(), busy: false },
  }
  const listeners = new Set<() => void>()

  function set(next: Partial<AuthState>) {
    holder.state = { ...holder.state, ...next }
    for (const listener of listeners) listener()
  }

  /** The `osm-api` package, set up for this server and its token. For the code that saves. */
  async function api() {
    const OSM = await import('osm-api')
    const token = read(TOKEN_KEY)
    OSM.configure({ apiUrl, authHeader: token ? `Bearer ${token}` : undefined })
    return OSM
  }

  /** Opens the server's login in a popup. Only ever called from a click. */
  async function login() {
    if (holder.state.unavailable || holder.state.busy || !clientId) return
    set({ busy: true, error: undefined })
    try {
      const OSM = await api()
      const { accessToken } = await OSM.login({
        mode: 'popup',
        clientId,
        // the redirect the OAuth app is registered for: <origin><base>land.html (base: `/`, or `/<repo>/` on Pages).
        // Several apps deployed side by side share the land.html of the site's root (VITE_LOGIN_BASE, pages.yml):
        // one registered redirect for all of them, as land.html answers any tab of the origin.
        redirectUrl: publicUrl(
          'land.html',
          import.meta.env.VITE_LOGIN_BASE || import.meta.env.BASE_URL,
          loginOrigin ?? window.location.origin,
        ),
        scopes: ['read_prefs', 'write_api', 'write_notes'],
      })
      // the token belongs to this server only: osm-api's own key would hand it to the other server's requests
      localStorage.removeItem(OSM_API_TOKEN_KEY)
      localStorage.setItem(TOKEN_KEY, accessToken)
      const user = await (await api()).getUser('me')
      localStorage.setItem(USER_KEY, user.display_name)
      set({ user: user.display_name, busy: false })
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'The login did not finish.',
      })
    }
  }

  function logout() {
    forget(TOKEN_KEY)
    forget(USER_KEY)
    // the state is reset whether or not the storage could be cleaned
    set({ user: undefined, error: undefined })
  }

  return {
    server,
    api,
    login,
    logout,
    getState: () => holder.state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type Auth = ReturnType<typeof createAuth>

/** The login state of this editor, inside a component */
export function useAuth() {
  const { auth } = useShell()
  return useSyncExternalStore(auth.subscribe, auth.getState)
}
