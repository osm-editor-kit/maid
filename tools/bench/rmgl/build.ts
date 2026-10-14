/**
 * Builds the benchmark page with Vite, in production mode and with the React Compiler, as Maid's apps are built.
 *
 * The page is not a workspace package, so `react`, `react-map-gl`, `maplibre-gl` and Vite itself are taken
 * from where `apps/maid` resolves them: the versions measured are the versions Maid ships.
 */
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dir, '../../..')
const APP = resolve(import.meta.dir, 'app')
const MAID = join(ROOT, 'apps/maid')
/** A file in apps/maid: bare imports of the page are resolved as if this file had written them */
const MAID_IMPORTER = join(MAID, 'src/main.tsx')

type VitePlugin = Record<string, unknown>
type ViteModule = { build(config: Record<string, unknown>): Promise<unknown> }
type ReactPluginModule = { default(options: { compiler: boolean }): VitePlugin | VitePlugin[] }
type ResolveContext = {
  resolve(source: string, importer: string, options: { skipSelf: boolean }): Promise<unknown>
}

const maidRequire = createRequire(join(MAID, 'package.json'))
const load = async <T>(name: string) =>
  (await import(pathToFileURL(maidRequire.resolve(name)).href)) as T

/** The version of a package as `apps/maid` has it installed */
function versionOf(name: string, from = join(MAID, 'node_modules')) {
  const pkg = JSON.parse(readFileSync(join(from, name, 'package.json'), 'utf8')) as {
    version: string
  }
  return pkg.version
}

export function versions() {
  // react-map-gl/maplibre re-exports @vis.gl/react-maplibre, which is installed next to it: the audited code
  const besideReactMapGl = resolve(realpathSync(join(MAID, 'node_modules/react-map-gl')), '..')
  return {
    'react-map-gl': versionOf('react-map-gl'),
    '@vis.gl/react-maplibre': versionOf('@vis.gl/react-maplibre', besideReactMapGl),
    'maplibre-gl': versionOf('maplibre-gl'),
    react: versionOf('react'),
    'react-dom': versionOf('react-dom'),
    vite: versionOf('vite'),
  }
}

export async function build(outDir: string) {
  const vite = await load<ViteModule>('vite')
  const react = await load<ReactPluginModule>('@vitejs/plugin-react')
  const fromMaid: VitePlugin = {
    name: 'rmgl-bench-resolve-from-maid',
    enforce: 'pre',
    async resolveId(this: ResolveContext, source: string, importer: string | undefined) {
      const bare = !source.startsWith('.') && !source.startsWith('/') && !source.startsWith('\0')
      if (!bare || !importer?.startsWith(APP)) return null
      return this.resolve(source, MAID_IMPORTER, { skipSelf: true })
    },
  }
  await vite.build({
    configFile: false,
    root: APP,
    logLevel: 'warn',
    plugins: [fromMaid, react.default({ compiler: true })],
    build: {
      outDir,
      emptyOutDir: true,
      target: 'esnext',
      minify: true,
      sourcemap: false,
      // MapLibre is one large chunk: not a finding of this build
      chunkSizeWarningLimit: 4000,
    },
  })
}

if (import.meta.main) {
  const out = resolve(import.meta.dir, 'dist')
  await build(out)
  console.log(versions(), `\nbuilt to ${out}`)
}
