/**
 * The app's own files (sprites, label fonts, land.html, frame-sync.js) are served from the base path the
 * app was built with: `/` in development, `/<repository>/` on GitHub Pages (`VITE_BASE`, read by each app's
 * vite.config.ts). A path that starts with `/` would skip that base, so every such path goes through here.
 */

/** The base path as a directory: `/` stays `/`; `maid`, `/maid` and `/maid/` all become `/maid/` */
export function basePath(base: string): string {
  const inner = base.replace(/^\/+|\/+$/g, '')
  return inner === '' ? '/' : `/${inner}/`
}

/** The absolute URL of the directory the app is served from, e.g. `https://osm-editor-kit.github.io/maid/` */
export function baseUrl(base: string, origin: string): string {
  return new URL(basePath(base), origin).href
}

/**
 * The absolute URL of a file under the base, e.g. `publicUrl('land.html', '/maid/', origin)`. The path is
 * joined as text, not parsed by `URL`, so a template such as `{fontstack}/{range}` keeps its braces.
 */
export function publicUrl(path: string, base: string, origin: string): string {
  return baseUrl(base, origin) + path.replace(/^\/+/, '')
}

/**
 * The same for this page: the base the app was built with and the origin the page is served from.
 * Outside a browser (`bun test`) there is no location, and the base alone is used on localhost.
 */
export function appUrl(path: string): string {
  // `import.meta.env` is Vite's; `bun test` has none, so the base is then `/`
  const base = import.meta.env?.BASE_URL ?? '/'
  const origin = globalThis.location?.origin ?? 'http://localhost'
  return publicUrl(path, base, origin)
}
