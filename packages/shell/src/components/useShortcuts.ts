import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { deleteOperation } from '@osm-editor-kit/maid-operations'
import { useHotkeys, type UseHotkeyDefinition } from '@tanstack/react-hotkeys'
import { continueLine, drawClick, drawingKind } from '../drawing'
import { giveFavouriteType } from '../favourites'
import { useSelection } from '../selection'
import { useEngine, useShell } from '../shell-context'
import { keepsStack, stepStackId, useStack } from '../stack'

/** Screen pixels the arrow keys move the map by, as in iD */
const PAN = 80

/**
 * The editor's keys, as in iD. They work wherever the focus is, except in text fields, which
 * keep the browser's own keys.
 *
 * - Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z or Ctrl+Y redo
 * - 1, 2, 3 add a point, a line, an area; A continues the selected line
 * - Alt with digits starts a favourite feature type by its number (FavouriteHint): with a feature
 *   selected it changes its type, with nothing selected it starts adding a feature of that type
 * - while drawing: Space places a node where the pointer is, Enter or Escape finishes,
 *   Backspace takes back the last node, Delete drops the way
 * - M moves and R rotates the selection with the pointer (click to put down, Escape to cancel)
 * - Cmd/Ctrl+C copies the selection, Cmd/Ctrl+V pastes it where the pointer is
 * - Cmd/Ctrl+Backspace or Delete deletes the selection; Escape leaves a mode, then the selection
 * - the letters of the edit menu run its operations (V reverse, X split, C merge, ...)
 * - arrow keys pan the map, + and - zoom
 * - where a click found several features (the pill on the map): , takes the previous one and .
 *   the next one. Not [ and ], which iD uses for the nodes of a way
 */
export function useShortcuts() {
  const { editor, engine } = useShell()
  const { ids: selected, select } = useSelection()
  const operations = useExtensionPoint(editor, 'edit.operation')
  // which keys are taken depends on what the editor is doing: read it so that this follows
  const drawing = useEngine((e) => e.draw.active)
  const drawMode = useEngine((e) => e.mode === 'draw-line' || e.mode === 'draw-area')
  // the features of a click, while one of them is selected: , and . step through them
  const stack = useStack()
  const stackShown = stack !== null && keepsStack(stack, selected)
  const stepStack = (step: 1 | -1) => {
    const current = selected[0]
    if (stack && current) select(stepStackId(stack.ids, current, step) ?? null)
  }

  const finishDrawing = () => {
    const finished = engine.draw.finish()
    if (finished) giveFavouriteType({ engine }, finished, engine.mode)
    engine.setMode('browse')
    if (finished) select(finished)
  }
  const escape = () => {
    // Escape first leaves a mode, then the selection. As in iD it keeps a way that is being
    // drawn (Delete drops it) and puts a move or rotation back.
    if (engine.mode === 'browse') return select(null)
    if (engine.draw.active) return finishDrawing()
    engine.transform.cancel()
    engine.setMode('browse')
  }
  // the delete operation has iD's rules: what may not be deleted, and which node is selected after
  const remove = () => {
    const next = engine.runOperation(deleteOperation)
    if (next) select(next.length > 0 ? next : null)
  }
  const cancelDrawing = () => {
    engine.draw.cancel()
    engine.setMode('browse')
  }
  const backspace = () => {
    if (engine.draw.active) engine.draw.undoLast()
  }
  const space = () => {
    const kind = drawingKind(engine)
    const { pointer } = engine
    if (kind && pointer) void drawClick(engine, select, kind, pointer.point, pointer.layers)
  }
  const copy = () => {
    // text that is marked in the sidebar is what Cmd+C means then
    if (!window.getSelection()?.isCollapsed) return false
    return engine.copy()
  }
  const paste = () => {
    const center = engine.map?.getCenter()
    const at = engine.pointer ?? (center && { lon: center.lng, lat: center.lat })
    if (at) select(engine.paste(at.lon, at.lat))
  }
  const pan = (x: number, y: number) => engine.map?.panBy([x, y], { duration: 100 })

  const keys: UseHotkeyDefinition[] = [
    { hotkey: 'Mod+Z', callback: () => engine.undo() },
    { hotkey: 'Mod+Shift+Z', callback: () => engine.redo() },
    { hotkey: 'Control+Y', callback: () => engine.redo() },
    { hotkey: '1', callback: () => engine.setMode('add-point') },
    { hotkey: '2', callback: () => engine.setMode('draw-line') },
    { hotkey: '3', callback: () => engine.setMode('draw-area') },
    { hotkey: 'A', callback: () => continueLine(engine, selected) },
    { hotkey: ',', callback: () => stepStack(-1), options: { enabled: stackShown } },
    { hotkey: '.', callback: () => stepStack(1), options: { enabled: stackShown } },
    { hotkey: 'M', callback: () => engine.setMode('move') },
    { hotkey: 'R', callback: () => engine.setMode('rotate') },
    { hotkey: 'Enter', callback: finishDrawing, options: { enabled: drawing } },
    { hotkey: 'Space', callback: space, options: { enabled: drawMode } },
    { hotkey: 'Backspace', callback: backspace, options: { enabled: drawing } },
    { hotkey: 'Escape', callback: escape },
    { hotkey: 'Delete', callback: () => (engine.draw.active ? cancelDrawing() : remove()) },
    { hotkey: 'Mod+Backspace', callback: remove },
    { hotkey: 'Mod+Delete', callback: remove },
    // without preventDefault the browser copies and pastes as usual when the editor has nothing to do
    {
      hotkey: 'Mod+C',
      callback: (event) => copy() && event.preventDefault(),
      options: { preventDefault: false },
    },
    { hotkey: 'Mod+V', callback: paste },
    { hotkey: 'ArrowLeft', callback: () => pan(-PAN, 0) },
    { hotkey: 'ArrowRight', callback: () => pan(PAN, 0) },
    { hotkey: 'ArrowUp', callback: () => pan(0, -PAN) },
    { hotkey: 'ArrowDown', callback: () => pan(0, PAN) },
    { hotkey: '=', callback: () => engine.map?.zoomIn() },
    { hotkey: '-', callback: () => engine.map?.zoomOut() },
    // the keys of the edit menu
    ...operations.flatMap((operation) =>
      operation.shortcut
        ? [
            {
              // the operation's shortcut is a plain string; the hotkey library's type is a union of key names
              hotkey: operation.shortcut.toUpperCase() as UseHotkeyDefinition['hotkey'],
              callback: () => {
                const next = engine.runOperation(operation)
                if (next) select(next)
              },
            },
          ]
        : [],
    ),
  ]
  useHotkeys(keys, { ignoreInputs: true })
}
