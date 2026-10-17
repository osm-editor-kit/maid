import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { deleteOperation, supersededIDs } from '@osm-editor-kit/maid-operations'
import type { Operation } from '@osm-editor-kit/maid-operations'
import { chooseDisplay } from '@osm-editor-kit/maid-ui'
import { useHotkeys, type UseHotkeyDefinition } from '@tanstack/react-hotkeys'
import { useEffect, useEffectEvent } from 'react'
import { pasteAt } from './clipboard'
import { drawClick, drawingKind, drawKindOf, stepAreaTool } from './drawing'
import { giveFavouriteType } from './favourites'
import { markNewFeature } from './new-feature'
import { useSearchActions } from './search/flyout'
import { useSelection } from './selection'
import { useEngine, useShell } from './shell-context'
import { keepsStack, stepStackId, useStack } from './stack'
import { turnForKey } from './url/bearing'

/** Screen pixels the arrow keys move the map by, as in iD */
const PAN = 80

/**
 * The editor's keys, as in iD. They work wherever the focus is, except in text fields, which
 * keep the browser's own keys.
 *
 * - Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z or Ctrl+Y redo
 * - 1, 2, 3 add a point, a line, an area; A continues the line at the selected end (the Continue operation)
 * - Alt with digits starts a favourite feature type by its number (FavouriteHint): with a feature
 *   selected it changes its type, with nothing selected it starts adding a feature of that type
 * - while drawing: Space places a node where the pointer is, Enter or Escape finishes,
 *   Backspace takes back the last node, Delete drops the way
 * - M moves and R rotates the selection with the pointer (click or Enter to put down, Escape to cancel);
 *   R on one point with a direction turns that direction (iD's rotate-point-direction); a point with no
 *   direction tag turns the numeric direction field of its preset (a bench's `direction`), written from the first move
 * - Cmd/Ctrl+C copies the selection, Cmd/Ctrl+V pastes it where the pointer is
 * - Cmd/Ctrl+F opens the search (SearchButton) and focuses its input; the browser's find stays off
 * - Cmd/Ctrl+Backspace or Delete deletes the selection; Escape leaves a mode, then the selection
 * - the letters of the edit menu run its operations (V reverse, X split, C merge, ...)
 * - 3 again before the first click steps through the drawing tools of the Area dropdown (33, 333) and back
 * - W toggles the wireframe, G the changes in colour, as iD: each one back to the normal look, and from the other one
 *   to its own (the URL's `display` follows, url/display.ts)
 * - arrow keys pan the map, + and - zoom
 * - Shift with the left and right arrows turns the map by 2.5 degrees, N turns it back to north
 *   (no key tilts the map: pitch is switched off)
 * - where a click found several features (the pill on the map): , takes the previous one and .
 *   the next one. Not [ and ], which iD uses for the nodes of a way
 */
export function useShortcuts() {
  const { editor, engine } = useShell()
  const { ids: selected, select } = useSelection()
  const operations = useExtensionPoint(editor, 'edit.operation')
  // the drawing tools of the Area dropdown: 3 again steps to them (stepAreaTool, ADR 0011 hook 3)
  const drawTools = useExtensionPoint(editor, 'draw.tool')
  // which keys are taken depends on what the editor is doing. Read that state so the list follows it
  const drawing = useEngine((e) => e.draw.active)
  // a move or a rotation is put down with Enter, as a click puts it down
  const transforming = useEngine((e) => e.transform.active)
  const drawMode = useEngine((e) => drawKindOf(e.mode) !== undefined)
  // the features of a click, while one of them is selected: , and . step through them
  const stack = useStack()
  const { open: openSearch } = useSearchActions()
  const stackShown = stack !== null && keepsStack(stack, selected)
  // what a module drew (engine.announceDrawn) is selected as a drawing is: one new way asks for its type
  const selectDrawn = useEffectEvent((ids: readonly string[]) => {
    if (ids.length === 1 && ids[0]) markNewFeature(ids[0])
    select(ids)
  })
  useEffect(
    function selectWaysDrawnByModules() {
      return engine.onDrawn((ids) => selectDrawn(ids))
    },
    [engine],
  )
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
    if (at) select(pasteAt(engine, at.lon, at.lat))
  }
  const pan = (x: number, y: number) => engine.map?.panBy([x, y], { duration: 100 })

  // the letter keys of the edit menu. One key can belong to several operations (the core Merge and the parking union,
  // which supersedes it): one hotkey per key runs the first of them that applies and is not superseded
  const operationKeys = new Map<string, Operation[]>()
  for (const operation of operations) {
    if (!operation.shortcut) continue
    operationKeys.set(operation.shortcut, [
      ...(operationKeys.get(operation.shortcut) ?? []),
      operation,
    ])
  }
  const keys: UseHotkeyDefinition[] = [
    { hotkey: 'Mod+Z', callback: () => engine.undo() },
    { hotkey: 'Mod+Shift+Z', callback: () => engine.redo() },
    { hotkey: 'Control+Y', callback: () => engine.redo() },
    { hotkey: '1', callback: () => engine.setMode('add-point') },
    { hotkey: '2', callback: () => engine.setMode('draw-line') },
    { hotkey: '3', callback: () => stepAreaTool(engine, drawTools) },
    { hotkey: ',', callback: () => stepStack(-1), options: { enabled: stackShown } },
    { hotkey: '.', callback: () => stepStack(1), options: { enabled: stackShown } },
    { hotkey: 'M', callback: () => engine.setMode('move') },
    { hotkey: 'R', callback: () => engine.setMode('rotate') },
    {
      hotkey: 'Enter',
      callback: () => (engine.transform.active ? engine.setMode('browse') : finishDrawing()),
      options: { enabled: drawing || transforming },
    },
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
    { hotkey: 'Mod+F', callback: () => openSearch() },
    { hotkey: 'ArrowLeft', callback: () => pan(-PAN, 0) },
    { hotkey: 'ArrowRight', callback: () => pan(PAN, 0) },
    { hotkey: 'ArrowUp', callback: () => pan(0, -PAN) },
    { hotkey: 'ArrowDown', callback: () => pan(0, PAN) },
    { hotkey: '=', callback: () => engine.map?.zoomIn() },
    { hotkey: '-', callback: () => engine.map?.zoomOut() },
    // turns as Rapid's Shift+Left and Shift+Right; N as its compass (the map's keyboard is off, see MapView)
    { hotkey: 'Shift+ArrowLeft', callback: () => engine.turnBy(turnForKey('ArrowLeft')) },
    { hotkey: 'Shift+ArrowRight', callback: () => engine.turnBy(turnForKey('ArrowRight')) },
    { hotkey: 'N', callback: () => engine.resetNorth() },
    // iD's keys for what the map shows (map_data.highlight_edits and area_fill.wireframe)
    {
      hotkey: 'W',
      callback: () =>
        chooseDisplay(engine, engine.display === 'wireframe' ? 'normal' : 'wireframe'),
    },
    {
      hotkey: 'G',
      callback: () => chooseDisplay(engine, engine.display === 'edits' ? 'normal' : 'edits'),
    },
    // the keys of the edit menu
    ...[...operationKeys].map(([shortcut, group]) => ({
      // the shortcut is a plain string; the hotkey library's type is a union of key names
      hotkey: shortcut.toUpperCase() as UseHotkeyDefinition['hotkey'],
      callback: () => {
        const context = engine.operationContext()
        const hidden = supersededIDs(operations, context)
        const operation = group.find(
          (candidate) => !hidden.has(candidate.id) && candidate.applies(context),
        )
        if (!operation) return
        const next = engine.runOperation(operation)
        if (next) select(next)
      },
    })),
  ]
  useHotkeys(keys, { ignoreInputs: true })
}
