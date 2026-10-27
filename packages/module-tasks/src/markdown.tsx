/**
 * A small, safe Markdown renderer for the descriptions of tasks and options. It reads paragraphs (a line break stays
 * a line break), `- ` lists, `**bold**`, `*italic*`, `` `code` `` and `[text](https://…)`. Everything else is plain text.
 * It builds React elements only: no HTML string, no `dangerouslySetInnerHTML`, so a `<script>` or an `<img onerror>`
 * in a description is shown as text. A link is kept only when its address is `https:`; any other address leaves the
 * whole `[text](address)` as text. Links open in a new tab with `rel="noopener noreferrer"`.
 */
import { type ReactNode } from 'react'

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'bold'; children: Inline[] }
  | { t: 'italic'; children: Inline[] }
  | { t: 'code'; text: string }
  | { t: 'link'; href: string; children: Inline[] }

export type Block = { t: 'p'; lines: Inline[][] } | { t: 'ul'; items: Inline[][] }

const LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)/

function httpsHref(address: string): string | undefined {
  try {
    const url = new URL(address)
    return url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function pushText(out: Inline[], text: string) {
  if (text === '') return
  const last = out.at(-1)
  if (last?.t === 'text') last.text += text
  else out.push({ t: 'text', text })
}

/** Reads the inline marks of one line. `inLink` stops a link inside a link's text. */
export function parseInline(text: string, inLink = false): Inline[] {
  const out: Inline[] = []
  let i = 0
  while (i < text.length) {
    const char = text[i]
    if (char === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i + 1) {
        out.push({ t: 'code', text: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    } else if (char === '[' && !inLink) {
      const match = LINK.exec(text.slice(i))
      if (match) {
        const href = httpsHref(match[2] ?? '')
        if (href) {
          out.push({ t: 'link', href, children: parseInline(match[1] ?? '', true) })
        } else {
          // not an https address: the whole thing stays text
          pushText(out, match[0])
        }
        i += match[0].length
        continue
      }
    } else if (char === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end > i + 2) {
        out.push({ t: 'bold', children: parseInline(text.slice(i + 2, end), inLink) })
        i = end + 2
        continue
      }
    } else if (char === '*') {
      const end = text.indexOf('*', i + 1)
      if (end > i + 1 && text[end + 1] !== '*') {
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

/** Reads blocks: lines starting with `- ` are list items, blank lines end a paragraph or a list */
export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = []
  for (const raw of text.replaceAll('\r\n', '\n').split('\n')) {
    const line = raw.trimEnd()
    if (line.trim() === '') {
      blocks.push({ t: 'p', lines: [] }) // a break marker, dropped below
      continue
    }
    const last = blocks.at(-1)
    const item = /^\s*- (.*)$/.exec(line)
    if (item) {
      const inline = parseInline(item[1] ?? '')
      if (last?.t === 'ul') last.items.push(inline)
      else blocks.push({ t: 'ul', items: [inline] })
    } else if (last?.t === 'p') {
      // the paragraph so far, or the empty marker of a blank line, which this line turns into a paragraph
      last.lines.push(parseInline(line))
    } else {
      blocks.push({ t: 'p', lines: [parseInline(line)] })
    }
  }
  return blocks.filter((block) => (block.t === 'p' ? block.lines.length > 0 : true))
}

function renderInline(parts: readonly Inline[]): ReactNode[] {
  return parts.map((part, index) => {
    switch (part.t) {
      case 'text':
        return part.text
      case 'bold':
        return <strong key={index}>{renderInline(part.children)}</strong>
      case 'italic':
        return <em key={index}>{renderInline(part.children)}</em>
      case 'code':
        return (
          <code
            key={index}
            className="rounded bg-zinc-950/5 px-1 font-mono text-[0.9em] dark:bg-white/10"
          >
            {part.text}
          </code>
        )
      case 'link':
        return (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline dark:text-blue-400"
          >
            {renderInline(part.children)}
          </a>
        )
    }
  })
}

/** The description of a task or an option, rendered safely */
export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text)
  if (blocks.length === 0) return null
  return (
    <div className="flex flex-col gap-2 text-sm/5 break-words">
      {blocks.map((block, index) =>
        block.t === 'ul' ? (
          <ul key={index} className="list-disc pl-5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line)}
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  )
}
