/**
 * What every text control of the editor gets: no browser autofill, and no button of a password
 * manager inside it (1Password, LastPass, Bitwarden, Dashlane). A tag value is never a login.
 * Spread it first, so a control can still set its own `autoComplete`.
 */
export const PLAIN_INPUT = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
} as const
