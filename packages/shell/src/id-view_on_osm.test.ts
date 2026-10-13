// Adopted from iD test/spec/ui/view_on_osm.js (ISC, © iD contributors), at commit 0194f3926.
//
// iD's inspector has a "View on openstreetmap.org" link that shows the last modification of a
// feature, found by walking its relations and ways. Maid's notes module has such a link; the
// inspector has none, and no function finds the last modified child.
import { describe, it } from 'bun:test'

describe('iD.uiViewOnOSM.findLastModifiedChild', () => {
  it.todo('can recurse through relations and ways', () => {}) // needs F-ui-15
})
