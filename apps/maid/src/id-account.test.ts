// Adopted from iD test/spec/ui/account.js (ISC, © iD contributors), at commit 0194f3926.
//
// Maid shows the display name as React text (UserButton.tsx: `{auth.user}`), so no markup is built
// from it. There is no pure function to call, so the check is a component check, not a unit test.
import { describe, it } from 'bun:test'

describe('iD.uiAccount', () => {
  it.todo('properly escapes user name', () => {}) // needs F-ui-19
})
