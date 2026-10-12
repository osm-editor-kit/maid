// Adopted from iD test/spec/core/difference.js (ISC, © iD contributors), at commit 0194f3926.
// Most of iD's difference tests are covered by test/data/Difference.test.js (see docs/research/id-tests/core.md).
import { describe, it } from 'bun:test'

describe('iD.coreDifference', () => {
  describe('#summary', () => {
    // needs F-core-8: Maid reports the point as "deleted" (its base geometry is a point), iD as "modified"
    it.todo('reports a vertex as modified when it was previously a point')
  })

  describe('#extantIDs', () => {
    // needs F-core-4
    it.todo('includes the ids of created entities')
    // needs F-core-4
    it.todo('includes the ids of modified entities')
    // needs F-core-4
    it.todo('omits the ids of deleted entities')
    // needs F-core-4
    it.todo('omits the ids of members of modified relations by default')
    // needs F-core-4
    it.todo('includes the ids of members of modified relations with option')
  })
})
