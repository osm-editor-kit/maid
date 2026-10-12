import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
/**
 * Model load benchmark in a real browser: the load path the app uses.
 *
 *   bun run bench-model [--runs 5] [--browser chromium|firefox|webkit]
 *
 * Bundles packages/model/bench/browser-entry.ts in memory and serves it, with the gunzipped
 * fixtures, from http://localhost/ through page.route. Every other request is aborted
 * (core rule 1). Writes reports/model-load-<browser>.json and prints one line per scene.
 */
import { gunzipSync } from 'node:zlib'
import { chromium, firefox, webkit, type Browser as PwBrowser } from '@playwright/test'
import type { ModelLoadResult } from '../../packages/model/bench/browser-entry.ts'

type BrowserName = 'chromium' | 'firefox' | 'webkit'
// entities: API JSON to entities (entitiesFromOsmJson). merge: into the history's graph.
type Timings = { json: number; entities: number; merge: number }
type SceneResult = { scene: string; elements: number; ms: Timings & { total: number } }

const ROOT = resolve(import.meta.dir, '../..')
const SCENES = ['small', 'medium', 'dense']
const ORIGIN = 'http://localhost'
const PAGE_HTML = `<!doctype html><meta charset="utf-8"><title>model load</title><script src="/model-load.js"></script>`

function parseArgs(argv: string[]): { runs: number; browser: BrowserName } {
  let runs = 5
  let browser: BrowserName = 'chromium'
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? ''
    const value = argv[i + 1] ?? ''
    if (arg === '--runs') {
      runs = Number(value)
      i++
    } else if (arg === '--browser') {
      if (value !== 'chromium' && value !== 'firefox' && value !== 'webkit')
        throw new Error(`--browser must be chromium, firefox or webkit, got "${value}"`)
      browser = value
      i++
    } else {
      throw new Error(`unknown argument "${arg}"`)
    }
  }
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a whole number ≥ 1`)
  return { runs, browser }
}

async function bundleEntry(): Promise<string> {
  const entry = resolve(ROOT, 'packages/model/bench/browser-entry.ts')
  const result = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'iife' })
  if (!result.success)
    throw new Error(`bundle failed:\n${result.logs.map((log) => log.message).join('\n')}`)
  const output = result.outputs[0]
  if (!output) throw new Error('bundle produced no output')
  return output.text()
}

function loadFixtures(): Map<string, string> {
  const texts = new Map<string, string>()
  for (const scene of SCENES) {
    const gz = readFileSync(join(ROOT, 'fixtures', `${scene}.json.gz`))
    texts.set(scene, gunzipSync(gz).toString())
  }
  return texts
}

async function launch(browser: BrowserName): Promise<PwBrowser> {
  // Same launch options as tools/bench/run.ts
  if (browser === 'chromium') return chromium.launch({ channel: 'chrome', headless: true })
  if (browser === 'firefox') return firefox.launch({ headless: true })
  return webkit.launch({ headless: true })
}

const round = (ms: number): number => Math.round(ms * 10) / 10

async function main(): Promise<void> {
  const { runs, browser: browserName } = parseArgs(Bun.argv.slice(2))
  const bundle = await bundleEntry()
  const fixtures = loadFixtures()

  const browser = await launch(browserName)
  try {
    const page = await (await browser.newContext()).newPage()
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== ORIGIN) return route.abort()
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: PAGE_HTML })
      if (url.pathname === '/model-load.js')
        return route.fulfill({ contentType: 'text/javascript', body: bundle })
      const scene = url.pathname.match(/^\/fixtures\/(\w+)\.json$/)?.[1] ?? ''
      const text = fixtures.get(scene)
      if (text !== undefined) return route.fulfill({ contentType: 'application/json', body: text })
      return route.abort()
    })

    await page.goto(`${ORIGIN}/`)
    await page.waitForFunction(() => typeof (window as any).__modelLoad === 'function')

    const results: SceneResult[] = []
    for (const scene of SCENES) {
      const r: ModelLoadResult = await page.evaluate(
        async ({ scene, runs }) => {
          const text = await (await fetch(`/fixtures/${scene}.json`)).text()
          return (window as any).__modelLoad(text, runs)
        },
        { scene, runs },
      )
      const ms = {
        json: round(r.tJson),
        entities: round(r.tEntities),
        merge: round(r.tMerge),
        total: round(r.tEntities + r.tMerge),
      }
      results.push({ scene, elements: r.elements, ms })
      console.log(
        `${scene} ${r.elements} json=${Math.round(ms.json)} entities=${Math.round(ms.entities)} merge=${Math.round(ms.merge)} total=${Math.round(ms.total)}`,
      )
    }

    const outPath = join(ROOT, 'reports', `model-load-${browserName}.json`)
    mkdirSync(join(ROOT, 'reports'), { recursive: true })
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          browser: browserName,
          version: browser.version(),
          launch:
            browserName === 'chromium' ? { channel: 'chrome', headless: true } : { headless: true },
          runs,
          unit: 'ms, best of runs per step',
          generatedAt: new Date().toISOString(),
          scenes: results,
        },
        null,
        2,
      ) + '\n',
    )
    console.log(`wrote ${outPath}`)
  } finally {
    await browser.close()
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
