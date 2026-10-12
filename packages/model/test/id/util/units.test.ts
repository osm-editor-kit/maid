// Adopted from iD test/spec/util/units.js (ISC, © iD contributors), at commit 0194f3926.
// Every test here is parked as a todo: Maid does not have the feature yet (see the F- ids).
import { describe, it } from 'bun:test'

describe('iD.units', () => {
    describe('dmsMatcher', () => {
        // needs F-util-3
        it.todo('parses D M SS format')
        it.todo('parses D M SS format, with negative value')
        it.todo('parses D MM format')
        it.todo('parses D MM format, with negative value')
        it.todo('parses z/x/y coordinate')
        it.todo('parses x/y coordinate')
        it.todo('parses coordinate with localized numbers')
        it.todo('handles invalid input')
    })
    describe('dmsCoordinatePair', () => {
        // needs F-util-3
        it.todo('formats coordinate pair')
        it.todo('formats 0°')
        it.todo('formats negative value')
        it.todo('formats 180° lng, should be E or W')
        it.todo('formats value over 90°lat or 180°lng')
    })
})
