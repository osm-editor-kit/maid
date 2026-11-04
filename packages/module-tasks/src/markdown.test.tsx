import { describe, expect, it } from 'bun:test'
import type { ReactElement } from 'react'
import * as server from 'react-dom/server'
import { fillMustache, Markdown, type MarkdownContext, parseMarkdown } from './markdown.tsx'

const renderToStaticMarkup = server.renderToStaticMarkup as (node: ReactElement) => string
const html = (text: string, context?: MarkdownContext) =>
  renderToStaticMarkup(<Markdown text={text} context={context} />)

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
    // the address after the first link is a bare address of its own, never a link inside a link
    expect(out).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<a /)
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

describe('markdown at the level of the MapRoulette fork', () => {
  it('reads headings, numbered lists, quotes, code blocks, rules and tables', () => {
    const out = html(
      [
        '## Aufgabe',
        '',
        '1. first',
        '2. second',
        '',
        '> a quote',
        '',
        '```',
        '<b>not bold</b>',
        '```',
        '',
        '---',
        '',
        '| key | value |',
        '| --- | --- |',
        '| `highway` | footway |',
      ].join('\n'),
    )
    expect(out).toContain('<h2')
    expect(out).toContain('<ol start="1"')
    expect(out.match(/<li>/g)?.length).toBe(2)
    expect(out).toContain('<blockquote')
    expect(out).toContain('&lt;b&gt;not bold&lt;/b&gt;')
    expect(out).toContain('<hr')
    expect(out).toContain('<th')
    expect(out).toContain('<td')
  })

  it('fills {{key}} from the task properties, read as text', () => {
    const out = html('Name: {{name}}, {{missing}}!', {
      name: '<b>Haupt</b>straße',
      nested: { a: 1 },
    })
    expect(out).toContain('Name: &lt;b&gt;Haupt&lt;/b&gt;straße, !')
    expect(fillMustache('{{nested}}', { nested: { a: 1 } })).toBe('')
    expect(fillMustache('{{n}}', { n: 3 })).toBe('3')
  })

  it('turns element references and openstreetmap.org links into references, not inside words', () => {
    const blocks = parseMarkdown(
      'See way/123, `node/5`, https://www.openstreetmap.org/relation/7 and [this](https://openstreetmap.org/way/9). Not xway/1 or a/way/2.',
    )
    const refs = JSON.stringify(blocks).match(/"ref":"[^"]+"/g)
    expect(refs).toEqual([
      '"ref":"way/123"',
      '"ref":"node/5"',
      '"ref":"relation/7"',
      '"ref":"way/9"',
    ])
  })

  it('shows copyable text with a button, images as links, bare https addresses as links', () => {
    const out = html(
      '[copyable "highway=footway"] ![photo](https://example.org/p.jpg) https://example.org/x.',
    )
    expect(out).toContain('highway=footway')
    expect(out).toContain('data-testid="tasks-copy"')
    expect(out).not.toContain('<img')
    expect(out).toContain('href="https://example.org/p.jpg"')
    expect(out).toContain('href="https://example.org/x"')
  })

  it('keeps underscores inside words', () => {
    expect(html('cycleway_left and _italic_')).toContain('cycleway_left and <em>italic</em>')
  })

  it('keeps the review cases right: closing hashes, tables, italic with bold, parentheses, fences', () => {
    expect(parseMarkdown('# Use C#')).toEqual([
      { t: 'h', level: 1, text: [{ t: 'text', text: 'Use C#' }] },
    ])
    expect(parseMarkdown('## Title ##')[0]).toEqual({
      t: 'h',
      level: 2,
      text: [{ t: 'text', text: 'Title' }],
    })
    expect(parseMarkdown('a | b\n---').map((b) => b.t)).toEqual(['p', 'hr'])
    expect(html('*a **b** c*')).toContain('<em>a <strong>b</strong> c</em>')
    const wiki = html('See https://en.wikipedia.org/wiki/Foo_(bar) now, (and https://x.org/a).')
    expect(wiki).toContain('href="https://en.wikipedia.org/wiki/Foo_(bar)"')
    expect(wiki).toContain('href="https://x.org/a"')
    expect(html('[Foo](https://en.wikipedia.org/wiki/Foo_(bar))')).toContain(
      'href="https://en.wikipedia.org/wiki/Foo_(bar)"',
    )
    expect(parseMarkdown('```\ncode\n\n# Head').map((b) => b.t)).toEqual(['p', 'h'])
    const fenced = parseMarkdown('```\nx\n```js\ny\n```\nafter')
    expect(fenced[0]).toEqual({ t: 'pre', text: 'x\n```js\ny' })
    expect(fenced[1]?.t).toBe('p')
  })
})
