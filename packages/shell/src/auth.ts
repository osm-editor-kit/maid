import { isAutomated } from '@osm-editor-kit/maid-core'
import { useSyncExternalStore } from 'react'
import { DEV_API } from './config'
import { useShell } from './shell-context'
import { publicUrl } from './url/public-url'

/**
 * Login to OpenStreetMap, for a person, against the OSM development server only (AGENTS.md,
 * core rule 1). OAuth 2 with PKCE through `osm-api`: Maid is a public client and has no secret.
 *
 * Nothing here talks to a server until a person presses "Log in": `osm-api` is loaded on that
 * click, and the name shown after a reload comes from this browser's storage. Under automation
 * (`isAutomated()`) the login is switched off and the stored name is not read.
 */
/** What an app says about its login: the OAuth client of the development server and where the popup returns */
export type AuthOptions = {
  /** The app's id: names the stored user (`<id>:osm-dev-user`) */
  id: string
  /** The app's folder and its env file, named in the message when there is no client id */
  envFile: string
  /** OAuth client id for the development server; not a secret. Without one, nobody can log in. */
  clientId?: string
  /** The origin the OAuth app's redirect URI is registered for; the popup can only answer a tab on it */
  loginOrigin?: string
}

/** Where osm-api keeps the token */
const TOKEN_KEY = '__osmAuth'

export type AuthState = {
  /** Why nobody can log in here, if so */
  unavailable?: string
  /** The display name of who is logged in */
  user?: string
  busy: boolean
  error?: string
}

/** The login of one editor: its state, and what happens on "Log in" and "Log out" */
export function createAuth({ id, envFile, clientId, loginOrigin }: AuthOptions) {
  const USER_KEY = `${id}:osm-dev-user`

  function unavailable() {
    if (isAutomated()) return 'Login is switched off in automated browsers.'
    if (!clientId)
      return `No client id: set VITE_OSM_DEV_CLIENT_ID in ${envFile}, or the repository variable OSM_DEV_CLIENT_ID for GitHub Pages.`
    if (loginOrigin && window.location.origin !== loginOrigin) {
      return `Open this editor at ${loginOrigin} to log in.`
    }
    return undefined
  }

  function storedUser() {
    if (isAutomated()) return undefined
    try {
      if (!localStorage.getItem(TOKEN_KEY)) return undefined
      return localStorage.getItem(USER_KEY) ?? undefined
    } catch {
      return undefined
    }
  }

  const holder: { state: AuthState } = {
    state: { unavailable: unavailable(), user: storedUser(), busy: false },
  }
  const listeners = new Set<() => void>()

  function set(next: Partial<AuthState>) {
    holder.state = { ...holder.state, ...next }
    for (const listener of listeners) listener()
  }

  /** The `osm-api` package, set up for the development server. For the code that saves. */
  async function api() {
    const OSM = await import('osm-api')
    OSM.configure({ apiUrl: DEV_API })
    return OSM
  }

  /** Opens the development server's login in a popup. Only ever called from a click. */
  async function login() {
    if (holder.state.unavailable || holder.state.busy || !clientId) return
    set({ busy: true, error: undefined })
    try {
      const OSM = await api()
      await OSM.login({
        mode: 'popup',
        clientId,
        // the redirect the OAuth app is registered for: <origin><base>land.html (base: `/`, or `/<repo>/` on Pages)
        redirectUrl: publicUrl(
          'land.html',
          import.meta.env.BASE_URL,
          loginOrigin ?? window.location.origin,
        ),
        scopes: ['read_prefs', 'write_api', 'write_notes'],
      })
      const user = await OSM.getUser('me')
      localStorage.setItem(USER_KEY, user.display_name)
      set({ user: user.display_name, busy: false })
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'The login did not finish.',
      })
    }
  }

  async function logout() {
    const OSM = await api()
    OSM.logout()
    localStorage.removeItem(USER_KEY)
    set({ user: undefined, error: undefined })
  }

  return {
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
