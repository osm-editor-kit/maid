import { isAutomated } from '@osm-editor-kit/maid-core'
import { useSyncExternalStore } from 'react'
import { DEV_API } from './config'

/**
 * Login to OpenStreetMap, for a person, against the OSM development server only (AGENTS.md,
 * core rule 1). OAuth 2 with PKCE through `osm-api`: Maid is a public client and has no secret.
 *
 * Nothing here talks to a server until a person presses "Log in": `osm-api` is loaded on that
 * click, and the name shown after a reload comes from this browser's storage. Under automation
 * (`isAutomated()`) the login is switched off and the stored name is not read.
 */
const CLIENT_ID: string | undefined = import.meta.env.VITE_OSM_DEV_CLIENT_ID || undefined
/** The origin the OAuth app's redirect URI is registered for; the popup can only answer a tab on it */
const LOGIN_ORIGIN = 'http://127.0.0.1:5173'
const USER_KEY = 'maid:osm-dev-user'
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

function unavailable(): string | undefined {
  if (isAutomated()) return 'Login is switched off in automated browsers.'
  if (!CLIENT_ID) return 'No client id: set VITE_OSM_DEV_CLIENT_ID in apps/maid/.env.local.'
  if (window.location.origin !== LOGIN_ORIGIN) return `Open Maid at ${LOGIN_ORIGIN} to log in.`
  return undefined
}

function storedUser(): string | undefined {
  if (isAutomated()) return undefined
  try {
    if (!localStorage.getItem(TOKEN_KEY)) return undefined
    return localStorage.getItem(USER_KEY) ?? undefined
  } catch {
    return undefined
  }
}

let state: AuthState = { unavailable: unavailable(), user: storedUser(), busy: false }
const listeners = new Set<() => void>()

function set(next: Partial<AuthState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

/** The `osm-api` package, set up for the development server. For the code that saves. */
export async function api() {
  const OSM = await import('osm-api')
  OSM.configure({ apiUrl: DEV_API })
  return OSM
}

/** Opens the development server's login in a popup. Only ever called from a click. */
export async function login() {
  if (state.unavailable || state.busy || !CLIENT_ID) return
  set({ busy: true, error: undefined })
  try {
    const OSM = await api()
    await OSM.login({
      mode: 'popup',
      clientId: CLIENT_ID,
      redirectUrl: `${LOGIN_ORIGIN}/land.html`,
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

export async function logout() {
  const OSM = await api()
  OSM.logout()
  localStorage.removeItem(USER_KEY)
  set({ user: undefined, error: undefined })
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}
