import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useSettings } from './settings.ts'

export type ResizableOptions = {
  /** The key the size is saved under in the settings, e.g. `sidebar-width`. */
  storageKey: string
  /** `x` resizes by width, `y` by height. */
  axis: 'x' | 'y'
  /** Size used on the first visit and after a double click on the handle. */
  initial: number
  min: number
  /**
   * Largest size for a viewport of this many pixels along the axis. Pass a module-level function
   * so the reference stays the same between renders.
   */
  max: (viewport: number) => number
  /** 1 when dragging right or down makes the panel larger, -1 for the opposite. */
  direction: 1 | -1
}

/** The pointer handlers a `ResizeHandle` takes. */
export type ResizeHandleEvents = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onDoubleClick: () => void
}

export type Resizable = {
  size: number
  dragging: boolean
  handleProps: ResizeHandleEvents
}

/** Keeps a size between `min` and `ceiling`. The ceiling wins, so the panel never overflows the window. */
export function clampSize(size: number, min: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(min, size))
}

function viewportSize(axis: 'x' | 'y'): number {
  return axis === 'x' ? window.innerWidth : window.innerHeight
}

/**
 * A panel size the user drags with a handle, saved on pointer up. The size is React state during
 * the drag. A double click on the handle resets it to `initial`. The size follows the window when
 * the window is resized.
 */
export function useResizable(options: ResizableOptions): Resizable {
  const { storageKey, axis, initial, min, max, direction } = options
  const [size, setSize] = useState(() =>
    clampSize(useSettings.getState().sizes[storageKey] ?? initial, min, max(viewportSize(axis))),
  )
  const [dragging, setDragging] = useState(false)

  // The window is outside React, so this listener is an effect.
  useEffect(() => {
    function onWindowResize() {
      setSize((current) => clampSize(current, min, max(viewportSize(axis))))
    }
    window.addEventListener('resize', onWindowResize)
    return () => window.removeEventListener('resize', onWindowResize)
  }, [axis, min, max])

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    // Pointer capture keeps move and up events on the handle when the pointer leaves it.
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    setDragging(true)

    const ceiling = max(viewportSize(axis))
    const startPosition = axis === 'x' ? event.clientX : event.clientY
    const startSize = size
    let current = size

    function onPointerMove(move: PointerEvent) {
      const position = axis === 'x' ? move.clientX : move.clientY
      current = clampSize(startSize + direction * (position - startPosition), min, ceiling)
      setSize(current)
    }

    function end() {
      handle.removeEventListener('pointermove', onPointerMove)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
      setDragging(false)
      useSettings.getState().setSize(storageKey, current)
    }

    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }

  function onDoubleClick() {
    const reset = clampSize(initial, min, max(viewportSize(axis)))
    setSize(reset)
    useSettings.getState().setSize(storageKey, reset)
  }

  return { size, dragging, handleProps: { onPointerDown, onDoubleClick } }
}
