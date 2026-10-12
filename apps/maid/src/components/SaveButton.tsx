import { ArrowUpTrayIcon } from '@heroicons/react/20/solid'
import { Flyout, toolButtonClass } from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import { useAuth } from '../auth'
import { DEV_API } from '../config'
import { editor, useEngine } from '../editor'
import { changesetTags, summaryOf, type ChangeElement } from '../save/osm-change'
import { pendingChange, saveBlocked, uploadEdits } from '../save/save'

const LISTED = 12

function describe(element: ChangeElement) {
  const tags = Object.entries(element.tags)
  const main = tags.find(([key]) => key !== 'name' && !key.includes(':'))
  const what = element.tags.name ?? (main ? `${main[0]}=${main[1]}` : 'no tags')
  return `${element.type} ${element.id < 0 ? 'new' : element.id} · ${what}`
}

/** The inside of the save flyout: what changed, the changeset comment, and the upload */
function SavePanel() {
  const auth = useAuth()
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'done'; id: number }
    | { kind: 'failed'; text: string }
  >({ kind: 'idle' })
  // read again after every edit
  const change = useEngine(() => pendingChange())
  const blocked = saveBlocked(auth.user !== undefined)
  const rows = [
    ...change.create.map((e) => ['Created', e] as const),
    ...change.modify.map((e) => ['Changed', e] as const),
    ...change.delete.map((e) => ['Deleted', e] as const),
  ]
  const hashtags = changesetTags(comment, '').hashtags

  if (status.kind === 'done') {
    return (
      <div className="p-4">
        <h2 className="text-base font-semibold">Saved</h2>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Your edits are changeset{' '}
          <a
            className="font-medium text-blue-600 underline dark:text-blue-400"
            href={`${DEV_API}/changeset/${status.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {status.id}
          </a>{' '}
          on the development server.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 w-full cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          Load the map again
        </button>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (blocked || status.kind === 'busy' || rows.length === 0 || !comment.trim()) return
        setStatus({ kind: 'busy' })
        uploadEdits(comment).then(
          (id) => setStatus({ kind: 'done', id }),
          (error: unknown) =>
            setStatus({
              kind: 'failed',
              text: error instanceof Error ? error.message : 'The upload failed.',
            }),
        )
      }}
    >
      <div>
        <h2 className="text-base font-semibold">Save your edits</h2>
        <p className="text-zinc-500 dark:text-zinc-400">
          {rows.length === 0 ? 'Nothing to save yet.' : summaryOf(change)}
        </p>
      </div>
      {rows.length > 0 && (
        <ul className="max-h-44 overflow-y-auto rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-white/5">
          {rows.slice(0, LISTED).map(([kind, element]) => (
            <li key={`${element.type}${element.id}`} className="flex gap-2 py-0.5">
              <span className="w-14 shrink-0 font-medium text-zinc-500 dark:text-zinc-400">
                {kind}
              </span>
              <span className="min-w-0 truncate font-mono">{describe(element)}</span>
            </li>
          ))}
          {rows.length > LISTED && (
            <li className="py-0.5 text-zinc-500 dark:text-zinc-400">
              and {rows.length - LISTED} more
            </li>
          )}
        </ul>
      )}
      <label className="flex flex-col gap-1">
        <span className="font-medium">Changeset comment</span>
        <textarea
          rows={3}
          maxLength={255}
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
          placeholder="What did you change, and from which source?"
          className="w-full rounded-md border border-zinc-950/10 bg-white px-2 py-1.5 text-sm placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-950 dark:placeholder:text-zinc-500"
        />
        {hashtags && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Hashtags: {hashtags}</span>
        )}
      </label>
      <button
        type="submit"
        disabled={
          blocked !== undefined || status.kind === 'busy' || rows.length === 0 || !comment.trim()
        }
        className="w-full cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 enabled:hover:bg-blue-500 disabled:cursor-default disabled:opacity-50"
      >
        {status.kind === 'busy' ? 'Uploading…' : 'Upload to the development server'}
      </button>
      {(blocked ?? (status.kind === 'failed' ? status.text : undefined)) && (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
          {blocked ?? (status.kind === 'failed' ? status.text : '')}
        </p>
      )}
    </form>
  )
}

/** The top bar's save button: shows that there are edits and opens the save flyout */
export function SaveButton() {
  const hasChanges = useEngine(() => editor.history.hasChanges())
  return (
    <Flyout
      label="Save your edits"
      placement="bottom-end"
      className="w-[26rem]"
      trigger={
        <button
          type="button"
          title={hasChanges ? 'Save your edits' : 'Nothing to save yet'}
          disabled={!hasChanges}
          className={toolButtonClass(true)}
        >
          <ArrowUpTrayIcon aria-hidden="true" className="size-5" />
          <span className="max-sm:sr-only">Save</span>
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
      <SavePanel />
    </Flyout>
  )
}
