// Adopted from iD test/spec/core/history.js (ISC, © iD contributors), at commit 0194f3926.
// Most of iD's history tests are covered by test/edit/EditHistory.test.js (see docs/research/id-tests/core.md).
// The saved-history tests (toJSON, fromJSON) are covered by packages/journal (format n/a).
import { describe, expect, it } from 'bun:test'
import * as Rapid from '../../rapid.ts'
import { EditHistory } from '../../../src/edit/EditHistory.ts'
import { SpatialIndex } from '../../../src/spatial/SpatialIndex.ts'

describe('iD.coreHistory', () => {
  describe('#hasChanges', () => {
    it("is false when all of change's values are empty", () => {
      const context = new Rapid.MockContext()
      const history = new EditHistory(context, new SpatialIndex())
      expect(history.hasChanges()).toBe(false)
    })
  })

  describe('#perform', () => {
    // needs F-core-6
    it.todo('performs transitionable actions in a transition')
  })
})
