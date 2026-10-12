import { useEffect } from 'react'
import { engine } from '../editor'

const TEXT_FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** Text fields keep the browser's own undo, so the shortcuts must leave their keys alone */
function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return TEXT_FIELD_TAGS.has(target.tagName) || target.isContentEditable
}

/**
 * Cmd+Z or Ctrl+Z undoes; Shift+Cmd+Z, Shift+Ctrl+Z or Ctrl+Y redoes. Listens on the window so
 * the shortcuts work wherever the focus is, except in text fields.
 */
export function useUndoShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      if (isTextField(event.target)) return
      const key = event.key.toLowerCase()
      const undo = key === 'z' && !event.shiftKey
      const redo =
        (key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey && !event.shiftKey)
      if (!undo && !redo) return
      event.preventDefault()
      if (undo) engine.undo()
      else engine.redo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
