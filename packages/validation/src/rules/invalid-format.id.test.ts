// Adopted from iD test/spec/validations/invalid_format.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { Graph } from '@osm-editor-kit/maid-model'
import type { Action } from '@osm-editor-kit/maid-model'
import { dataOf, graphOf, node, validateChanged } from '../id-test-helpers.ts'
import type { Fix, Issue } from '../types.ts'
import { invalidFormat } from './invalid-format.ts'

// Maid's Issue has no `type` or `subtype`: the rule is `issue.rule`, and iD's subtype is the
// message ("in website", "in image", "email address"). iD's dynamicFixes are Maid's `fixes`.
// iD's `context` is the graph: a fix is applied with its actions, as the editor does.

/** iD's createPointWithTags: one point at (4, 4), with these tags (undefined values stay as iD keeps them) */
function pointWith(tags: Record<string, string | undefined>) {
  return graphOf(node('n-1', 4, 4, tags as Record<string, string>))
}

function validate(graph: Graph): Issue[] {
  return validateChanged(invalidFormat, graph, ['n-1'])
}

/** Applies the actions of a fix as the editor does, on a head copy of the graph */
function applyFix(graph: Graph, fix: Fix | undefined): Graph {
  if (!fix) throw new Error('no fix')
  const actions: Action[] = fix.actions(new Graph(graph))
  return actions.reduce<Graph>((head, action) => action(head), new Graph(graph))
}

function tagsOf(graph: Graph): Record<string, string | undefined> {
  return graph.hasEntity('n-1')?.tags ?? {}
}

describe('iD.validations.invalid_format', () => {
  describe('URL validation', () => {
    it('should not flag valid URLs', () => {
      const issues = validate(
        pointWith({
          website: 'https://example.com',
          'contact:website': 'http://test.org',
          url: 'https://www.valid-site.net/path?query=1',
        }),
      )
      expect(issues).toHaveLength(0)
    })

    it('should flag URLs missing scheme', () => {
      const issues = validate(pointWith({ website: 'example.com' }))
      expect(issues).toHaveLength(1)
      expect(issues[0]?.rule).toEqual('invalid_format')
      expect(issues[0]?.message).toContain('in website')
    })

    it('should flag malformed URLs', () => {
      const issues = validate(
        pointWith({
          website: 'not-a-url',
          url: 'invalid://bad url with spaces',
        }),
      )
      expect(issues).toHaveLength(2)
      issues.forEach((issue) => {
        expect(issue.rule).toEqual('invalid_format')
        expect(issue.message).toContain('an invalid URL')
      })
    })

    it('should handle multiple URLs separated by semicolons', () => {
      const issues = validate(
        pointWith({ website: 'https://example.com;invalid-url;http://valid.org' }),
      )
      expect(issues).toHaveLength(1)
      expect(issues[0]?.rule).toEqual('invalid_format')
      expect(issues[0]?.message).toContain('in website')
      expect(dataOf(issues[0]).count).toEqual(1)
    })

    it('should handle multiple invalid URLs', () => {
      const issues = validate(pointWith({ website: 'bad-url1;bad-url2' }))
      expect(issues).toHaveLength(1)
      expect(issues[0]?.rule).toEqual('invalid_format')
      expect(issues[0]?.message).toContain('multiple invalid URLs')
      expect(dataOf(issues[0]).count).toEqual(2)
    })

    it('should validate all URL tags', () => {
      const issues = validate(
        pointWith({
          website: 'bad-url',
          url: 'another-bad-url',
          'contact:website': 'yet-another-bad',
          'source:url': 'still-bad',
        }),
      )
      expect(issues).toHaveLength(4)
      issues.forEach((issue) => {
        expect(issue.rule).toEqual('invalid_format')
        expect(issue.message).toContain('in ')
      })
    })

    it('should not flag empty URL fields', () => {
      const issues = validate(pointWith({ website: '', url: undefined }))
      expect(issues).toHaveLength(0)
    })

    it('should not flag URLs with accented characters', () => {
      const issues = validate(
        pointWith({ website: 'https://www.rando92.fr/randonner/itinéraires/' }),
      )
      expect(issues).toHaveLength(0)
    })

    it('should not flag internationalized domain names', () => {
      const issues = validate(pointWith({ website: 'https://teaomārama.school.nz' }))
      expect(issues).toHaveLength(0)
    })

    it('should not flag URLs with uppercase letters in domain', () => {
      const issues = validate(pointWith({ website: 'https://www.TownChronicle.com' }))
      expect(issues).toHaveLength(0)
    })

    it('should only flag well known tags containing URLs', () => {
      const issues = validate(
        pointWith({
          'website:source': 'survey',
          wikimedia_commons: 'File:photo.jpg',
        }),
      )
      expect(issues).toHaveLength(0)
    })

    it('should add a protocol in the suggested fix', () => {
      const graph = pointWith({ website: 'example.com' })
      const issues = validate(graph)
      expect(issues).toHaveLength(1)
      expect(issues[0]?.rule).toEqual('invalid_format')
      expect(issues[0]?.fixes.length).toBeGreaterThan(0)
      const fixed = applyFix(graph, issues[0]?.fixes[0])
      expect(tagsOf(fixed).website).toEqual('https://example.com')
    })

    it('should not offer to add a protocol for a URL without TLD', () => {
      const issues = validate(pointWith({ website: 'none' }))
      expect(issues).toHaveLength(1)
      expect(issues[0]?.rule).toEqual('invalid_format')
      expect(issues[0]?.message).toContain('in website')
      expect(issues[0]?.fixes).toHaveLength(0)
    })
  })

  describe('Wikimedia Commons validation', () => {
    it.each(['File:OpenStreetMap-Editor iD Logo.svg', 'File:100%.svg'])(
      'should suggest moving image URLs to Wikimedia Commons',
      (value) => {
        const graph = pointWith({ image: value })
        const issues = validate(graph)
        expect(issues).toHaveLength(1)
        expect(issues[0]?.rule).toEqual('invalid_format')
        expect(issues[0]?.message).toContain('Wikimedia Commons')
        expect(issues[0]?.fixes).toHaveLength(1)
        const fixed = applyFix(graph, issues[0]?.fixes[0])
        expect(tagsOf(fixed).image).toBeUndefined()
        expect(tagsOf(fixed).wikimedia_commons).toEqual(value)
      },
    )

    it('should not suggest moving tag when image tag contains a semicolon', () => {
      const issues = validate(
        pointWith({ image: 'https://example.com;File:OpenStreetMap-Editor iD Logo.svg' }),
      )
      expect(issues).toHaveLength(1)
      expect(issues[0]?.rule).toEqual('invalid_format')
      // still an invalid URL in the tag
      expect(issues[0]?.message).toContain('in image')
      expect(issues[0]?.fixes).toHaveLength(0)
    })

    it('should not suggest moving tag when wikimedia_commons tag is already present', () => {
      const issues = validate(
        pointWith({
          image: 'File:OpenStreetMap-Editor iD Logo.svg',
          wikimedia_commons: 'Category:OpenStreetMap',
        }),
      )
      expect(issues).toHaveLength(1)
      // still an invalid URL in the tag
      expect(issues[0]?.message).toContain('in image')
      expect(issues[0]?.fixes).toHaveLength(0)
    })

    it.each([
      // URL with hash
      'https://commons.wikimedia.org/wiki/File:OpenStreetMap-Editor_iD_Logo.svg#mw-jump-to-license',
      // percent-encoded URLs -> should be decoded
      'https://commons.wikimedia.org/wiki/File:Guidepost_%2863202%29.jpg',
      'https://commons.wikimedia.org/wiki/File:OSM_%EA%B2%80%ED%86%A0_%EC%9A%94%EC%B2%AD_%EB%B3%B5%EC%82%AC.png',
      'https://commons.wikimedia.org/wiki/File%3ARed_Spiral_Bike_Rack.jpg',
    ])('should propose to remove URL from Wikimedia Commons tag', (url) => {
      const graph = pointWith({ wikimedia_commons: url })
      const issues = validate(graph)
      expect(issues).toHaveLength(1)
      expect(issues[0]?.rule).toEqual('invalid_format')
      expect(issues[0]?.message).toContain('Wikimedia Commons')
      expect(issues[0]?.fixes).toHaveLength(1)
      const fixed = applyFix(graph, issues[0]?.fixes[0])
      const expected = decodeURIComponent(url)
        .replace('https://commons.wikimedia.org/wiki/', '')
        .replace(/#.*/, '')
        .replace(/_/g, ' ')
      expect(tagsOf(fixed).wikimedia_commons).toEqual(expected)
    })
  })

  describe('Email validation', () => {
    it('should not flag valid emails', () => {
      const issues = validate(pointWith({ email: 'test@example.com' }))
      expect(issues).toHaveLength(0)
    })

    it('should flag invalid emails', () => {
      const issues = validate(pointWith({ email: 'not-an-email' }))
      expect(issues).toHaveLength(1)
      expect(issues[0]?.rule).toEqual('invalid_format')
      expect(issues[0]?.message).toEqual('This feature has an invalid email address')
    })
  })
})
