/**
 * A safe Markdown renderer for the descriptions of tasks and options, at the level of the MapRoulette task text in
 * Tobias's MapRoulette fork of iD (marked with DOMPurify), but without an HTML string:
 *
 * - blocks: paragraphs (a line break stays a line break), `#` to `######` headings, `- ` / `* ` and `1. ` lists,
 *   `> ` quotes, ``` code blocks, `---` rules and `|` tables;
 * - inline: `**bold**`, `*italic*` and `_italic_`, `` `code` ``, `[text](https://…)`, bare `https://…` addresses;
 * - MapRoulette's extras: `{{key}}` is replaced by the task's property `key` (empty when it has none), `way/123`,
 *   `node/5`, `relation/7` and openstreetmap.org element links select the element in Maid, and
 *   `[copyable "text"]` (or `{{{copyable "text"}}}`) shows the text with a copy button.
 *
 * It builds React elements only: no `dangerouslySetInnerHTML`, so a `<script>` or an `<img onerror>` in a
 * description is shown as text. A link is kept only when its address is `https:`; any other address leaves the whole
 * `[text](address)` as text. Links open in a new tab with `rel="noopener noreferrer"`. Images (`![alt](src)`) become
 * links to the image: Maid loads nothing from an address a task file names. MapRoulette's `[select …]` and
 * `[checkbox …]` shortcodes ask for an answer that a task file has no place for, so they stay text.
 */
import { type ReactNode, useState } from 'react'

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'bold'; children: Inline[] }
  | { t: 'italic'; children: Inline[] }
  | { t: 'code'; text: string }
  | { t: 'link'; href: string; children: Inline[] }
  | { t: 'osm'; ref: string; children: Inline[] }
  | { t: 'copy'; text: string }

export type Block =
  | { t: 'p'; lines: Inline[][] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; start: number; items: Inline[][] }
  | { t: 'h'; level: 1 | 2 | 3 | 4 | 5 | 6; text: Inline[] }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'pre'; text: string }
  | { t: 'hr' }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }

/** Values for `{{key}}`: the task's properties. Only strings, numbers and booleans are written. */
export type MarkdownContext = Readonly<Record<string, unknown>>

const LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)/
const IMAGE = /^!\[([^\]\n]*)\]\(([^)\s]+)\)/
const COPYABLE = /^(?:\[|\{\{\{)copyable[/ ]?"([^"]*)"\s*(?:\]|\}\}\})(?!\()/
const OSM_REF = /^(node|way|relation)\/([1-9][0-9]*)\b/
const OSM_URL =
  /^https:\/\/(?:www\.)?openstreetmap\.org\/(node|way|relation)\/([1-9][0-9]*)(?:[#?]\S*)?$/
const BARE_URL = /^https:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/
const MUSTACHE = /\{\{([\w:]+)\}\}/g

function httpsHref(address: string): string | undefined {
  try {
    const url = new URL(address)
    return url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/** The OSM element of an openstreetmap.org address, as `way/123` */
function osmRefOfUrl(href: string): string | undefined {
  const match = OSM_URL.exec(href)
  return match ? `${match[1]}/${match[2]}` : undefined
}

/** Replaces `{{key}}` with the property of the task; a key it has not, or an object, gives nothing */
export function fillMustache(text: string, context: MarkdownContext = {}): string {
  return text.replace(MUSTACHE, (_match, key: string) => {
    const value = Object.hasOwn(context, key) ? context[key] : undefined
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : ''
  })
}

function pushText(out: Inline[], text: string) {
  if (text === '') return
  const last = out.at(-1)
  if (last?.t === 'text') last.text += text
  else out.push({ t: 'text', text })
}

/** Whether position `i` starts a word: an OSM reference inside `foo/way/1` or `xway/1` is not one */
function atWordStart(text: string, i: number) {
  return i === 0 || !/[\w/]/.test(text[i - 1] ?? '')
}

/** Reads the inline marks of one line. `inLink` stops a link inside a link's text. */
export function parseInline(text: string, inLink = false): Inline[] {
  const out: Inline[] = []
  let i = 0
  while (i < text.length) {
    const char = text[i]
    const rest = text.slice(i)
    if (char === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i + 1) {
        const code = text.slice(i + 1, end)
        const ref = OSM_REF.exec(code)
        // a code span that is only an element reference selects it, as in the iD fork
        if (!inLink && ref && ref[0] === code.trim())
          out.push({ t: 'osm', ref: ref[0], children: [{ t: 'code', text: code }] })
        else out.push({ t: 'code', text: code })
        i = end + 1
        continue
      }
    } else if ((char === '[' || char === '{') && !inLink && COPYABLE.test(rest)) {
      const match = COPYABLE.exec(rest)!
      out.push({ t: 'copy', text: match[1] ?? '' })
      i += match[0].length
      continue
    } else if (char === '!' && !inLink && IMAGE.test(rest)) {
      const match = IMAGE.exec(rest)!
      const href = httpsHref(match[2] ?? '')
      const label = match[1] || match[2] || ''
      if (href) out.push({ t: 'link', href, children: [{ t: 'text', text: label }] })
      else pushText(out, match[0])
      i += match[0].length
      continue
    } else if (char === '[' && !inLink) {
      const match = LINK.exec(rest)
      if (match) {
        const href = httpsHref(match[2] ?? '')
        const children = parseInline(match[1] ?? '', true)
        const ref = href && osmRefOfUrl(href)
        if (ref) out.push({ t: 'osm', ref, children })
        else if (href) out.push({ t: 'link', href, children })
        // not an https address: the whole thing stays text
        else pushText(out, match[0])
        i += match[0].length
        continue
      }
    } else if (char === 'h' && !inLink && atWordStart(text, i) && BARE_URL.test(rest)) {
      const address = BARE_URL.exec(rest)![0]
      const href = httpsHref(address)
      if (href) {
        const ref = osmRefOfUrl(href)
        const children: Inline[] = [{ t: 'text', text: address }]
        out.push(ref ? { t: 'osm', ref, children } : { t: 'link', href, children })
        i += address.length
        continue
      }
    } else if (
      (char === 'n' || char === 'w' || char === 'r') &&
      !inLink &&
      atWordStart(text, i) &&
      OSM_REF.test(rest)
    ) {
      const ref = OSM_REF.exec(rest)![0]
      out.push({ t: 'osm', ref, children: [{ t: 'text', text: ref }] })
      i += ref.length
      continue
    } else if (char === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end > i + 2) {
        out.push({ t: 'bold', children: parseInline(text.slice(i + 2, end), inLink) })
        i = end + 2
        continue
      }
    } else if ((char === '*' || char === '_') && (char === '*' || atWordStart(text, i))) {
      const end = text.indexOf(char, i + 1)
      const after = text[end + 1]
      const closes = char === '*' ? after !== '*' : after === undefined || !/\w/.test(after)
      if (end > i + 1 && closes) {
        out.push({ t: 'italic', children: parseInline(text.slice(i + 1, end), inLink) })
        i = end + 1
        continue
      }
    }
    pushText(out, char ?? '')
    i++
  }
  return out
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const FENCE = /^\s*(```|~~~)/
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

/** The cells of a table row `| a | b |` */
function cellsOf(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((cell) => cell.trim())
}

/**
 * Reads blocks. `{{key}}` is filled from `context` first, so a property's text is read as Markdown too (it cannot
 * add HTML: there is none). Blank lines end a paragraph or a list.
 */
export function parseMarkdown(text: string, context?: MarkdownContext): Block[] {
  const lines = fillMustache(text, context).replaceAll('\r\n', '\n').split('\n')
  return parseLines(lines)
}

function parseLines(lines: readonly string[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  /** A blank line ends the open paragraph or list */
  let open = false
  while (i < lines.length) {
    const line = (lines[i] ?? '').trimEnd()
    const last = open ? blocks.at(-1) : undefined
    if (line.trim() === '') {
      open = false
      i++
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(fence[1] ?? '```')) {
        body.push(lines[i] ?? '')
        i++
      }
      blocks.push({ t: 'pre', text: body.join('\n') })
      open = false
      i++
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      const level = (heading[1]?.length ?? 1) as 1 | 2 | 3 | 4 | 5 | 6
      blocks.push({ t: 'h', level, text: parseInline(heading[2] ?? '') })
      open = false
      i++
      continue
    }
    if (RULE.test(line)) {
      blocks.push({ t: 'hr' })
      open = false
      i++
      continue
    }
    if (line.trimStart().startsWith('>')) {
      const quoted: string[] = []
      while (i < lines.length && (lines[i] ?? '').trimStart().startsWith('>')) {
        quoted.push((lines[i] ?? '').trimStart().replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ t: 'quote', blocks: parseLines(quoted) })
      open = false
      continue
    }
    if (line.includes('|') && TABLE_RULE.test(lines[i + 1] ?? '')) {
      const head = cellsOf(line).map((cell) => parseInline(cell))
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim() !== '') {
        rows.push(cellsOf(lines[i] ?? '').map((cell) => parseInline(cell)))
        i++
      }
      blocks.push({ t: 'table', head, rows })
      open = false
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = bullet ? undefined : NUMBERED.exec(line)
    if (bullet) {
      const inline = parseInline(bullet[1] ?? '')
      if (last?.t === 'ul') last.items.push(inline)
      else blocks.push({ t: 'ul', items: [inline] })
    } else if (numbered) {
      const inline = parseInline(numbered[2] ?? '')
      if (last?.t === 'ol') last.items.push(inline)
      else blocks.push({ t: 'ol', start: Number(numbered[1]), items: [inline] })
    } else if (last?.t === 'p') {
      last.lines.push(parseInline(line))
    } else if ((last?.t === 'ul' || last?.t === 'ol') && /^\s+/.test(lines[i] ?? '')) {
      // an indented line continues the list item above
      const item = last.items.at(-1)
      if (item) item.push({ t: 'text', text: ' ' }, ...parseInline(line.trim()))
    } else {
      blocks.push({ t: 'p', lines: [parseInline(line)] })
    }
    open = true
    i++
  }
  return blocks
}

/** What a rendered element reference does: select it in Maid */
export type OnOsmRef = (ref: string) => void

const LINK_CLASS = 'text-blue-600 underline dark:text-blue-400'
const CODE_CLASS = 'rounded bg-zinc-950/5 px-1 font-mono text-[0.9em] dark:bg-white/10'

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="inline-flex items-center gap-1">
      <code className={CODE_CLASS}>{text}</code>
      <button
        type="button"
        data-testid="tasks-copy"
        className="cursor-pointer rounded border border-zinc-950/10 px-1 text-xs hover:bg-zinc-950/5 dark:border-white/15 dark:hover:bg-white/5"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setCopied(true))
        }}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </span>
  )
}

function renderInline(parts: readonly Inline[], onOsm?: OnOsmRef): ReactNode[] {
  return parts.map((part, index) => {
    switch (part.t) {
      case 'text':
        return part.text
      case 'bold':
        return <strong key={index}>{renderInline(part.children, onOsm)}</strong>
      case 'italic':
        return <em key={index}>{renderInline(part.children, onOsm)}</em>
      case 'code':
        return (
          <code key={index} className={CODE_CLASS}>
            {part.text}
          </code>
        )
      case 'copy':
        return <CopyText key={index} text={part.text} />
      case 'osm':
        // without a way to select (a static render), the reference opens on openstreetmap.org
        return onOsm ? (
          <button
            key={index}
            type="button"
            data-testid={`tasks-osm-${part.ref}`}
            className={`cursor-pointer ${LINK_CLASS}`}
            onClick={() => onOsm(part.ref)}
          >
            {renderInline(part.children)}
          </button>
        ) : (
          <a
            key={index}
            href={`https://www.openstreetmap.org/${part.ref}`}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            {renderInline(part.children)}
          </a>
        )
      case 'link':
        return (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            {renderInline(part.children, onOsm)}
          </a>
        )
    }
  })
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-base font-semibold',
  2: 'text-base font-semibold',
  3: 'text-sm font-semibold',
  4: 'text-sm font-semibold',
  5: 'text-sm font-medium',
  6: 'text-sm font-medium',
}

function renderBlocks(blocks: readonly Block[], onOsm?: OnOsmRef): ReactNode[] {
  return blocks.map((block, index) => {
    switch (block.t) {
      case 'ul':
        return (
          <ul key={index} className="list-disc pl-5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item, onOsm)}</li>
            ))}
          </ul>
        )
      case 'ol':
        return (
          <ol key={index} start={block.start} className="list-decimal pl-5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item, onOsm)}</li>
            ))}
          </ol>
        )
      case 'h': {
        const Tag = `h${block.level}` as const
        return (
          <Tag key={index} className={HEADING_CLASS[block.level]}>
            {renderInline(block.text, onOsm)}
          </Tag>
        )
      }
      case 'quote':
        return (
          <blockquote
            key={index}
            className="flex flex-col gap-2 border-l-2 border-zinc-950/15 pl-3 text-zinc-600 dark:border-white/20 dark:text-zinc-300"
          >
            {renderBlocks(block.blocks, onOsm)}
          </blockquote>
        )
      case 'pre':
        return (
          <pre
            key={index}
            className="overflow-x-auto rounded bg-zinc-950/5 p-2 font-mono text-xs dark:bg-white/10"
          >
            {block.text}
          </pre>
        )
      case 'hr':
        return <hr key={index} className="border-zinc-950/10 dark:border-white/15" />
      case 'table':
        return (
          <div key={index} className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  {block.head.map((cell, cellIndex) => (
                    <th
                      key={cellIndex}
                      className="border-b border-zinc-950/10 px-1.5 py-1 text-left font-medium dark:border-white/15"
                    >
                      {renderInline(cell, onOsm)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="border-b border-zinc-950/5 px-1.5 py-1 align-top dark:border-white/10"
                      >
                        {renderInline(cell, onOsm)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case 'p':
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line, onOsm)}
              </span>
            ))}
          </p>
        )
    }
  })
}

/**
 * The description of a task or an option, rendered safely. `context` fills `{{key}}` (the task's properties);
 * `onOsm` selects an element a reference names (without it, the reference opens on openstreetmap.org).
 */
export function Markdown({
  text,
  context,
  onOsm,
}: {
  text: string
  context?: MarkdownContext
  onOsm?: OnOsmRef
}) {
  const blocks = parseMarkdown(text, context)
  if (blocks.length === 0) return null
  return (
    <div className="flex flex-col gap-2 text-sm/5 break-words">{renderBlocks(blocks, onOsm)}</div>
  )
}
