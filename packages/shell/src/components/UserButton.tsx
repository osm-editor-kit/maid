import { ArrowRightEndOnRectangleIcon, UserCircleIcon } from '@heroicons/react/20/solid'
import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { m } from '@osm-editor-kit/maid-i18n'
import {
  Flyout,
  ThemeSwitch,
  toolButtonClass,
  Tooltip,
  useAppliedTheme,
} from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import { useAuth } from '../auth'
import { useShell } from '../shell-context'
import { useThemeSetting } from '../url/state'
import { LanguageSelect } from './LanguageSelect'
import { ServerSelect } from './ServerSelect'

const ACTION =
  'w-full cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50'

/**
 * The account button at the end of the top bar: "Log in" or the user, and in its flyout the
 * log out and the settings that belong to the person, such as light or dark. The account is
 * one on OpenStreetMap, or on its development server when the data is the development server's (see auth.ts).
 * Below the login come the entries of modules (`account.item`), for jobs that are rarely needed.
 */
export function UserButton() {
  const auth = useAuth()
  const { auth: authActions, config, editor, engine } = useShell()
  const items = useExtensionPoint(editor, 'account.item')
  const [open, setOpen] = useState(false)
  const { login, logout } = authActions
  // always mounted (the top bar), so the page's theme follows the URL even while the flyout is closed
  const theme = useThemeSetting()
  useAppliedTheme(theme.value)
  const tip = auth.user ? m.topbar_logged_in_as({ user: auth.user }) : m.topbar_log_in()
  return (
    <Tooltip label={tip} placement="bottom">
      <Flyout
        label={m.topbar_account()}
        placement="bottom-end"
        className="w-80"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button type="button" className={toolButtonClass(true)}>
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
                  ? 'OpenStreetMap. What you save changes the real map.'
                  : 'Local test data. Nothing is saved; the login goes to the development server.'}
            </p>
          </div>
        </div>
        <div className="px-4 pb-4">
          {auth.user ? (
            <button
              type="button"
              onClick={() => logout()}
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
        {items.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-zinc-950/5 px-2 py-2 dark:border-white/10">
            {items.map((item) => (
              <item.component
                key={item.id}
                editor={editor}
                engine={engine}
                close={() => setOpen(false)}
              />
            ))}
          </div>
        )}
        <div className="rounded-b-2xl bg-zinc-50 dark:bg-white/5">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="font-medium">{m.topbar_appearance()}</span>
            <ThemeSwitch value={theme.value} onChange={theme.choose} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-zinc-950/5 px-4 py-3 dark:border-white/10">
            <span className="font-medium">{m.topbar_language()}</span>
            <LanguageSelect />
          </div>
          {config.serverChoice && <ServerSelect />}
        </div>
      </Flyout>
    </Tooltip>
  )
}
