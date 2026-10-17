import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from '@heroicons/react/16/solid'
import { useId, type KeyboardEvent } from 'react'
import type { Country } from './catalogue.ts'
import {
  combineSignIdSignValue,
  signTitle,
  splitSignIdSignValue,
  type SignEntry,
} from './sign-value.ts'
import { SignImage } from './SignImage.tsx'
import type { TrafficSignTexts } from './texts.ts'
import type { LoadSvg } from './use-sign-image.ts'

const ICON_BUTTON =
  'grid size-6 shrink-0 place-items-center rounded text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
const VALUE_INPUT =
  'h-6 w-20 min-w-0 rounded-md border border-zinc-950/10 bg-white px-1.5 text-sm text-zinc-950 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 read-only:cursor-default dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:border-white/20 dark:[color-scheme:dark]'

/** The input of a sign's value prompt, from the converter's valuePromptInputFormats */
function inputAttributes(format: string): { type: 'number' | 'text'; step?: string } {
  if (format === 'integer') return { type: 'number' }
  if (format === 'float') return { type: 'number', step: '0.1' }
  return { type: 'text' }
}

export type SignRowProps = {
  entry: SignEntry
  index: number
  total: number
  country: Country
  load: LoadSvg
  texts: TrafficSignTexts
  /** Absent: the row is read-only (no buttons, no value input) */
  onRemove?: () => void
  onMove?: (direction: -1 | 1) => void
  /** A new `osmValuePart` for this row (the value prompt) */
  onPart?: (part: string) => void
}

/** One sign: its picture, its name, its code in mono, and the buttons. Alt+ArrowUp/ArrowDown in the row moves it. */
export function SignRow({
  entry,
  index,
  total,
  country,
  load,
  texts,
  onRemove,
  onMove,
  onPart,
}: SignRowProps) {
  const inputId = useId()
  const { sign, part } = entry
  const title = sign ? signTitle(sign) : part === 'none' ? texts.noSign : texts.unknownSign
  const prompt = sign?.valuePrompt
  const current = splitSignIdSignValue(part).signValue ?? prompt?.defaultValue ?? ''

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (!onMove || !event.altKey) return
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    event.stopPropagation()
    onMove(event.key === 'ArrowUp' ? -1 : 1)
  }

  function commit(raw: string) {
    if (!sign || !onPart) return
    const value = raw.trim()
    const next = value ? combineSignIdSignValue(sign.signId, value) : sign.osmValuePart
    if (next !== part) onPart(next)
  }

  return (
    <li
      data-sign-row={index}
      title={sign?.description || title}
      onKeyDown={onKeyDown}
      className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-950/10 bg-white p-1 dark:border-white/10 dark:bg-zinc-950"
    >
      <SignImage
        load={load}
        country={country}
        part={sign ? part : undefined}
        mark={sign ? '' : '?'}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-zinc-950 dark:text-white">{title}</div>
        <div className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">{part}</div>
        {prompt ? (
          <div className="mt-0.5 flex items-center gap-1.5">
            <label
              htmlFor={inputId}
              className="min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-400"
            >
              {prompt.prompt}
            </label>
            <input
              id={inputId}
              {...inputAttributes(prompt.format)}
              // keyed by the written part: a value that changes from outside is a new input
              key={part}
              autoComplete="off"
              className={VALUE_INPUT}
              defaultValue={current}
              readOnly={!onPart}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              onBlur={(event) => commit(event.currentTarget.value)}
            />
          </div>
        ) : null}
      </div>
      {onMove ? (
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            data-move="up"
            aria-label={texts.moveUp}
            title={texts.moveUp}
            disabled={index === 0}
            className={ICON_BUTTON}
            onClick={() => onMove(-1)}
          >
            <ChevronUpIcon aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            data-move="down"
            aria-label={texts.moveDown}
            title={texts.moveDown}
            disabled={index === total - 1}
            className={ICON_BUTTON}
            onClick={() => onMove(1)}
          >
            <ChevronDownIcon aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          aria-label={texts.removeSign({ sign: title })}
          title={texts.remove}
          className={ICON_BUTTON}
          onClick={onRemove}
        >
          <TrashIcon aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </li>
  )
}
