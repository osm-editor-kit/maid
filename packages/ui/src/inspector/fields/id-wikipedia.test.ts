// Adopted from iD test/spec/ui/fields/wikipedia.js (ISC, © iD contributors), at commit 0194f3926.
//
// The pure rules of iD's wikipedia field are in wiki-logic.ts and tested here with iD's expectations. The
// rest needs the field on the screen (the language list, the title combo, the follow-up of the wikidata tag
// after a delay): those are todos until the field has a browser check of its own.
import { describe, expect, it } from 'bun:test'
import {
  articleFromUrl,
  encodeAnchor,
  encodeTitlePath,
  splitWikipediaTag,
  wikipediaValue,
} from './wiki-logic.ts'

describe('iD.uiFieldWikipedia', () => {
  it('recognizes lang:title format', () => {
    // iD: the tag 'en:Title' shows the language English and the title Title
    expect(splitWikipediaTag('en:Title')).toEqual({ lang: 'en', title: 'Title' })
    // the language name is the language list's (not ported: a todo below)
  })

  it('sets language, value', () => {
    // iD: changing the language to Deutsch with the title Title writes 'de:Title'
    expect(wikipediaValue('de', 'Title')).toBe('de:Title')
  })

  it('recognizes pasted URLs', () => {
    // iD: a pasted German article address shows the language and the title
    expect(articleFromUrl('https://de.wikipedia.org/wiki/Title')).toEqual({
      lang: 'de',
      title: 'Title',
    })
  })

  describe('encodePath', () => {
    it('returns an encoded URI component that contains the title with spaces replaced by underscores', () => {
      expect(encodeTitlePath('? (film)', undefined)).toBe('%3F_(film)')
    })

    it('returns an encoded URI component that includes an anchor fragment', () => {
      expect(encodeTitlePath('? (film)', 'Themes and style')).toBe('%3F_(film)#Themes_and_style')
    })
  })

  describe('encodeURIAnchorFragment', () => {
    it('returns an encoded URI anchor fragment', () => {
      expect(encodeAnchor('Theme?')).toBe('#Theme%3F')
    })

    it('replaces all whitespace characters with underscore', () => {
      // iD replaces the spaces (the test's name says whitespace; the code and its test say spaces)
      expect(encodeAnchor('Themes And Styles')).toBe('#Themes_And_Styles')
    })

    it('encodes % characters, does not replace them with a dot', () => {
      expect(encodeAnchor('Is%this_100% correct')).toBe('#Is%25this_100%25_correct')
    })

    it('encodes characters that are URI encoded characters', () => {
      expect(encodeAnchor('Section %20%25')).toBe('#Section_%2520%2525')
    })
  })

  // todo: 'preserves existing language' needs the field on the screen (the language input keeps its
  //       typed language when the tag is cleared; Maid's editor keeps lang in its state, not yet tested)
  it.todo('preserves existing language', () => {})

  // iD: it.skip. todo: 'does not set delayed wikidata tag if graph has changed' needs the editor (the feature
  //       changed during the lookup; Maid writes the follow-up through the change of the feature it was made on)
  it.todo('does not set delayed wikidata tag if graph has changed', () => {})
})
