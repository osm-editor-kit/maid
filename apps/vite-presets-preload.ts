/** The few parts of Vite's plugin API used here (the apps' own `vite` is not a dependency of the root project) */
type Chunk = { type: string; fileName: string; facadeModuleId?: string | null; imports: string[] }
type Plugin = {
  name: string
  apply: 'build'
  configResolved(config: { base: string }): void
  transformIndexHtml: {
    order: 'post'
    handler(
      html: string,
      context: { bundle?: Record<string, Chunk | { type: string }> },
    ):
      | {
          tag: string
          attrs?: Record<string, string | boolean>
          children?: string
          injectTo: 'head'
        }[]
      | undefined
  }
}

/**
 * Build only (shared by the three apps' vite configs): fetches the presets chunk (the tagging schema's data and the
 * country data, `src/presets.ts` of the app, imported with `import()` from `maid.config.ts`) early, in parallel with the
 * entry, so that it is there when the editor asks for it after the map exists (`loadPresetsAfterReady`).
 *
 * `prefetch` (the default) only downloads it, at low priority, into the HTTP cache; the page then reads it from there.
 * `modulepreload` downloads and also parses it, and parsing 1.4 MB is a main-thread task of about 20 ms that runs
 * before `ready` (measured: ready 262 ms without a link, 263 with prefetch, 281 with modulepreload, small scene).
 * Prefetch needs a cacheable response (hashed files served with `Cache-Control: immutable`, as a CDN does); with
 * `no-cache`, as `vite preview` answers, the chunk is fetched twice. Without any link the fetch starts when the editor
 * asks, after `ready`. The page is not edited when the app has no such chunk.
 *
 * A prefetch shares the line with the entry and MapLibre. On a slow or metered connection (data saver, 2g or 3g as the
 * browser reports it) that slows the map down for a chunk that is needed only later, so the links are written by a
 * small inline script that leaves them out there (Tobias, 2026-10-29). Safari reports no connection: it prefetches.
 */
export function presetsPreload(options: { rel?: 'prefetch' | 'modulepreload' } = {}): Plugin {
  const rel = options.rel ?? 'prefetch'
  let base = '/'
  return {
    name: 'maid-presets-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        const bundle = context.bundle
        if (!bundle) return undefined
        const files = new Set<string>()
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk') continue
          const { facadeModuleId, fileName, imports } = chunk as Chunk
          if (!facadeModuleId?.endsWith('/src/presets.ts')) continue
          files.add(fileName)
          if (rel === 'modulepreload') for (const imported of imports) files.add(imported)
        }
        if (files.size === 0) return undefined
        const links = [...files].map((file) => ({
          rel,
          ...(rel === 'prefetch' ? { as: 'script' } : {}),
          crossOrigin: '',
          href: `${base}${file}`,
        }))
        return [
          {
            tag: 'script',
            children: `(function(){var c=navigator.connection;if(c&&(c.saveData||/(^|-)(2g|3g)$/.test(c.effectiveType||'')))return;${JSON.stringify(links)}.forEach(function(a){var l=document.createElement('link');Object.assign(l,a);document.head.appendChild(l)})})()`,
            injectTo: 'head' as const,
          },
        ]
      },
    },
  }
}
