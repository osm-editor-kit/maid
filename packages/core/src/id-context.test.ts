// Adopted from iD test/spec/core/context.js (ISC, © iD contributors), at commit 0194f3926.
// The asset path and asset map tests are n/a: Maid bundles its icons and images with Vite and reads them by import.
import { describe, it } from 'bun:test'

describe('iD.coreContext', () => {
  describe('#debug', () => {
    // needs F-core-7
    it.todo('sets and gets debug flags', () => {})
  })
})
