import { ArrowRightEndOnRectangleIcon, UserCircleIcon } from '@heroicons/react/20/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import { Flyout, ThemeSwitch, toolButtonClass } from '@osm-editor-kit/maid-ui'
import { useAuth } from '../auth'
import { useShell } from '../shell-context'
import { LanguageSelect } from './LanguageSelect'
import { ServerSelect } from './ServerSelect'

const ACTION =
  'w-full cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50'

/**
 * The account button at the end of the top bar: "Log in" or the user, and in its flyout the
 * log out and the settings that belong to the person, such as light or dark. The account is
 * one on the OSM development server (see auth.ts).
 */
export function UserButton() {
  const auth = useAuth()
  const { auth: authActions, config } = useShell()
  const { login, logout } = authActions
  return (
    <Flyout
      label={m.topbar_account()}
      placement="bottom-end"
      className="w-80"
      trigger={
        <button
          type="button"
          title={auth.user ? m.topbar_logged_in_as({ user: auth.user }) : m.topbar_log_in()}
          className={toolButtonClass(true)}
        >
          {auth.user ? (
            <>
              <UserCircleIcon aria-hidden="true" className="size-5" />
              <span className="max-w-32 truncate max-sm:sr-only">{auth.user}</span>
            </>
          ) : (
            <>
              <ArrowRightEndOnRectangleIcon aria-hidden="true" className="size-5" />
              <span className="max-sm:sr-only">{m.topbar_log_in()}</span>
            </>
          )}
        </button>
      }
    >
      <div className="flex items-center gap-3 p-4">
        <UserCircleIcon
          aria-hidden="true"
          className="size-10 shrink-0 text-zinc-400 dark:text-zinc-500"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold">{auth.user ?? 'Not logged in'}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {config.source === 'dev'
              ? 'OpenStreetMap development server. Nothing is saved to the real map.'
              : config.source === 'osm'
                ? 'OpenStreetMap, read only. Logging in and saving need the development server.'
                : 'Local test data. Nothing is saved.'}
          </p>
        </div>
      </div>
      <div className="px-4 pb-4">
        {auth.user ? (
          <button
            type="button"
            onClick={() => void logout()}
            className={`${ACTION} text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-white/5`}
          >
            Log out
          </button>
        ) : (
          <button
            type="button"
            disabled={auth.unavailable !== undefined || auth.busy}
            onClick={() => void login()}
            className={`${ACTION} bg-blue-600 text-white enabled:hover:bg-blue-500`}
          >
            {auth.busy ? 'Waiting for the login window…' : 'Log in'}
          </button>
        )}
        {(auth.error ?? auth.unavailable) && (
          <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            {auth.error ?? auth.unavailable}
          </p>
        )}
      </div>
      <div className="rounded-b-2xl bg-zinc-50 dark:bg-white/5">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="font-medium">{m.topbar_appearance()}</span>
          <ThemeSwitch />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-zinc-950/5 px-4 py-3 dark:border-white/10">
          <span className="font-medium">{m.topbar_language()}</span>
          <LanguageSelect />
        </div>
        {config.serverChoice && <ServerSelect />}
      </div>
    </Flyout>
  )
}
