import { describe, expect, it } from 'bun:test'
import type { ReactElement } from 'react'
// react-dom is not a dependency of this package yet (package.json is the orchestrator's): the copy of maid-ui is used.
import * as server from 'react-dom/server'
import { Markdown, parseMarkdown } from './markdown.tsx'

const renderToStaticMarkup = server.renderToStaticMarkup as (node: ReactElement) => string
const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />)

describe('markdown', () => {
  it('renders paragraphs, line breaks and marks', () => {
    const out = html('One **bold** and *italic* and `code`.\nNext line.\n\nSecond paragraph.')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<em>italic</em>')
    expect(out).toContain('>code</code>')
    expect(out).toContain('<br/>')
    expect(out.match(/<p>/g)).toHaveLength(2)
  })

  it('renders lists', () => {
    const out = html('Before\n- one\n- two *x*\nAfter')
    expect(out).toContain('<ul')
    expect(out.match(/<li>/g)).toHaveLength(2)
    expect(out).toContain('<em>x</em>')
    expect(parseMarkdown('- a\n- b')).toHaveLength(1)
  })

  it('renders an https link that opens in a new tab without an opener', () => {
    const out = html('See [the wiki](https://wiki.openstreetmap.org/wiki/Key:surface).')
    expect(out).toContain('href="https://wiki.openstreetmap.org/wiki/Key:surface"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).toContain('>the wiki</a>')
  })

  it('shows html as text', () => {
    const out = html('<script>alert(1)</script> and <img src=x onerror=alert(1)>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('leaves a javascript: or http: link as text', () => {
    const js = html('[click](javascript:alert(1))')
    expect(js).not.toContain('<a')
    expect(js).not.toContain('href')
    expect(js).toContain('[click](javascript:alert(1))')
    const plain = html('[click](http://example.org/x) and [data](data:text/html,x)')
    expect(plain).not.toContain('<a')
    expect(plain).toContain('[click](http://example.org/x)')
  })

  it('does not nest a link in a link text, and escapes quotes in text', () => {
    const out = html('[a [b](https://x.org)](https://y.org) "quoted" & more')
    expect(out.match(/<a /g)?.length ?? 0).toBeLessThanOrEqual(1)
    expect(out).toContain('&quot;quoted&quot; &amp; more')
  })

  it('treats unmatched marks as text and an empty text as nothing', () => {
    expect(html('2 * 3 and ** and ` alone')).toContain('2 * 3 and ** and ` alone')
    expect(html('')).toBe('')
    expect(html('  \n\n ')).toBe('')
  })

  it('never produces dangerouslySetInnerHTML-style raw output for a long hostile text', () => {
    const hostile = '[x](https://a.org"onmouseover="alert(1)) **<b>**'
    const out = html(hostile)
    expect(out).not.toContain('onmouseover="')
    expect(out).not.toContain('<b>')
  })
})
