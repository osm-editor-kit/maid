/**
 * React bindings of the core, as a separate entry point (`@osm-editor-kit/maid-core/react`)
 * so that the main entry stays free of React.
 */
import { createParser, useQueryState } from 'nuqs'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Editor, ExtensionPoints, PointName } from './types.ts'
import { layered, urlWrite, type UrlParamHandle } from './url-state.ts'

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

export interface UrlSettingOptions<T> {
  /** The person's stored choice, or `null` when there is none */
  stored: T | null
  /** The value without a link and without a stored choice: the editor's default */
  fallback: T
  /** Stores a choice of the person for the next visit. A link never calls it. */
  remember: (value: T) => void
  /** Turns a value the editor cannot show (an unknown id) into what it shows instead. Default: the value as it is. */
  resolve?: (value: T) => T
  /** Nothing is written to the URL before this is true (a start order still running). Default: true. */
  ready?: boolean
  /** Leaves the key out while the fallback is shown and no link asked for it (see core's `urlWrite`) */
  omitFallback?: boolean
}

/**
 * A setting a link can set, with one live state (docs/research/url-state-audit.md): the URL decides, the stored
 * choice is remembered for the next visit, and once `ready` the URL is kept to what is shown (`history: 'replace'`
 * from the declaration). `choose` is a choice of the person: it writes the URL and remembers the value. A link
 * never writes storage. `fromLink` is true while the URL shows something other than the person's own choice.
 */
export function useUrlSetting<T extends {}>(
  handle: UrlParamHandle<T>,
  options: UrlSettingOptions<T>,
) {
  const { stored, fallback, remember, resolve, ready = true, omitFallback } = options
  const [url, setUrl] = useUrlParam(handle)
  const same = (a: T, b: T) => (handle.parser.eq ? handle.parser.eq(a, b) : Object.is(a, b))
  const setting = layered({ url, stored, fallback, same })
  const shown = resolve ? resolve(setting.value) : setting.value
  const write = urlWrite({ url, shown, fallback, fromLink: setting.fromLink, omitFallback, same })

  useEffect(() => {
    if (ready && write !== undefined) void setUrl(write)
  }, [ready, write, setUrl])

  return {
    value: shown,
    fromLink: setting.fromLink,
    /** A choice of the fallback with `omitFallback` removes the key at once, so the parser never writes "off" */
    choose: (value: T) => {
      void setUrl(omitFallback && same(value, fallback) ? null : value)
      remember(value)
    },
  }
}
