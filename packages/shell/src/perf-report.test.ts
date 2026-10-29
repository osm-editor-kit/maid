import { describe, expect, test } from 'bun:test'
import { collectPerf, perfReportPort } from './perf-report'

const page = {
  url: 'http://localhost:5192/',
  userAgent: 'test',
  viewport: { width: 402, height: 874, dpr: 3 },
  cores: 6,
  mapLoadedMs: 900,
  drawnMs: 2000,
  settledMs: 2400,
}

describe('perfReportPort', () => {
  test('a port, or nothing', () => {
    expect(perfReportPort('?perf-report=8096')).toBe(8096)
    expect(perfReportPort('?api=mock')).toBeUndefined()
    expect(perfReportPort('?perf-report=abc')).toBeUndefined()
    expect(perfReportPort('?perf-report=70000')).toBeUndefined()
  })
})

describe('collectPerf', () => {
  test('sums the bytes by kind and lists the largest first', () => {
    const resource = [
      {
        name: 'a.js',
        initiatorType: 'script',
        transferSize: 120,
        encodedBodySize: 100,
        decodedBodySize: 300,
      },
      {
        name: 'b.js',
        initiatorType: 'script',
        transferSize: 520,
        encodedBodySize: 500,
        decodedBodySize: 900,
      },
      {
        name: 'c.png',
        initiatorType: 'img',
        transferSize: 0,
        encodedBodySize: 50,
        decodedBodySize: 50,
      },
    ] as unknown as PerformanceEntry[]
    const paint = [{ name: 'first-contentful-paint', startTime: 321 }] as PerformanceEntry[]
    const report = collectPerf({ navigation: [], paint, resource }, page)
    expect(report.resources.script).toEqual({
      count: 2,
      transfer: 640,
      encoded: 600,
      decoded: 1200,
    })
    expect(report.resources.img?.transfer).toBe(0)
    expect(report.largest.map((each) => each.name)).toEqual(['b.js', 'a.js', 'c.png'])
    expect(report.paint).toEqual({ firstPaint: undefined, firstContentfulPaint: 321 })
    expect(report.nav).toBeUndefined()
    expect(report.drawnMs).toBe(2000)
  })
})
