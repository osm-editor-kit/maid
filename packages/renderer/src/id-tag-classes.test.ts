// Adopted from iD test/spec/svg/tag_classes.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, it } from 'bun:test'

describe('iD.svgTagClasses (feature builder part)', () => {
  // needs F-svg-5: a closed way with a barrier is outlined as a line (build.ts areaFeature does
  // this), but its area fill is kept. iD gives it the `line` class only, so it has no fill.
  it.todo('stroke overrides: renders areas with barriers as lines', () => {})
})
