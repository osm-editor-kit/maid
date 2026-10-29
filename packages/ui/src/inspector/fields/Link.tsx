import { ArrowTopRightOnSquareIcon } from '@heroicons/react/16/solid'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { PLAIN_INPUT } from '../../plain-input.ts'
import { cleanValue } from '../logic.ts'
import { DraftInput, LengthNotice, useDraft, useLengthLimit } from './DraftInput.tsx'
import { FallbackField } from './Fallback.tsx'
import { keyDisplay } from './mixed-logic.ts'
import type { FieldProps } from './shared.ts'
import { INPUT, LIMITED } from './shared.ts'
import { identifierLink, isValidUrl, telKey } from './text-logic.ts'

/** A button or link after an input: joined to it, 32 px high, the same surface as the input. */
export const ADDON =
  '-ml-px grid h-8 pointer-coarse:h-11 pointer-coarse:w-11 shrink-0 place-items-center rounded-none border border-zinc-950/10 bg-white px-2 text-zinc-500 last:rounded-r-md hover:border-zinc-950/20 hover:text-zinc-950 focus-visible:relative focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:text-white'

/** What an addon gets: the draft, a write that skips the draft (pickers), and whether the field is editable. */
export type AddonState = {
  draft: string
  editable: boolean
  /** Sets the draft and writes the tag as blur would (cleaned; empty removes the tag). */
  write: (text: string) => void
}

type AddonInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'readOnly'
> & {
  tagKey: string
  value: string
  onChange?: FieldProps['onChange']
  /** The buttons after the input. Read-only fields get what the function returns for `editable: false`. */
  addons?: (state: AddonState) => ReactNode
  /** A line under the input, e.g. a warning about the draft. Shown read-only too. */
  hint?: (draft: string) => ReactNode
}

/**
 * A draft text input with buttons joined to its right. Written on blur and Enter, Escape
 * reverts, as DraftInput. The addons see the draft, so a link can follow what is typed.
 */
export function AddonInput({ tagKey, value, onChange, addons, hint, ...rest }: AddonInputProps) {
  const { draft, setDraft, commit, revert } = useDraft({ tagKey, value, onChange })
  const limit = useLengthLimit(draft)
  const write = (text: string) => {
    setDraft(text)
    const next = cleanValue(text)
    if ((next ?? '') !== value) onChange?.(tagKey, next)
  }
  const addon = addons?.({ draft, editable: onChange !== undefined, write })
  const grouped = addon !== undefined && addon !== null && addon !== false
  return (
    <>
      <div className="flex min-w-0">
        <input
          {...PLAIN_INPUT}
          {...rest}
          className={`${grouped ? `${INPUT} flex-1 rounded-r-none` : INPUT} ${LIMITED}`}
          aria-invalid={limit.invalid}
          aria-describedby={limit.describedBy(rest['aria-describedby'])}
          value={draft}
          readOnly={!onChange}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              revert()
              event.stopPropagation()
            }
          }}
        />
        {addon}
      </div>
      {hint ? hint(draft) : null}
      <LengthNotice draft={draft} messageId={limit.messageId} />
    </>
  )
}

/** The open button: a link in a new tab when the address is valid, else a disabled button. */
export function OpenLink({ href, label }: { href: string | undefined; label: string }) {
  const text = `Open ${label} in a new tab`
  const icon = <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-4" />
  if (href === undefined) {
    return (
      <button type="button" disabled aria-label={text} title={text} className={ADDON}>
        {icon}
      </button>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={text}
      title={text}
      className={ADDON}
    >
      {icon}
    </a>
  )
}

/** A web address. The open button is enabled for a valid http or https URL. */
export function UrlField(props: FieldProps) {
  const { field, tags, id, onChange, combined } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const shown = keyDisplay(key, tags, combined, field.placeholder ?? 'Unknown')
  return (
    <AddonInput
      id={id}
      type="url"
      tagKey={key}
      value={shown.value}
      placeholder={shown.placeholder}
      title={shown.title}
      onChange={onChange}
      addons={({ draft, editable }) =>
        editable ? (
          <OpenLink href={isValidUrl(draft) ? draft.trim() : undefined} label={field.label} />
        ) : null
      }
    />
  )
}

/**
 * An identifier. With urlFormat and pattern, an open button builds the link from the value (see
 * identifierLink); without them it is a plain text input.
 */
export function IdentifierField(props: FieldProps) {
  const { field, tags, id, onChange, combined } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const linkable = field.urlFormat !== undefined && field.pattern !== undefined
  const shown = keyDisplay(key, tags, combined, field.placeholder ?? 'Unknown')
  return (
    <AddonInput
      id={id}
      type="text"
      tagKey={key}
      value={shown.value}
      placeholder={shown.placeholder}
      title={shown.title}
      onChange={onChange}
      addons={
        linkable
          ? ({ draft, editable }) =>
              editable ? <OpenLink href={identifierLink(field, draft)} label={field.label} /> : null
          : undefined
      }
    />
  )
}

/** An email address, in a native email input (no check beyond the browser's). */
export function EmailField(props: FieldProps) {
  const { field, tags, id, onChange, combined } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const shown = keyDisplay(key, tags, combined, field.placeholder ?? 'Unknown')
  return (
    <DraftInput
      id={id}
      type="email"
      tagKey={key}
      value={shown.value}
      placeholder={shown.placeholder}
      title={shown.title}
      onChange={onChange}
    />
  )
}

/**
 * A phone number in a native tel input. The key is the one of the field's keys that has a value
 * (see telKey), so `contact:phone` is edited where it is set. The country's phone-format
 * placeholder of iD is not available: the field's own placeholder is shown.
 */
export function TelField(props: FieldProps) {
  const { field, tags, id, onChange, combined } = props
  const key = telKey(field, tags)
  if (key === undefined) return <FallbackField {...props} />
  const shown = keyDisplay(key, tags, combined, field.placeholder ?? 'Unknown')
  return (
    <DraftInput
      id={id}
      type="tel"
      tagKey={key}
      value={shown.value}
      placeholder={shown.placeholder}
      title={shown.title}
      onChange={onChange}
    />
  )
}
