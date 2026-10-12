// Adopted from iD test/spec/core/graph.js (ISC, © iD contributors), at commit 0194f3926.
// Most of iD's graph tests are covered by test/lib/Graph.test.js (see docs/research/id-tests/core.md).
// This file holds the one that Maid lacks.
import { describe, it } from 'bun:test'

describe('iD.coreGraph', () => {
  describe('#rebase', () => {
    // needs F-core-5
    it.todo('invalidates transients')
  })
})
