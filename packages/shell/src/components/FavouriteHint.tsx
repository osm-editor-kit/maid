import { favouriteModifierLabel, useStoredFavourites } from '@osm-editor-kit/maid-ui'
import { useEffect, useState } from 'react'
import { startFavourite } from '../favourites'
import { MAC } from '../platform'
import { usePresets, useShell } from '../shell-context'
import {
  advance,
  IDLE,
  sequenceEventOf,
  type SequenceEvent,
  type SequenceState,
} from './favourites-keys'

/** The modifier as the hint shows it: the Option symbol on Apple devices, Alt elsewhere (the same as the texts name it) */
const MODIFIER_LABEL = favouriteModifierLabel(MAC)

/**
 * True when the keys of a target are a text field's own: a sequence never takes them. The type search is the
 * exception (`data-favourite-keys`): it has the focus right after a drawing, and picking a favourite is what comes next.
 */
function inField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.dataset.favouriteKeys !== undefined) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  )
}

/**
 * Starts a favourite by its number: hold Alt, type the digits, release Alt (favourites-keys.ts
 * holds the rules). While the digits are typed, a pill shows the number and the favourite it
 * would start, or that there is none. Mounted once, with the map. The listeners are on the window,
 * so the sequence works wherever the focus is, except in a text field.
 */
export function FavouriteHint() {
  const { editor, engine } = useShell()
  const presets = usePresets()
  const [sequence, setSequence] = useState<SequenceState>(IDLE)
  const favourites = useStoredFavourites()

  useEffect(() => {
    // the state lives here, not in React's state, so a key event sees the one before it at once
    const current = { state: IDLE }
    const send = (event: SequenceEvent) => {
      const step = advance(current.state, event)
      current.state = step.state
      setSequence(step.state)
      if (step.start !== undefined) startFavourite({ editor, engine }, step.start)
    }
    const input = (event: KeyboardEvent, type: 'keydown' | 'keyup') => ({
      type,
      key: event.key,
      code: event.code,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      repeat: event.repeat,
      inField: inField(event.target),
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      // Alt let go while the window did not see it: the keys after it show that it is up
      if (!event.altKey && event.key !== 'Alt') send({ type: 'modifier-up' })
      const found = sequenceEventOf(input(event, 'keydown'))
      if (!found) return
      // the digits, Backspace and Escape are the sequence's: the browser does not get them
      if (current.state.held && found.type !== 'modifier-down') event.preventDefault()
      send(found)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const found = sequenceEventOf(input(event, 'keyup'))
      if (found) send(found)
    }
    const onBlur = () => send({ type: 'blur' })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [editor, engine])

  const { held, digits, cancelled } = sequence
  if (!held || cancelled || digits === '') return null
  const favourite = favourites.find((item) => item.number === digits)
  const name = favourite ? presets?.preset(favourite.presetId)?.name : undefined
  return (
    <div
      role="status"
      // the pill is for the keys of a keyboard: a touch device shows no hint (the key does not exist there)
      className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-800 shadow ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10 touch:hidden"
    >
      <kbd className="font-mono">{MODIFIER_LABEL}</kbd>{' '}
      {name ? `${digits} · ${name}` : `no favourite ${digits}`}
    </div>
  )
}
