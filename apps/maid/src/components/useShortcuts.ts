import { useEffect } from 'react'
import { engine } from '../editor'
import { useSelectedId } from '../url/state'

const TEXT_FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** Text fields keep the browser's own keys (undo, delete, digits), so the shortcuts leave them alone */
function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return TEXT_FIELD_TAGS.has(target.tagName) || target.isContentEditable
}

/**
 * The editor's keys, as in iD. Cmd+Z or Ctrl+Z undoes; Shift+Cmd+Z, Shift+Ctrl+Z or Ctrl+Y
 * redoes; 1 adds a point; Cmd+Backspace, Ctrl+Backspace or Delete deletes the selection.
 * Listens on the window so the keys work wherever the focus is, except in text fields.
 */
export function useShortcuts() {
  const [selectedId, setSelectedId] = useSelectedId()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextField(event.target) || event.altKey) return
      const command = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      let handled = true
      if (command && key === 'z' && !event.shiftKey) engine.undo()
      else if (command && ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey)))
        engine.redo()
      else if (!command && key === '1') engine.setMode('add-point')
      else if (selectedId && ((command && key === 'backspace') || key === 'delete')) {
        if (engine.deleteEntity(selectedId)) void setSelectedId(null)
      } else handled = false
      if (handled) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, setSelectedId])
}
