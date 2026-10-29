import type { RemoteFetch } from '@osm-editor-kit/maid-core'
import type { BenchApi } from '../../../tools/refs/bench-api'

/**
 * The load timings of one visit, as the page measures them itself (Performance API). `bun run sim-measure` opens the
 * editor in the iOS simulator's Safari, where nothing can read the page from outside without the Web Inspector's
 * clicks: with `?perf-report=<port>` the page sends this to `http://localhost:<port>/report` once its map is drawn
 * and settled. Only in the builds that measure (bench.ts), like `window.__bench`.
 */
export type PerfReport = {
  url: string
  userAgent: string
  viewport: { width: number; height: number; dpr: number }
  cores: number | undefined
  /** ms from the start of the navigation */
  nav: { responseStart: number; domContentLoaded: number; load: number } | undefined
  paint: { firstPaint: number | undefined; firstContentfulPaint: number | undefined }
  /** When the map's style had loaded (bench.ts is called then), the map was drawn, and the editor settled */
  mapLoadedMs: number
  drawnMs: number
  settledMs: number
  /** Bytes by kind (`script`, `css`, `img`, `fetch`, …): over the network (0 from the cache) and their decoded size */
  resources: Record<string, { count: number; transfer: number; encoded: number; decoded: number }>
  /** The 15 largest resources by encoded size */
  largest: { name: string; encoded: number; transfer: number; kind: string }[]
}

/** Reads the report from the page's performance entries. Pure apart from what it is given, for the unit test. */
export function collectPerf(
  entries: {
    navigation: readonly PerformanceEntry[]
    paint: readonly PerformanceEntry[]
    resource: readonly PerformanceEntry[]
  },
  page: Omit<PerfReport, 'nav' | 'paint' | 'resources' | 'largest'>,
): PerfReport {
  const nav = entries.navigation[0] as PerformanceNavigationTiming | undefined
  const paintAt = (name: string) => entries.paint.find((entry) => entry.name === name)?.startTime
  const resources: PerfReport['resources'] = {}
  const all = entries.resource as readonly PerformanceResourceTiming[]
  for (const entry of all) {
    const kind = entry.initiatorType || 'other'
    const total = (resources[kind] ??= { count: 0, transfer: 0, encoded: 0, decoded: 0 })
    total.count += 1
    total.transfer += entry.transferSize ?? 0
    total.encoded += entry.encodedBodySize ?? 0
    total.decoded += entry.decodedBodySize ?? 0
  }
  const largest = [...all]
    .sort((a, b) => (b.encodedBodySize ?? 0) - (a.encodedBodySize ?? 0))
    .slice(0, 15)
    .map((entry) => ({
      name: entry.name,
      encoded: entry.encodedBodySize ?? 0,
      transfer: entry.transferSize ?? 0,
      kind: entry.initiatorType || 'other',
    }))
  return {
    ...page,
    nav: nav && {
      responseStart: Math.round(nav.responseStart),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
    },
    paint: {
      firstPaint: paintAt('first-paint'),
      firstContentfulPaint: paintAt('first-contentful-paint'),
    },
    resources,
    largest,
  }
}

/** The port of `?perf-report=<port>`, or undefined */
export function perfReportPort(search: string): number | undefined {
  const value = Number(new URLSearchParams(search).get('perf-report'))
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : undefined
}

/** Sends the report when the page was opened with `?perf-report=<port>`; does nothing otherwise */
export function startPerfReport(api: BenchApi, editor: { fetch: RemoteFetch }) {
  const port = perfReportPort(location.search)
  if (port === undefined) return
  const mapLoadedMs = Math.round(performance.now())
  void (async () => {
    await api.drawn()
    const drawnMs = Math.round(performance.now())
    await api.settled()
    const settledMs = Math.round(performance.now())
    const report = collectPerf(
      {
        navigation: performance.getEntriesByType('navigation'),
        paint: performance.getEntriesByType('paint'),
        resource: performance.getEntriesByType('resource'),
      },
      {
        url: location.href,
        userAgent: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        cores: navigator.hardwareConcurrency,
        mapLoadedMs,
        drawnMs,
        settledMs,
      },
    )
    // localhost only: the measuring script's own server (tools/sim/measure.ts)
    await editor.fetch(`http://localhost:${port}/report`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(report),
    })
  })().catch((error: unknown) => console.error('[maid] perf report failed', error))
}
