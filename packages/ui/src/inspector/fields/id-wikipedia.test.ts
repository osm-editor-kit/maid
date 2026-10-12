// Adopted from iD test/spec/ui/fields/wikipedia.js (ISC, © iD contributors), at commit 0194f3926.
//
// Maid has no wikipedia field: it is plain text on the key (FallbackField). The field needs the
// Wikipedia and Wikidata APIs, which automation may not call, so it waits for a decision (see
// docs/research/fields-vs-id.md, section 5). Every test is a todo until then; iD's one skipped test
// is a todo here too.
import { describe, it } from 'bun:test'

describe('iD.uiFieldWikipedia', () => {
  it.todo('recognizes lang:title format', () => {}) // needs F-ui-11

  it.todo('sets language, value', () => {}) // needs F-ui-11

  it.todo('recognizes pasted URLs', () => {}) // needs F-ui-11

  describe('encodePath', () => {
    it.todo('returns an encoded URI component that contains the title with spaces replaced by underscores', () => {}) // needs F-ui-11

    it.todo('returns an encoded URI component that includes an anchor fragment', () => {}) // needs F-ui-11
  })

  describe('encodeURIAnchorFragment', () => {
    it.todo('returns an encoded URI anchor fragment', () => {}) // needs F-ui-11

    it.todo('replaces all whitespace characters with underscore', () => {}) // needs F-ui-11

    it.todo('encodes % characters, does not replace them with a dot', () => {}) // needs F-ui-11

    it.todo('encodes characters that are URI encoded characters', () => {}) // needs F-ui-11
  })

  it.todo('preserves existing language', () => {}) // needs F-ui-11

  // iD: it.skip
  it.todo('does not set delayed wikidata tag if graph has changed', () => {}) // needs F-ui-11
})
