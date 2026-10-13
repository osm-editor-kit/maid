/*
 * Notices in Maid: where each one is, what starts it, how long it stays, and its kind.
 *
 *   (a) an event that happened and needs no action ("Saved changeset 123", "Imported 2: ...")
 *       -> a toast that goes away (`notify.done`, `notify.info`, `notify.failed` for a failure
 *          that was not caused by a form)
 *   (b) a standing condition of the session that the person must know while it lasts ("open in
 *       another tab: edits here are lost on reload") -> a toast that stays until the condition
 *       ends, one per condition (a stable id), updated in place, with no close button because
 *       closing it would hide a condition that still holds (`notify.standing`, `notify.clear`)
 *   (c) guidance for a mode the person is in ("Click two points to measure. Escape cancels",
 *       the favourite number while Alt is held, "Zoom in to load data") -> NOT a toast: it stays
 *       on the map, where the mode is, and goes when the mode ends
 *   (d) a message about one control or one form ("The value is too long", a refused lens file,
 *       the save flyout's blocked sentence, "Could not load this photo") -> NOT a toast: it stays
 *       next to its control, tied to it with aria-describedby
 *
 * Inventory, as of 2026-10-13 (grep for role="status", role="alert" and aria-live in apps/maid
 * and packages/*):
 *
 * | Notice | Where | Starts when | Stays | Kind | Why |
 * | --- | --- | --- | --- | --- | --- |
 * | "This map is open in another tab. Edits made here are lost on reload." | RestorePrompt.tsx | the journal is locked by another tab | while locked | b, moved | a condition of the session; no close button |
 * | "Edits are not kept across a reload: <message>" | RestorePrompt.tsx | the browser's storage fails | while failed | b, moved | the same condition family, same id |
 * | "Your edits are changeset N on the development server." | SaveButton.tsx | an upload succeeds | 4 s | a, moved | an event; the flyout keeps its own "Saved" panel because it is the form's state and blocks a second upload |
 * | "Added ... as member N after ..." (placement line) | modules/relations.tsx | a way is added to a relation | 4 s | a, moved | an event with its result; used to stay in the section until the next change |
 * | "Imported N: names." | packages/module-lenses LensPanel.tsx | a lens file is imported | 4 s | a, moved | an event |
 * | "Zoom in to load data" | MapNotices.tsx | the zoom is below minDataZoom | while zoomed out | c | guidance for the map's state, on the map |
 * | "Click two points to measure. Escape cancels." | MapView.tsx | measuring is on | while measuring | c | guidance for a mode |
 * | "⌥ 3 · name" / "no favourite 7" | FavouriteHint.tsx | Alt is held and digits are typed | while typing | c | guidance for a key sequence |
 * | "Save blocked" sentence (tag too long, not logged in) | SaveButton.tsx | the save form cannot upload | while blocked | d | a message about the form's own submit |
 * | Upload failure text | SaveButton.tsx | the upload fails | until the next try | d | the form's result; the person retries there |
 * | Login failure, "Login is switched off ...", "Open Maid at ... to log in." | UserButton.tsx | login fails or cannot be tried here | until the next try | d | it explains a disabled control |
 * | Lens file refused: too large, parse errors | packages/module-lenses LensPanel.tsx | a refused lens file | until the next import | d | a message about the import control |
 * | Add-layer errors | packages/module-data-layers Panel.tsx | the add form is refused | until the next submit | d | a message about the form |
 * | "Could not read this PMTiles file" | packages/module-data-layers MapLayers.tsx | the layer cannot be drawn | in the layer's row | d | tied to the row's control |
 * | "Could not load this photo", the add-photo error | packages/module-street-imagery image-field.tsx | a photo id or open fails | until the next try | d | a message about one control |
 * | "The value is too long", "Translation ..." message | packages/ui inspector/fields Localized.tsx, DraftInput.tsx LengthNotice | a field is edited | until the next edit | d | a message about one field |
 * | "No field matches", "N fields" (screen reader only) | packages/ui inspector AddField.tsx | the search changes | while searching | d | a live region for one control, not a visible notice |
 * | "Could not load the members", "The list of backgrounds could not be loaded.", "The notes could not be loaded" | relations, module-imagery ImageryPanel.tsx, module-notes store | a list fails to load | in its panel | d | the panel's own content |
 * | "These filters come from the link you opened." | components/FilterButton.tsx | the filters come from a link | while from the link | b, not moved | a condition, but the filter banner is being replaced by another change |
 * | Restore dialog | RestorePrompt.tsx | stored edits are found | until answered | not a notice | a question that needs an answer |
 * | "© OpenStreetMap contributors" | MapNotices.tsx | always | always | not a notice | attribution |
 * | "Copied" / "5 tags pasted" | none | none | none | not present | Maid shows no copy confirmation; the undo history names pastes |
 *
 * Sonner (the library behind the toasts) renders its own live region, a `section` with
 * aria-live="polite" and aria-relevant="additions text". A toast's text is announced when the toast
 * is added and when its text changes; `notify.standing` skips the call when the text is the same,
 * so a standing toast is announced once, not on every render.
 */
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid'
import type { ReactNode } from 'react'
import { Toaster as SonnerToaster, toast } from 'sonner'
import { useResolvedTheme } from './theme.ts'

/** How long a notice of an event stays, and a failure (it is read more slowly) */
const DONE_MS = 4000
const FAILED_MS = 6000
const FALLBACK = 'Something went wrong.'

/** Options for one notice. A standing notice is always given its `id`: the condition it is for. */
export type NotifyOptions = {
  /** Replaces the toast with this id, instead of adding another */
  id?: string
  /** One button on the toast, e.g. "Load the map again" */
  action?: { label: string; onClick: () => void }
}

/**
 * The text a problem stands for: a string is its own text; an Error, or an object with a
 * `message`, gives that message; anything else, or an empty message, gives the fallback. A
 * message of "[object Object]" is no message either.
 */
export function errorText(problem: unknown, fallback = FALLBACK): string {
  if (typeof problem === 'string') return problem.trim() === '' ? fallback : problem
  const message =
    problem instanceof Error
      ? problem.message
      : typeof problem === 'object' && problem !== null && 'message' in problem
        ? problem.message
        : undefined
  return typeof message === 'string' && message.trim() !== '' && message !== '[object Object]'
    ? message
    : fallback
}

/** The text of each standing notice as it is shown, by id: the same text is not shown, or read, twice */
const standingTexts = new Map<string, string>()

/**
 * The notices of the app. Call sites never import sonner. Headless packages do not use this.
 */
export const notify = {
  /** An event that needs no action. Goes away by itself. */
  done(text: ReactNode, options: NotifyOptions = {}): void {
    toast.success(text, { id: options.id, action: options.action, duration: DONE_MS })
  },
  /** Something that happened and is worth a glance. Goes away by itself. */
  info(text: ReactNode, options: NotifyOptions = {}): void {
    toast.info(text, { id: options.id, action: options.action, duration: DONE_MS })
  },
  /**
   * A failure that is not about a form: the text, or the message of an error (see `errorText`).
   * Goes away by itself. A failure of a form or a control stays with it instead (kind d).
   */
  failed(problem: unknown, options: NotifyOptions & { fallback?: string } = {}): void {
    toast.error(errorText(problem, options.fallback), {
      id: options.id,
      action: options.action,
      duration: FAILED_MS,
    })
  },
  /**
   * A condition of the session that stays while it holds. One toast per `id`: the same text does
   * nothing, a new text updates the toast in place. It has no close button and cannot be swiped
   * away, because closing it would hide a condition that still holds. Call `clear` when it ends.
   */
  standing(id: string, text: string, options: NotifyOptions = {}): void {
    if (standingTexts.get(id) === text) return
    standingTexts.set(id, text)
    toast.warning(text, {
      id,
      action: options.action,
      duration: Infinity,
      dismissible: false,
      closeButton: false,
    })
  },
  /** Takes a standing notice away, when its condition has ended. Nothing happens for an unknown id. */
  clear(id: string): void {
    if (!standingTexts.delete(id)) return
    toast.dismiss(id)
  },
}

/*
 * Where the toasts sit, in the terms of the shell (Shell.tsx, TopBar.tsx, MapControls.tsx,
 * MapView.tsx): the top bar is 48 px high; the map's row of hints is 8 to 84 px below the top of the
 * window; the zoom buttons are at the top right of the map, 8 px in from the edge, 36 px wide (40 px
 * on touch screens), and 2 * 40 px + 1 px high on a phone. So the toasts start below the hints and
 * stop 64 px from the right edge, left of the zoom buttons. On a phone they take the full width
 * below the bigger zoom buttons. The bottom sheet and the dock are at the bottom: the toasts are at
 * the top, so neither covers them.
 */
const OFFSET = { top: 96, right: 64 }
const MOBILE_OFFSET = { top: 148, left: 16, right: 16 }

/*
 * sonner's own look is scoped under `data-styled`, and its colours are variables it sets for light
 * and dark. Maid's surfaces (Flyout, the map controls) are written out here instead: `unstyled`
 * drops sonner's rules for the toast, the icon, the close button and the action, and these classes
 * replace them. A standing notice keeps the amber of the map's hints, on the same surface.
 */
const SURFACE =
  'border-zinc-950/10 bg-white text-zinc-950 dark:border-white/15 dark:bg-zinc-800 dark:text-white'
const STANDING =
  'border-amber-900/15 bg-amber-50 text-amber-950 dark:border-amber-200/20 dark:bg-zinc-800 dark:text-amber-100'

const CLASSES = {
  toast:
    'font-sans flex w-full items-start gap-2.5 rounded-xl border py-2.5 pr-9 pl-3 text-sm shadow-lg dark:shadow-black/60',
  success: SURFACE,
  info: SURFACE,
  error: SURFACE,
  warning: STANDING,
  icon: 'mt-px flex shrink-0',
  content: 'min-w-0 flex-1',
  title: 'leading-snug [overflow-wrap:anywhere]',
  closeButton:
    'absolute top-1.5 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md opacity-60 hover:bg-zinc-950/5 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/10',
  actionButton:
    'shrink-0 cursor-pointer self-center rounded-md px-2 py-1 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-white/10',
}

const ICONS = {
  success: (
    <CheckCircleIcon aria-hidden="true" className="size-5 text-emerald-600 dark:text-emerald-400" />
  ),
  info: (
    <InformationCircleIcon aria-hidden="true" className="size-5 text-blue-600 dark:text-blue-400" />
  ),
  warning: (
    <ExclamationTriangleIcon
      aria-hidden="true"
      className="size-5 text-amber-700 dark:text-amber-300"
    />
  ),
  error: <XCircleIcon aria-hidden="true" className="size-5 text-red-600 dark:text-red-400" />,
  close: <XMarkIcon aria-hidden="true" className="size-4" />,
}

/**
 * The toasts of the app, mounted once in the shell. The theme is the one in effect (`system`
 * resolved), so the toasts follow the app's light and dark classes. Sonner's own live region
 * announces them; Alt+T moves the focus to them, as sonner's default hotkey does. The toasts are
 * always listed, not folded into a stack: a standing one must stay in view while it holds, and
 * there are at most `visibleToasts` (3) of them.
 */
export function Toaster() {
  const theme = useResolvedTheme()
  return (
    <SonnerToaster
      position="top-right"
      theme={theme}
      offset={OFFSET}
      mobileOffset={MOBILE_OFFSET}
      gap={8}
      expand
      closeButton
      icons={ICONS}
      toastOptions={{ unstyled: true, classNames: CLASSES }}
    />
  )
}
