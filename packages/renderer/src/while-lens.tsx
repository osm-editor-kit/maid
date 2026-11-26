import type { LensSource } from '@osm-editor-kit/maid-style'
import { useSyncExternalStore, type ComponentType } from 'react'
import type { MapContentProps } from './extension-points'

/**
 * A `map.content` component that draws only while the lens `lensId` is the active one (a drawing over all features in
 * view belongs to its editor's lens, Tobias 2026-11-26). Maid standard (no lens) and every other lens leave it out; the
 * component is not mounted then, so it reads no data and adds no layer. Without a lens source the component is returned
 * as it is: it draws always.
 * Call it once, when the module is set up, not while rendering.
 */
export function whileLens(
  lenses: LensSource | undefined,
  lensId: string,
  Component: ComponentType<MapContentProps>,
): ComponentType<MapContentProps> {
  if (!lenses) return Component
  const { getActiveId, subscribe } = lenses
  function WhileLens(props: MapContentProps) {
    const on = useSyncExternalStore(subscribe, () => getActiveId() === lensId)
    return on ? <Component {...props} /> : null
  }
  return WhileLens
}
