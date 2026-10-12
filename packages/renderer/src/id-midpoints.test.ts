// Adopted from iD test/spec/svg/midpoints.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, it } from 'bun:test'

describe('iD.svgMidpoints', () => {
  // needs F-svg-2: midpoint handles on the selected way, to add a node between two nodes
  it.todo('creates midpoint on segment completely within the extent', () => {})
  it.todo("doesn't create midpoint on segment with pixel length less than 40", () => {})
  it.todo("doesn't create midpoint on segment completely outside of the extent", () => {})
  it.todo('creates midpoint on extent edge for segment partially outside of the extent', () => {})
  it.todo("doesn't create midpoint on extent edge for segment with pixel length less than 20", () => {})
})
