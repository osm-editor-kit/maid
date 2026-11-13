import { ArrowTopRightOnSquareIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { nearbyChallenges } from '@osm-editor-kit/maid-maproulette'
import {
  MAPROULETTE_BUTTON,
  MAPROULETTE_BUTTON_SECONDARY,
  MAPROULETTE_CARD,
  MAPROULETTE_QUOTE,
  MAPROULETTE_SURFACE,
  MAPROULETTE_TOPBAR,
  Markdown,
} from '@osm-editor-kit/maid-ui'
import { useId, useState } from 'react'
import { m } from './messages.ts'
import { RouletteIcon } from './RouletteIcon.tsx'
import { challengeUrl, goToTask, type Shared } from './shared.ts'
import { challengeName, shownStatus, tasksShown, useMapRoulette } from './store.ts'
import { challengeOfInput } from './url.ts'

/** The challenge's name next to the top bar button while one is open */
export function createBadge(shared: Shared) {
  return function MapRouletteBadge() {
    const challengeId = useMapRoulette(shared.store, (state) => state.challengeId)
    const name = useMapRoulette(shared.store, (state) =>
      state.challengeId === null ? undefined : challengeName(state, state.challengeId),
    )
    const waiting = useMapRoulette(shared.store, (state) => state.earmarks.length)
    if (challengeId === null && waiting === 0) return null
    return (
      <span
        className={`-mr-1.5 inline-flex max-w-40 items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs font-medium max-sm:hidden ${MAPROULETTE_TOPBAR}`}
      >
        {challengeId !== null && <span className="truncate">{name ?? `#${challengeId}`}</span>}
        {waiting > 0 && (
          <span
            title={m.mr_waiting_title({ count: waiting })}
            className="rounded-full bg-teal-600 px-1.5 text-white"
          >
            {waiting}
          </span>
        )}
      </span>
    )
  }
}

/**
 * The flyout of the top bar button: the open challenge with its description and the next task, or a challenge number
 * (or a MapRoulette link) to open and the challenges that have tasks in the map view; below, the login.
 */
export function createPanel(shared: Shared) {
  const { store, controller } = shared

  return function MapRoulettePanel() {
    const challengeId = useMapRoulette(store, (state) => state.challengeId)
    const challenge = useMapRoulette(store, (state) =>
      state.challengeId === null ? undefined : state.challenges[state.challengeId],
    )
    return (
      <div data-testid="maproulette-panel" className="flex flex-col gap-3 p-4 text-sm">
        <div className="flex items-center gap-2">
          <RouletteIcon className="size-5 text-teal-700 dark:text-teal-300" />
          <h2 className="text-base font-semibold">MapRoulette</h2>
        </div>
        {challengeId === null ? (
          <ChooseChallenge shared={shared} />
        ) : (
          <div className={`-mx-4 flex flex-col gap-2 px-4 py-3 ${MAPROULETTE_SURFACE}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-teal-800 dark:text-teal-200">
                  {m.mr_challenge_number({ id: challengeId })}
                </p>
                <h3 className="font-semibold">
                  {challenge?.state === 'ready'
                    ? (challenge.value.name ?? m.mr_challenge_number({ id: challengeId }))
                    : challenge?.state === 'failed'
                      ? challenge.reason
                      : m.mr_loading()}
                </h3>
              </div>
              <button
                type="button"
                aria-label={m.mr_close_challenge()}
                title={m.mr_close_challenge()}
                onClick={() => controller.openChallenge(null)}
                className="shrink-0 cursor-pointer rounded p-1 hover:bg-white/60 dark:hover:bg-white/10"
              >
                <XMarkIcon aria-hidden="true" className="size-4" />
              </button>
            </div>
            {challenge?.state === 'ready' && challenge.value.description && (
              <div className={`max-h-48 overflow-y-auto ${MAPROULETTE_QUOTE}`}>
                <Markdown text={challenge.value.description} />
              </div>
            )}
            <ChallengeTasks shared={shared} challengeId={challengeId} />
            <a
              className="inline-flex items-center gap-1 self-start text-xs underline"
              href={challengeUrl(shared, challengeId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {m.mr_view_on_maproulette()}
              <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-3.5" />
            </a>
          </div>
        )}
        <Login shared={shared} />
      </div>
    )
  }
}

/** The open tasks of the challenge in view, and the button to the nearest one */
function ChallengeTasks({ shared, challengeId }: { shared: Shared; challengeId: string }) {
  const { store, controller } = shared
  const tasks = useMapRoulette(store, (state) => state.tasks)
  const finished = useMapRoulette(store, (state) => state.finished)
  const earmarks = useMapRoulette(store, (state) => state.earmarks)
  const zoomedOut = useMapRoulette(store, (state) => state.zoomedOut)
  const center = useMapRoulette(store, (state) => state.view?.center)
  const open = tasksShown({ tasks, challengeId }).filter((task) => {
    const shown = shownStatus({ finished, earmarks }, task)
    return !shown.queued && (shown.status === 0 || shown.status === 3)
  })
  if (zoomedOut) return <p className="text-xs">{m.mr_zoom_in()}</p>
  const [nearest] = center
    ? open
        .map((task) => ({ task, loc: controller.locationOf(String(task.id)) }))
        .filter((row) => row.loc)
        .sort(
          (a, b) =>
            Math.hypot((a.loc?.[0] ?? 0) - center[0], (a.loc?.[1] ?? 0) - center[1]) -
            Math.hypot((b.loc?.[0] ?? 0) - center[0], (b.loc?.[1] ?? 0) - center[1]),
        )
    : []
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs">{m.mr_open_in_view({ count: open.length })}</span>
      {nearest && (
        <button
          type="button"
          className={MAPROULETTE_BUTTON}
          onClick={() => goToTask(shared, String(nearest.task.id))}
        >
          {m.mr_next_nearest()}
        </button>
      )}
    </div>
  )
}

/** A challenge number or link to open, and the challenges with open tasks in the view */
function ChooseChallenge({ shared }: { shared: Shared }) {
  const { store, controller } = shared
  const inputId = useId()
  const [text, setText] = useState('')
  const [invalid, setInvalid] = useState(false)
  const tasks = useMapRoulette(store, (state) => state.tasks)
  const challenges = useMapRoulette(store, (state) => state.challenges)
  const view = useMapRoulette(store, (state) => state.view)
  const zoomedOut = useMapRoulette(store, (state) => state.zoomedOut)
  const loading = useMapRoulette(store, (state) => state.loading)
  const error = useMapRoulette(store, (state) => state.error)
  const [west, south, east, north] = view?.bbox ?? [0, 0, 0, 0]
  const inView = Object.values(tasks).filter(
    (task) =>
      task.point.lng >= west &&
      task.point.lng <= east &&
      task.point.lat >= south &&
      task.point.lat <= north,
  )
  const names: Record<string, string | undefined> = {}
  for (const [id, loaded] of Object.entries(challenges))
    if (loaded.state === 'ready') names[id] = loaded.value.name
  const rows = view ? nearbyChallenges(inView, view.center, names) : []
  return (
    <>
      <form
        className="flex flex-col gap-1"
        onSubmit={(event) => {
          event.preventDefault()
          const link = challengeOfInput(text)
          setInvalid(link === null)
          if (!link) return
          controller.openChallenge(link.challengeId)
          if (link.taskId) goToTask(shared, link.taskId)
          setText('')
        }}
      >
        <label htmlFor={inputId} className="font-medium">
          {m.mr_open_label()}
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={m.mr_open_placeholder()}
            aria-invalid={invalid}
            className="min-w-0 flex-1 rounded-md border border-zinc-950/10 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-zinc-950"
          />
          <button type="submit" className={MAPROULETTE_BUTTON}>
            {m.mr_open()}
          </button>
        </div>
        {invalid && (
          <p className="text-xs text-amber-700 dark:text-amber-300">{m.mr_open_invalid()}</p>
        )}
      </form>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-medium">{m.mr_nearby_title()}</h3>
        {zoomedOut ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.mr_zoom_in()}</p>
        ) : error ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {loading ? m.mr_loading() : m.mr_nearby_none()}
          </p>
        ) : (
          <ul
            data-testid="maproulette-nearby"
            className="flex max-h-64 flex-col gap-1 overflow-y-auto"
          >
            {rows.map((row) => (
              <li key={row.challengeId}>
                <button
                  type="button"
                  onClick={() => controller.openChallenge(row.challengeId)}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left ring-1 ring-teal-700/15 hover:ring-teal-700/40 dark:ring-teal-300/15 ${MAPROULETTE_CARD}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {row.name ?? m.mr_challenge_number({ id: row.challengeId })}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {m.mr_challenge_number({ id: row.challengeId })} ·{' '}
                      {formatDistance(row.nearestDistance)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-teal-600/15 px-2 text-xs font-medium text-teal-800 dark:bg-teal-400/20 dark:text-teal-200">
                    {m.mr_open_count({ count: row.openCount })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function formatDistance(metres: number) {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`
}

/**
 * The login to MapRoulette: a token pasted here, kept in this browser. Reading needs none; sending a status does.
 * MapRoulette is changing how editors log in, so this says so and links to the person's MapRoulette profile.
 */
function Login({ shared }: { shared: Shared }) {
  const { store, controller } = shared
  const token = useMapRoulette(store, (state) => state.token)
  const inputId = useId()
  const [editing, setEditing] = useState(false)
  return (
    <details className="text-xs" open={editing || undefined}>
      <summary className="cursor-pointer text-zinc-600 dark:text-zinc-300">
        {token ? m.mr_login_set() : m.mr_login_none()}
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">
        <p className="text-zinc-500 dark:text-zinc-400">{m.mr_login_hint()}</p>
        <label htmlFor={inputId} className="font-medium">
          {m.mr_login_label()}
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            type="password"
            autoComplete="off"
            value={token}
            onFocus={() => setEditing(true)}
            onChange={(event) => controller.setToken(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-zinc-950/10 bg-white px-2 py-1 font-mono dark:border-white/10 dark:bg-zinc-950"
          />
          {token && (
            <button
              type="button"
              className={MAPROULETTE_BUTTON_SECONDARY}
              onClick={() => controller.setToken('')}
            >
              {m.mr_login_clear()}
            </button>
          )}
        </div>
        <a
          className="underline"
          href={`${shared.siteUrl}/user/profile`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {m.mr_login_link()}
        </a>
      </div>
    </details>
  )
}
