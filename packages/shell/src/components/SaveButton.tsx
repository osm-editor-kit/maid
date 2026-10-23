import { ArrowUpTrayIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import {
  Flyout,
  notify,
  SemiComboField,
  SuggestTextarea,
  toolButtonClass,
  Tooltip,
} from '@osm-editor-kit/maid-ui'
import { useQueryStates } from 'nuqs'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth'
import { CHANGESET_URL } from '../config'
import { saveBlocked } from '../save/blocked'
import { draftHashtags, linksOf, type Draft } from '../save/changeset-draft'
import { useChangesetDraft, useChangesetDraftActions } from '../save/changeset-draft-store'
import { changesetHistoryActions } from '../save/changeset-history-store'
import {
  commentSuggestions,
  hasSource,
  sourceChips,
  sourceField,
  sourceLabel,
  toggleSource,
} from '../save/changeset-suggestions'
import { changesetWarnings, COPYRIGHT_URL, type ChangesetWarning } from '../save/changeset-warnings'
import { summaryOf, type ChangeElement, type OsmChange } from '../save/osm-change'
import { pendingChange, uploadEdits, uploadErrors } from '../save/save'
import { useRecentChangesetValues } from '../save/use-recent-changesets'
import { useSelection } from '../selection'
import { useEngine, useShell } from '../shell-context'
import { stateParams } from '../url/params'

/** The changeset values a link can prefill (iD's hash parameters `comment`, `hashtags`, `source`) */
const linkParams = {
  comment: stateParams.comment,
  hashtags: stateParams.hashtags,
  source: stateParams.source,
}

/** The look of the changeset's text fields */
const FIELD =
  'w-full rounded-md border border-zinc-950/10 bg-white px-2 py-1.5 text-sm placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-950 dark:placeholder:text-zinc-500'

/** A chip that is one click: a recent source, filled when it is in the changeset's source */
const SOURCE_CHIP =
  'inline-flex h-6 max-w-full cursor-pointer items-center gap-1 rounded-full border px-2.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500'
const SOURCE_CHIP_OFF =
  'border-zinc-950/15 text-zinc-700 hover:bg-zinc-950/5 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/10'
const SOURCE_CHIP_ON =
  'border-blue-600/40 bg-blue-600/10 font-medium text-blue-800 hover:bg-blue-600/20 dark:border-blue-400/40 dark:bg-blue-400/15 dark:text-blue-200 dark:hover:bg-blue-400/25'

/** What the panel shows before the draft starts (a single frame, see `SavePanel`) */
const NO_DRAFT: Draft = { comment: '' }

export const LISTED = 12

export function describe(element: ChangeElement) {
  const tags = Object.entries(element.tags)
  const main = tags.find(([key]) => key !== 'name' && !key.includes(':'))
  const what = element.tags.name ?? (main ? `${main[0]}=${main[1]}` : 'no tags')
  return `${element.type} ${element.id < 0 ? 'new' : element.id} · ${what}`
}

/** One line of a change list: what happened ("Created", "Changed", "Deleted") and the element */
export type ChangeRow = readonly [kind: string, element: ChangeElement]

/** The rows of an upload: created, then changed, then deleted, as the save flyout lists them */
export function rowsOf(change: OsmChange): ChangeRow[] {
  return [
    ...change.create.map((e) => ['Created', e] as const),
    ...change.modify.map((e) => ['Changed', e] as const),
    ...change.delete.map((e) => ['Deleted', e] as const),
  ]
}

/**
 * The list of changed elements: the kind, then the element as `describe` writes it. `limit` lists
 * that many rows and counts the rest; `icon` puts a symbol before each element.
 */
export function ChangeRows(props: {
  rows: readonly ChangeRow[]
  limit?: number
  className?: string
  icon?: (element: ChangeElement) => ReactNode
}) {
  const { rows, limit = LISTED, icon } = props
  const className =
    props.className ??
    'max-h-44 overflow-y-auto rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-white/5'
  return (
    <ul className={className}>
      {rows.slice(0, limit).map(([kind, element]) => (
        <li key={`${element.type}${element.id}`} className="flex gap-2 py-0.5">
          <span className="w-14 shrink-0 font-medium text-zinc-500 dark:text-zinc-400">{kind}</span>
          {icon?.(element)}
          <span className="min-w-0 truncate font-mono">{describe(element)}</span>
        </li>
      ))}
      {rows.length > limit && (
        <li className="py-0.5 text-zinc-500 dark:text-zinc-400">and {rows.length - limit} more</li>
      )}
    </ul>
  )
}

/** The warnings under a field that names a product OSM must not copy from. They never block the upload. */
function Warnings(props: { id: string; items: readonly ChangesetWarning[] }) {
  if (props.items.length === 0) return null
  return (
    <ul id={props.id} className="flex flex-col gap-1 text-xs text-amber-700 dark:text-amber-300">
      {props.items.map((warning) => (
        <li key={warning.id} className="flex gap-1.5">
          <ExclamationTriangleIcon aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span>
            {warning.text}{' '}
            <a className="underline" href={COPYRIGHT_URL} target="_blank" rel="noopener noreferrer">
              OpenStreetMap copyright
            </a>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The inside of the save flyout: what changed, the changeset comment, and the upload. A successful
 * upload closes the flyout (`onSaved`), and the toast tells the changeset. A failure stays here.
 */
function SavePanel(props: {
  uploading: boolean
  onUploading: (uploading: boolean) => void
  onSaved: () => void
}) {
  const shell = useShell()
  const { config, editor } = shell
  const { uploading, onUploading, onSaved } = props
  const auth = useAuth()
  const { select } = useSelection()
  // the changeset's comment, hashtags and source: a draft that starts when the flyout opens (SaveButton, changeset-draft-store.ts)
  const draft = useChangesetDraft() ?? NO_DRAFT
  const {
    edit: editDraft,
    commit: commitDraftFields,
    reset: resetDraft,
  } = useChangesetDraftActions()
  const [failure, setFailure] = useState<string>()
  const noteId = useId()
  const commentId = useId()
  const sourceId = useId()
  const warningsId = useId()
  // what the person uploaded with before, and their recent changesets on the server (as iD's comment and source lists)
  const recent = useRecentChangesetValues()
  const sourceInput = sourceField(editor.presets?.field('source'), recent.sources)
  const warnings = changesetWarnings(draft)
  // read again after every edit
  const change = useEngine(() => pendingChange(editor))
  // the OSM API limits on what is changed: a tag too long for the API blocks the upload
  const errors = useEngine(() => uploadErrors(editor))
  const blocked = saveBlocked({ source: config.source, loggedIn: auth.user !== undefined, errors })
  const toOsm = config.loginServer === 'osm'
  const rows = rowsOf(change)
  const hashtags = draftHashtags(draft)

  // a message about this form: the block, or the failed upload. It stays here, next to the button.
  const note = blocked ?? failure
  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (blocked || uploading || rows.length === 0 || !draft.comment.trim()) return
        onUploading(true)
        setFailure(undefined)
        uploadEdits(shell, draft).then(
          ({ changesets, selection }) => {
            onUploading(false)
            // the comment and the sources are offered again next time
            changesetHistoryActions.remember(draft)
            // the next changeset starts again from the links (iD's clearSaved and flush)
            resetDraft()
            onSaved()
            // the features have the ids the server gave them: the URL and the selection follow
            select(selection)
            // the one message of a success: a toast, with the changesets linked
            notify.done(
              <>
                Your edits are {changesets.length === 1 ? 'changeset' : 'changesets'}{' '}
                {changesets.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ', '}
                    <a
                      className="font-medium underline"
                      href={`${CHANGESET_URL[config.loginServer]}${id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {id}
                    </a>
                  </span>
                ))}{' '}
                {toOsm ? 'on OpenStreetMap.' : 'on the development server.'}
              </>,
              // the changeset link is worth opening later: it stays, and closes with its ×
              { lasting: true },
            )
          },
          (error: unknown) => {
            onUploading(false)
            setFailure(error instanceof Error ? error.message : 'The upload failed.')
          },
        )
      }}
    >
      <div>
        <h2 className="text-base font-semibold">Save your edits</h2>
        <p className="text-zinc-500 dark:text-zinc-400">
          {rows.length === 0 ? 'Nothing to save yet.' : summaryOf(change)}
        </p>
      </div>
      {rows.length > 0 && <ChangeRows rows={rows} />}
      <div className="flex flex-col gap-1">
        <label htmlFor={commentId} className="font-medium">
          Changeset comment
        </label>
        <SuggestTextarea
          id={commentId}
          label="Your recent comments"
          rows={3}
          maxLength={255}
          value={draft.comment}
          suggestions={commentSuggestions(recent.comments, draft.comment)}
          onChange={(comment) => editDraft({ comment })}
          onBlur={() => commitDraftFields(Date.now())}
          placeholder="What did you change, and from which source?"
          className={FIELD}
          describedBy={warnings.comment.length > 0 ? `${warningsId}-comment` : undefined}
        />
        {hashtags && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Hashtags: {hashtags}</span>
        )}
        <Warnings id={`${warningsId}-comment`} items={warnings.comment} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={sourceId} className="font-medium">
          Source
        </label>
        <SemiComboField
          id={sourceId}
          field={sourceInput}
          tags={draft.source === undefined ? {} : { source: draft.source }}
          onChange={(_key, source) => {
            editDraft({ source })
            commitDraftFields(Date.now())
          }}
        />
        {recent.sources.length > 0 && (
          <div role="group" aria-label="Recent sources" className="flex flex-wrap gap-1.5">
            {sourceChips(recent.sources).map((value) => {
              const on = hasSource(draft.source, value)
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  title={value}
                  onClick={() => {
                    editDraft({ source: toggleSource(draft.source, value) })
                    commitDraftFields(Date.now())
                  }}
                  className={`${SOURCE_CHIP} ${on ? SOURCE_CHIP_ON : SOURCE_CHIP_OFF}`}
                >
                  {on && <CheckIcon aria-hidden="true" className="-ml-1 size-3.5 shrink-0" />}
                  <span className="min-w-0 truncate">{sourceLabel(sourceInput, value)}</span>
                </button>
              )
            })}
          </div>
        )}
        <Warnings id={`${warningsId}-source`} items={warnings.source} />
      </div>
      <button
        type="submit"
        disabled={blocked !== undefined || uploading || rows.length === 0 || !draft.comment.trim()}
        aria-describedby={note ? noteId : undefined}
        className="w-full cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 enabled:hover:bg-blue-500 disabled:cursor-default disabled:opacity-50"
      >
        {uploading
          ? 'Uploading…'
          : toOsm
            ? 'Upload to OpenStreetMap'
            : 'Upload to the development server'}
      </button>
      {note && (
        <p id={noteId} role="status" className="text-xs text-amber-700 dark:text-amber-300">
          {note}
        </p>
      )}
    </form>
  )
}

/** The top bar's save button: shows that there are edits and opens the save flyout */
export function SaveButton() {
  const { editor } = useShell()
  // iD reads the address's comment, hashtags and source once, at load, and removes them from it (behavior/hash.js)
  const [links, setLinks] = useQueryStates(linkParams, { history: 'replace' })
  const { readLinks, open: openDraft } = useChangesetDraftActions()
  // read once, at the first render of the page: later changes of the address are not read again
  const linksRead = useRef(false)
  useEffect(
    function readAddressLinks() {
      if (linksRead.current) return
      linksRead.current = true
      readLinks(linksOf(links))
      if (links.comment !== null || links.hashtags !== null || links.source !== null) {
        void setLinks({ comment: null, hashtags: null, source: null })
      }
    },
    [links, readLinks, setLinks],
  )
  const hasChanges = useEngine(() => editor.history.hasChanges())
  const [open, setOpen] = useState(false)
  // while an upload runs the flyout cannot close, so its panel stays and no second upload can start
  const [uploading, setUploading] = useState(false)
  useEffect(
    function warnBeforeClosingWhileUploading() {
      if (!uploading) return
      // an open changeset would be left behind if the tab closed now, so the browser asks first
      const onBeforeUnload = (event: BeforeUnloadEvent) => {
        event.preventDefault()
      }
      window.addEventListener('beforeunload', onBeforeUnload)
      return () => window.removeEventListener('beforeunload', onBeforeUnload)
    },
    [uploading],
  )
  const auth = useAuth()
  // Nobody can save before logging in, so the button is not shown then (the hooks above stay: the address links are read either way)
  if (auth.user === undefined) return null
  return (
    <Tooltip
      label={hasChanges ? m.topbar_save_edits() : m.topbar_nothing_to_save()}
      placement="bottom"
      disabled={!hasChanges}
    >
      <Flyout
        label={m.topbar_save_edits()}
        placement="bottom-end"
        className="w-[26rem]"
        open={open}
        onOpenChange={(next) => {
          if (uploading) return
          // the draft starts when the flyout is opened, once per opening (iD's initChangeset), not on each render
          if (next) openDraft(Date.now())
          setOpen(next)
        }}
        trigger={
          <button type="button" disabled={!hasChanges} className={toolButtonClass(true)}>
            <ArrowUpTrayIcon aria-hidden="true" className="size-5" />
            <span className="max-sm:sr-only">{m.topbar_save()}</span>
            {hasChanges && (
              // on the corner, so the button keeps its width when the dot comes and goes
              <span
                aria-label="unsaved edits"
                className="absolute -top-1 -right-1 size-2.5 rounded-full bg-blue-600 ring-2 ring-white dark:ring-zinc-900"
              />
            )}
          </button>
        }
      >
        <SavePanel
          uploading={uploading}
          onUploading={setUploading}
          onSaved={() => {
            setOpen(false)
          }}
        />
      </Flyout>
    </Tooltip>
  )
}
