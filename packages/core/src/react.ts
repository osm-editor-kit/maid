/**
 * React bindings of the core, as a separate entry point (`@osm-editor-kit/maid-core/react`)
 * so that the main entry stays free of React.
 */
import { useSyncExternalStore } from 'react'
import type { Editor, ExtensionPoints, PointName } from './types.ts'

/**
 * The items modules registered at an extension point, in registration order.
 * The component renders again when an item is added or removed.
 */
export function useExtensionPoint<K extends PointName>(
  editor: Editor,
  point: K,
): readonly (ExtensionPoints[K] & { id: string })[] {
  const registry = editor.registry(point)
  // `list` returns the same array until the registry changes, as useSyncExternalStore needs
  return useSyncExternalStore(registry.subscribe, registry.list)
}
