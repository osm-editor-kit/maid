import type { DockViewProps } from '@osm-editor-kit/maid-ui'
import { formatDate, noteWebUrl, type Note } from './model.ts'
import { useNotesSession } from './store.ts'

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
      {open ? 'Open' : 'Closed'}
    </span>
  )
}

/** The chosen note with its comments, as plain text. Nothing here is written back. */
function NoteDetails({ note }: { note: Note }) {
  return (
    <article className="max-w-2xl p-3 text-xs">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">Note {note.id}</h3>
        <Status note={note} />
      </header>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-zinc-600 dark:text-zinc-400">
        <dt>Opened</dt>
        <dd>{formatDate(note.created)} UTC</dd>
        {note.closed && (
          <>
            <dt>Closed</dt>
            <dd>{formatDate(note.closed)} UTC</dd>
          </>
        )}
        <dt>Position</dt>
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
              {comment.user ?? 'anonymous'} · {formatDate(comment.date)} · {comment.action}
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
          Open on openstreetmap.org
        </a>
      </p>
      <p className="mt-2 text-zinc-500 dark:text-zinc-400">Writing notes comes with the login.</p>
    </article>
  )
}

/** The dock view "Notes": the chosen note, or a quiet line when none is chosen */
export function NotesDock(_props: DockViewProps) {
  const chosen = useNotesSession((s) => s.chosen)
  const note = useNotesSession((s) => (chosen === null ? undefined : s.notes[chosen]))
  if (chosen === null)
    return <p className={QUIET}>No note chosen. Pick one in the Notes panel or on the map.</p>
  if (!note) return <p className={QUIET}>Note {chosen} is not loaded.</p>
  return <NoteDetails note={note} />
}
