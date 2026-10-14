/**
 * React bindings of the core, as a separate entry point (`@osm-editor-kit/maid-core/react`)
 * so that the main entry stays free of React.
 */
import { createParser, useQueryState } from 'nuqs'
import { useMemo, useSyncExternalStore } from 'react'
import type { Editor, ExtensionPoints, PointName } from './types.ts'
import type { UrlParamHandle } from './url-state.ts'

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

/**
 * A URL parameter a module declared (`api.urlParam` in core), as React state: the value (`null` when the URL
 * says nothing, so the stored choice applies) and a setter. A thin wrapper of nuqs' `useQueryState` with the
 * declared parser and options. It needs the shell's `NuqsAdapter` (App.tsx), which is above every module component.
 */
export function useUrlParam<T>(handle: UrlParamHandle<T>) {
  const parser = useMemo(
    () =>
      createParser<T>({
        parse: handle.parser.parse.bind(handle.parser),
        serialize: handle.parser.serialize.bind(handle.parser),
        eq: handle.parser.eq?.bind(handle.parser),
      }).withOptions(handle.options),
    [handle],
  )
  return useQueryState(handle.name, parser)
}
