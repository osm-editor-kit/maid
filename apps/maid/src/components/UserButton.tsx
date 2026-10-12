import { ArrowRightEndOnRectangleIcon, UserCircleIcon } from '@heroicons/react/20/solid'
import { Flyout, ThemeSwitch, toolButtonClass } from '@osm-editor-kit/maid-ui'
import { useState } from 'react'

const ACTION =
  'w-full cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500'

/**
 * The account button at the end of the top bar: "Log in" or the user, and in its flyout the
 * log out and the settings that belong to the person, such as light or dark.
 *
 * The login is a stand-in until Maid signs in to OSM (step C2): it only switches what this
 * button shows and talks to no server.
 */
export function UserButton() {
  const [signedIn, setSignedIn] = useState(false)
  return (
    <Flyout
      label="Account and appearance"
      placement="bottom-end"
      className="w-80"
      trigger={
        <button
          type="button"
          title={signedIn ? 'Account' : 'Log in'}
          className={toolButtonClass(!signedIn)}
        >
          {signedIn ? (
            <UserCircleIcon aria-label="Account" className="size-5" />
          ) : (
            <>
              <ArrowRightEndOnRectangleIcon aria-hidden="true" className="size-5" />
              <span className="max-sm:sr-only">Log in</span>
            </>
          )}
        </button>
      }
    >
      <div className="flex items-center gap-3 p-4">
        <UserCircleIcon aria-hidden="true" className="size-10 text-zinc-400 dark:text-zinc-500" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{signedIn ? 'Demo mapper' : 'Not logged in'}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            A stand-in: logging in to OpenStreetMap is not built yet.
          </p>
        </div>
      </div>
      <div className="px-4 pb-4">
        {signedIn ? (
          <button
            type="button"
            onClick={() => setSignedIn(false)}
            className={`${ACTION} text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-white/5`}
          >
            Log out
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSignedIn(true)}
            className={`${ACTION} bg-blue-600 text-white hover:bg-blue-500`}
          >
            Log in
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-b-2xl bg-zinc-50 px-4 py-3 dark:bg-white/5">
        <span className="font-medium">Appearance</span>
        <ThemeSwitch />
      </div>
    </Flyout>
  )
}
