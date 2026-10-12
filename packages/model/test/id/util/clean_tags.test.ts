// Adopted from iD test/spec/util/clean_tags.js (ISC, © iD contributors), at commit 0194f3926.
// Every test here is parked as a todo: Maid does not have the feature yet (see the F- ids).
import { describe, it } from 'bun:test'

describe('iD.utilCleanTags', () => {
    // needs F-util-2: tag cleaning before upload (in @rapid-sdk/util, not called by Maid's save path)
    // 'trims whitespace' is adopted in packages/ui/src/inspector/id-util.test.ts
    it.todo('handles empty tags object')
    it.todo('discards empty keys')
    it.todo('discards undefined values')
    it.todo('trims semicolon delimited whitespace')
    it.todo('does not clean description, note, fixme')
    it.todo('uses semicolon-space delimiting for opening_hours, conditional: tags')
})
