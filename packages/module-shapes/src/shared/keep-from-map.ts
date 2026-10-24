/**
 * Events a panel inside the map does not pass on to it: a press on a button must not pan the map or reach the mode, and
 * a drag in a field must not pan it. A click is not in the list: the map sees it while a mode is on, and the mode does
 * nothing with a click on its own panel.
 */
const KEPT_FROM_MAP = ['mousedown', 'pointerdown', 'touchstart', 'dblclick', 'wheel'] as const

/**
 * A ref for a panel that is DOM inside the map (Cut, Divide, Resize): keeps its events from the map while it is
 * mounted. One function for every panel, so React does not attach it again on a render.
 * @param   element - The panel, or null
 * @return  The cleanup React calls when the panel goes
 */
export function keepFromMap(element: HTMLElement | null): (() => void) | undefined {
  if (!element) return undefined
  const keep = (event: Event) => event.stopPropagation()
  for (const type of KEPT_FROM_MAP) element.addEventListener(type, keep)
  return () => {
    for (const type of KEPT_FROM_MAP) element.removeEventListener(type, keep)
  }
}
