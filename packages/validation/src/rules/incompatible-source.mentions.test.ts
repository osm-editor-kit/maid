import { describe, expect, it } from 'bun:test'
import { incompatibleSourceMentions } from './incompatible-source.ts'

describe('incompatibleSourceMentions (iD getIncompatibleSources, for a changeset comment or source)', () => {
  it('finds nothing in an empty, absent or harmless text', () => {
    expect(incompatibleSourceMentions(undefined)).toEqual([])
    expect(incompatibleSourceMentions('')).toEqual([])
    expect(incompatibleSourceMentions('survey;aerial imagery')).toEqual([])
  })

  it('names the product and the words that matched', () => {
    const [mention, ...rest] = incompatibleSourceMentions('Added shops, seen on Google Maps')
    expect(rest).toEqual([])
    expect(mention).toMatchObject({ product: 'google', value: 'Google' })
    expect(mention?.reference).toContain('Google')
  })

  it('finds each product once, in the order of the rules', () => {
    const found = incompatibleSourceMentions('baidu and google and google')
    expect(found.map((mention) => mention.product)).toEqual(['baidu', 'google'])
  })

  it('leaves the sources that only look like a product alone', () => {
    expect(incompatibleSourceMentions('google books')).toEqual([])
    expect(incompatibleSourceMentions('esri/Google_Open_Buildings')).toEqual([])
    expect(incompatibleSourceMentions('高德大道')).toEqual([])
  })

  it('finds the short link of Google and the Chinese name of Baidu', () => {
    expect(incompatibleSourceMentions('https://goo.gl/maps/x').map((m) => m.product)).toEqual([
      'google',
    ])
    expect(incompatibleSourceMentions('百度').map((m) => m.product)).toEqual(['baidu'])
  })
})
