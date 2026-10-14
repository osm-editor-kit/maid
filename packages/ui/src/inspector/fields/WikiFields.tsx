import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useFloating,
} from '@floating-ui/react'
import { getLocale, m } from '@osm-editor-kit/maid-i18n'
import type { FieldOption } from '@osm-editor-kit/maid-presets'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { useContext, useId, useRef, useState, type KeyboardEvent } from 'react'
import { PLAIN_INPUT } from '../../plain-input.ts'
import { useDebouncedValue } from '../../use-debounced-value.ts'
import {
  comboArrow,
  comboChoose,
  comboDelete,
  comboEnter,
  comboEscape,
  comboList,
  comboOpen,
  comboPicked,
  comboSettle,
  comboStart,
  comboTab,
  comboType,
  type ComboKeyEnv,
  type ComboKeyState,
} from './combo-keys.ts'
import { FallbackField } from './Fallback.tsx'
import { INPUT, LIMITED, writeEdits, type FieldProps } from './shared.ts'
import { WikiContext } from './wiki-context.ts'
import {
  articleFromUrl,
  languageOf,
  qidOf,
  splitWikipediaTag,
  wikidataFollowUp,
  wikidataUrl,
  wikipediaUrl,
  wikipediaValue,
} from './wiki-logic.ts'
import type { WikiItem, WikiSource } from './wiki-service.ts'

/**
 * The Wikipedia and Wikidata fields (iD's fields/wikipedia.js and wikidata.js). Lazy-loaded from fields.tsx, so
 * the code is not on the start path. Without a lookup source (the inspector gives one in the app, not under
 * automation) and for several features, the key is a plain text input (FallbackField).
 *
 * The rules are in wiki-logic.ts; the requests in wiki-service.ts. A write goes through writeEdits (one undo step
 * for the key). The Wikidata item that a Wikipedia article has is looked up after the write and written as its
 * own change, because the editor has no way to join two changes into one.
 */

/** The delay between the last typed key and the request, as iD's combo debounce (300 ms). */
const SEARCH_DELAY_MS = 300

/** An option of a lookup: its value (the title, or the QID), its label, and a line of detail. */
type SuggestOption = FieldOption & { detail?: string }

/** The options of a lookup for a text: `source.titles` or `source.items`, as TanStack Query options. */
type SearchOptions<T> = UseQueryOptions<T[], Error, T[], readonly unknown[]>

/**
 * The input of a field that searches a source: the typed text is looked up once the typing pauses (the input is
 * debounced, the query is keyed by the text: TanStack Query's pattern), and the answers are the options of a list
 * (listed as given). Keys as the combo's (combo-keys.ts), with the combo's list. `onCommit` gets the final text and
 * the option picked, if one was. The input is shown as `initial` again once committed (the parent re-keys it when
 * the value is written).
 */
function SuggestInput<T>(props: {
  id?: string
  initial: string
  placeholder: string
  label: string
  /** The lookup of a text: its options. A lookup that is disabled (no text, automation) asks nothing. */
  search: (text: string) => SearchOptions<T>
  /** One answer of the lookup, as an option of the list */
  toOption: (answer: T) => SuggestOption
  onCommit: (text: string, picked: SuggestOption | undefined) => void
}) {
  const { id, initial, placeholder, label, search, toOption, onCommit } = props
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const [state, setState] = useState<ComboKeyState>(() => comboStart(initial))
  // the newest state, read by the blur that follows a key in the same event
  const latest = useRef(state)
  // the option a key picked, read by the commit that its blur makes
  const chosen = useRef<SuggestOption | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const typed = state.query

  // the text looked up: the typed text once it has been still for SEARCH_DELAY_MS
  const asked = useDebouncedValue(typed, SEARCH_DELAY_MS) ?? ''
  const lookupOptions = search(asked)
  // keepPreviousData: the answers of the last text stay while the new one is on its way (as before)
  const lookup = useQuery({
    ...lookupOptions,
    enabled: asked.trim() !== '' && lookupOptions.enabled !== false,
    placeholderData: keepPreviousData,
  })

  // no text, no list; the answers of the last lookup otherwise
  const options: SuggestOption[] =
    typed !== undefined && typed.trim() !== '' ? (lookup.data ?? []).map(toOption) : []
  const env: ComboKeyEnv = { options, listed: true }
  const results = comboList(env, state)
  const active = state.active < results.length ? state.active : -1
  const listVisible = state.open && results.length > 0

  const { refs, floatingStyles } = useFloating({
    open: listVisible,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, { minWidth: `${rects.reference.width}px` })
        },
      }),
    ],
  })

  /** Keeps the newest state for the handlers, and renders it. */
  function apply(next: ComboKeyState) {
    latest.current = next
    setState(next)
  }

  function commit() {
    const picked = chosen.current
    chosen.current = undefined
    const text = latest.current.text
    apply(comboSettle(latest.current, text))
    onCommit(text, picked)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        apply(comboArrow(env, latest.current, event.key === 'ArrowDown' ? 1 : -1))
        return
      case 'Tab':
        chosen.current = comboPicked(env, latest.current)
        apply(comboTab(env, latest.current).state)
        return
      case 'Enter':
        event.preventDefault()
        chosen.current = comboPicked(env, latest.current)
        apply(comboEnter(env, latest.current).state)
        event.currentTarget.blur()
        return
      case 'Escape':
        event.stopPropagation()
        chosen.current = undefined
        apply(comboEscape(latest.current, initial))
        return
      case 'Backspace':
      case 'Delete': {
        const result = comboDelete(latest.current)
        if (result.handled) event.preventDefault()
        apply(result.state)
        return
      }
    }
  }

  return (
    <div className="grid min-w-0 gap-1">
      <div ref={refs.setReference} className="min-w-0">
        <input
          {...PLAIN_INPUT}
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-label={label}
          value={state.text}
          aria-expanded={listVisible}
          aria-controls={listVisible ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listVisible && active >= 0 ? optionId(active) : undefined}
          className={`${INPUT} ${LIMITED}`}
          onChange={(event) => {
            chosen.current = undefined
            apply(comboType(env, latest.current, event.currentTarget.value, true))
          }}
          onClick={() => apply(comboOpen(latest.current))}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
      </div>
      <FloatingPortal>
        {listVisible ? (
          <div
            id={listId}
            // oxlint-disable-next-line react/refs -- refs.setFloating is floating-ui's callback ref, not a .current value read during render
            ref={refs.setFloating}
            role="listbox"
            aria-label={label}
            // keeps the focus in the input while the list is clicked
            onMouseDown={(event) => event.preventDefault()}
            style={floatingStyles}
            className="z-50 max-h-[26rem] overflow-y-auto rounded-md border border-zinc-950/10 bg-white p-1 text-sm text-zinc-950 shadow-md dark:border-white/10 dark:bg-zinc-950 dark:text-white"
          >
            {results.map((option, index) => (
              <div
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                onClick={() => {
                  chosen.current = option
                  apply(comboChoose(latest.current, option.label))
                  inputRef.current?.blur()
                }}
                className={`flex min-h-8 cursor-pointer flex-col justify-center rounded px-2 py-1 ${
                  index === active ? 'bg-zinc-950/5 dark:bg-white/10' : ''
                }`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {(option as SuggestOption).detail ? (
                  <span className="min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {(option as SuggestOption).detail}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </FloatingPortal>
    </div>
  )
}

/** The Wikipedia field: the language and the article title (or a pasted article URL), with title suggestions. */
export function WikipediaField(props: FieldProps) {
  const source = useContext(WikiContext)
  const key = props.field.key
  if (source === undefined || key === undefined || props.onChange === undefined || props.combined) {
    return <FallbackField {...props} />
  }
  return <WikipediaEditor {...props} tagKey={key} source={source} />
}

function WikipediaEditor(props: FieldProps & { tagKey: string; source: WikiSource }) {
  const { tags, tagKey, source, id } = props
  const current = tags[tagKey]
  const parsed = current === undefined ? undefined : splitWikipediaTag(current)
  const queryClient = useQueryClient()
  const [revision, setRevision] = useState(0)
  // the language of the tag, or the editor's (the value is written only with a title)
  const [lang, setLang] = useState(parsed?.lang ?? getLocale())
  const [langDraft, setLangDraft] = useState(lang)

  /** Writes `lang:title` (or removes the tag without a title), then looks up the article's item. */
  function writeArticle(nextLang: string, nextTitle: string) {
    const written = wikipediaValue(nextLang, nextTitle)
    if (written === current) return
    writeEdits(props, [{ key: tagKey, value: written }])
    if (written === undefined) return
    const currentWikidata = tags['wikidata']
    // a failed lookup is no item: the follow-up is then not written
    void queryClient
      .fetchQuery(source.qidOfArticle(nextLang, nextTitle))
      .catch(() => null)
      .then((qid) => {
        // iD: the follow-up sets the item only when the article has one, and only when it differs
        const next = wikidataFollowUp(currentWikidata, qid ?? undefined)
        if (next !== undefined) writeEdits(props, [{ key: 'wikidata', value: next }])
      })
  }

  function commitTitle(text: string) {
    const fromUrl = articleFromUrl(text)
    if (fromUrl) {
      setLang(fromUrl.lang)
      setLangDraft(fromUrl.lang)
      writeArticle(fromUrl.lang, fromUrl.title)
    } else {
      writeArticle(lang, text.trim())
    }
    setRevision((count) => count + 1)
  }

  function commitLang() {
    const code = languageOf(langDraft)
    if (code === undefined) {
      setLangDraft(lang)
      return
    }
    setLang(code)
    setLangDraft(code)
    // with a title, the article moves to the new language
    if (parsed?.title !== undefined && code !== parsed.lang) writeArticle(code, parsed.title)
  }

  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex min-w-0 items-start gap-1">
        <input
          {...PLAIN_INPUT}
          type="text"
          aria-label={m.wiki_language_label()}
          placeholder={m.wiki_language_placeholder()}
          value={langDraft}
          spellCheck={false}
          className={`${INPUT} w-20 shrink-0`}
          onChange={(event) => setLangDraft(event.currentTarget.value)}
          onBlur={commitLang}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <div className="min-w-0 flex-1">
          <SuggestInput<string>
            key={`${current ?? ''}:${revision}`}
            id={id}
            initial={parsed?.title ?? ''}
            placeholder={m.wiki_title_placeholder()}
            label={m.wiki_title_label()}
            search={(text) => source.titles(lang, text)}
            toOption={(title) => ({ value: title, label: title })}
            onCommit={(text) => commitTitle(text)}
          />
        </div>
      </div>
      {parsed?.title !== undefined ? (
        <a
          href={wikipediaUrl(parsed.lang, parsed.title)}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate text-xs text-zinc-600 underline dark:text-zinc-400"
        >
          {m.wiki_open_article()}
        </a>
      ) : null}
    </div>
  )
}

/** The Wikidata field: items found by text (or a QID typed), and the label and description of the current item. */
export function WikidataField(props: FieldProps) {
  const source = useContext(WikiContext)
  const key = props.field.key
  if (source === undefined || key === undefined || props.onChange === undefined || props.combined) {
    return <FallbackField {...props} />
  }
  return <WikidataEditor {...props} tagKey={key} source={source} />
}

function WikidataEditor(props: FieldProps & { tagKey: string; source: WikiSource }) {
  const { tags, tagKey, source, id } = props
  const current = tags[tagKey]
  const lang = getLocale()
  const [revision, setRevision] = useState(0)
  // the item of the current QID. Its key is the QID, so a previous item is never shown for another one.
  const lookup = useQuery(source.item(current, lang))
  const item: WikiItem | undefined = lookup.data ?? undefined

  function commitItem(text: string, picked: SuggestOption | undefined) {
    const trimmed = text.trim()
    const next = trimmed === '' ? undefined : (picked?.value ?? qidOf(trimmed))
    setRevision((count) => count + 1)
    // a text that is no item comes back as it was
    if (next === undefined && trimmed !== '') return
    if (next === current) return
    writeEdits(props, [{ key: tagKey, value: next }])
  }

  return (
    <div className="grid min-w-0 gap-1">
      <SuggestInput<WikiItem>
        key={`${current ?? ''}:${revision}`}
        id={id}
        initial={current ?? ''}
        placeholder={m.wiki_item_placeholder()}
        label={m.wiki_item_label()}
        search={(text) => source.items(text, lang)}
        toOption={(found) => ({ value: found.id, label: found.label, detail: found.description })}
        onCommit={commitItem}
      />
      {current !== undefined && qidOf(current) !== undefined ? (
        <div className="flex min-w-0 items-baseline gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <a
            href={wikidataUrl(qidOf(current) ?? current)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 underline"
          >
            {m.wiki_open_item()}
          </a>
          {item !== undefined ? (
            <span className="min-w-0 truncate">
              {item.label}
              {item.description ? ` · ${item.description}` : ''}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
