import { Time, type DockViewProps } from '@osm-editor-kit/maid-ui'
import { m } from './messages.ts'
import { actionLabel, noteWebUrl, type Note } from './model.ts'
import { useChosenNote } from './query.ts'
import { useChosenNoteId } from './store.ts'

const QUIET = 'p-3 text-xs text-zinc-500 dark:text-zinc-400'

function Status({ note }: { note: Note }) {
  const open = note.status === 'open'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium inset-ring-1 ${
        open
          ? 'bg-orange-50 text-orange-800 inset-ring-orange-600/20 dark:bg-orange-400/10 dark:text-orange-300 dark:inset-ring-orange-400/30'
          : 'bg-zinc-50 text-zinc-600 inset-ring-zinc-500/20 dark:bg-zinc-400/10 dark:text-zinc-300 dark:inset-ring-zinc-400/30'
      }`}
    >
      {open ? m.notes_status_open() : m.notes_status_closed()}
    </span>
  )
}

/** The chosen note with its comments, as plain text. Nothing here is written back. */
function NoteDetails({ note }: { note: Note }) {
  return (
    <article className="max-w-2xl p-3 text-xs">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{m.notes_dock_title({ id: note.id })}</h3>
        <Status note={note} />
      </header>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-zinc-600 dark:text-zinc-400">
        <dt>{m.notes_dock_opened()}</dt>
        <dd>
          <Time value={note.created} primary="absolute" />
        </dd>
        {note.closed && (
          <>
            <dt>{m.notes_dock_closed()}</dt>
            <dd>
              <Time value={note.closed} primary="absolute" />
            </dd>
          </>
        )}
        <dt>{m.notes_dock_position()}</dt>
        <dd>
          {note.lat.toFixed(5)}, {note.lon.toFixed(5)}
        </dd>
      </dl>
      <ol className="mt-3 space-y-3">
        {note.comments.map((comment, index) => (
          <li
            key={`${comment.date}-${index}`}
            className="border-l-2 border-zinc-950/10 pl-3 dark:border-white/10"
          >
            <p className="text-zinc-500 dark:text-zinc-400">
              {comment.user ?? m.notes_comment_anonymous()} · <Time value={comment.date} /> ·{' '}
              {actionLabel(comment.action)}
            </p>
            <p className="mt-0.5 text-sm whitespace-pre-wrap">{comment.text}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3">
        <a
          href={noteWebUrl(note.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {m.notes_open_on_osm()}
        </a>
      </p>
      <p className="mt-2 text-zinc-500 dark:text-zinc-400">{m.notes_write_later()}</p>
    </article>
  )
}

/** The dock view "Notes": the chosen note, or a quiet line when none is chosen */
export function NotesDock(_props: DockViewProps) {
  const chosen = useChosenNoteId()
  const note = useChosenNote()
  if (chosen === null) return <p className={QUIET}>{m.notes_dock_none()}</p>
  if (!note) return <p className={QUIET}>{m.notes_dock_not_loaded({ id: chosen })}</p>
  return <NoteDetails note={note} />
}
