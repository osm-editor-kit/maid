import { describe, expect, test } from 'bun:test'
import { createAccount } from './account'
import type { Auth } from './auth'

/** An auth with a user and a token that a test sets */
function fakeAuth(server: 'osm' | 'dev') {
  const listeners = new Set<() => void>()
  const state: { user?: string; token?: string } = {}
  const auth = {
    server,
    apiUrl: `https://${server}.example`,
    getState: () => ({ user: state.user, busy: false }),
    authHeader: () => (state.token ? `Bearer ${state.token}` : undefined),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  } as unknown as Auth
  const login = (user: string, token: string) => {
    Object.assign(state, { user, token })
    for (const listener of listeners) listener()
  }
  return { auth, login }
}

describe('the account that modules see', () => {
  test("on the mock's data the preferences are the mock's, without a login", () => {
    const { auth } = fakeAuth('dev')
    const account = createAccount(auth, { source: 'mock', apiUrl: 'http://localhost:8090/s/small' })
    expect(account.prefsEndpoint()).toEqual({
      server: 'mock',
      apiUrl: 'http://localhost:8090/s/small',
    })
    expect(account.prefsEndpoint()).toBe(account.prefsEndpoint())
  })

  test('on real data there are none until a login, then those of the login server with its token', () => {
    const { auth, login } = fakeAuth('dev')
    const account = createAccount(auth, { source: 'dev', apiUrl: 'https://dev.example' })
    let calls = 0
    account.subscribe(() => calls++)
    expect(account.prefsEndpoint()).toBeUndefined()
    login('Tobias', 't0ken')
    expect(calls).toBe(1)
    expect(account.prefsEndpoint()).toEqual({
      server: 'dev',
      apiUrl: 'https://dev.example',
      authHeader: 'Bearer t0ken',
      user: 'Tobias',
    })
    expect(account.prefsEndpoint()).toBe(account.prefsEndpoint())
  })
})
