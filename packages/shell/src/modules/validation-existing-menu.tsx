import { m } from '@osm-editor-kit/maid-i18n'
import { useState } from 'react'
import {
  type ExistingMode,
  useExistingActions,
  useExistingMode,
} from './validation-existing-store.ts'

/** The settings in the order the menu lists them */
const MODES: readonly ExistingMode[] = ['quiet', 'session', 'always']

/** The words of each setting, read when the menu is drawn (the language can change) */
function labelOf(mode: ExistingMode): string {
  if (mode === 'session') return m.issues_setting_session()
  if (mode === 'always') return m.issues_setting_always()
  return m.issues_setting_quiet()
}

/**
 * The "…" menu of the Issues section and of the Issues list: one setting, issues in existing data (Quiet, This
 * session, Always). It is a radio group, so a screen reader hears the choice that is made.
 */
export function ExistingMenu() {
  const mode = useExistingMode()
  const { setMode } = useExistingActions()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex justify-end">
      <button
        type="button"
        aria-label={m.issues_menu_button()}
        title={m.issues_menu_button()}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="h-6 min-w-6 cursor-pointer rounded-md px-1.5 text-sm leading-none text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        …
      </button>
      {open && (
        <div
          role="radiogroup"
          aria-label={m.issues_setting_label()}
          className="absolute top-full right-0 z-10 mt-1 flex w-56 flex-col gap-0.5 rounded-md bg-white p-1 shadow-lg inset-ring-1 inset-ring-zinc-950/10 dark:bg-zinc-800 dark:inset-ring-white/10"
        >
          <p className="px-2 pt-1 pb-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            {m.issues_setting_label()}
          </p>
          {MODES.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={mode === item}
              onClick={() => {
                setMode(item)
                setOpen(false)
              }}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-zinc-700"
            >
              <span aria-hidden="true" className="w-3 text-center">
                {mode === item ? '•' : ''}
              </span>
              {labelOf(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
