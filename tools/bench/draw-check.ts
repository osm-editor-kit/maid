/**
 * Drawing check for Maid, with real key presses and mouse clicks: draws a line on open ground,
 * continues it, draws a line that snaps to a node and to a way, draws an area, and cancels one.
 * After each it checks the data and what the map has in its sources.
 *
 *   bun tools/bench/draw-check.ts [scene]
 *
 * Needs nine places with open ground in view. Only the small scene has them.
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>` with expected and actual. Exits 1 on
 * any failure, including a request outside localhost.
 */
import { chromium } from '@playwright/test'
import { EDIT_SOURCES } from '../../packages/renderer/src/layers'
import { getScene } from '../fixtures/scenes'
import { PORTS } from '../ports'

const sceneName = process.argv[2] ?? 'small'
const scene = getScene(sceneName)

type XY = { x: number; y: number }
type WayState = {
  id: string | null
  nodes: string[]
  tags: Record<string, string>
  drawnIn: string[]
  undo: string | null
  mode: string
  entities: number
}

async function main(): Promise<number> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  let failed = 0
  const report = (label: string, expected: unknown, actual: unknown) => {
    if (JSON.stringify(expected) === JSON.stringify(actual)) console.log(`ok ${label}`)
    else {
      failed++
      console.log(
        `FAIL ${label}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`,
      )
    }
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
    const page = await context.newPage()
    const blocked = new Map<string, number>()
    await context.route(
      (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
      (route) => {
        const host = new URL(route.request().url()).hostname
        blocked.set(host, (blocked.get(host) ?? 0) + 1)
        return route.abort()
      },
    )
    page.on('pageerror', (error) => report('no uncaught page error', 'none', error.message))

    await page.goto(
      `http://localhost:${PORTS.maid}/?scene=${sceneName}#map=${scene.zoom}/${scene.center[1]}/${scene.center[0]}`,
    )
    await page.waitForFunction(() => (window as any).__bench !== undefined, undefined, {
      timeout: 30000,
    })
    await page.evaluate(() => (window as any).__bench.ready())
    const settle = () => page.evaluate(() => (window as any).__bench.settled())
    await settle()

    // screen positions come from the map's canvas, the mouse works on the page
    const origin = (await page.evaluate(() => {
      const box = (window as any).__maid.map.getCanvas().getBoundingClientRect()
      return { x: box.left, y: box.top }
    })) as XY
    const click = async (at: XY) => {
      await page.mouse.move(origin.x + at.x, origin.y + at.y)
      await page.mouse.click(origin.x + at.x, origin.y + at.y)
      await settle()
    }
    const key = async (name: string) => {
      await page.keyboard.press(name)
      await settle()
    }
    /** The selected way (or the one given), as the data and the map have it */
    const read = (wayId?: string) =>
      page.evaluate(
        ({ wayId, sources }) => {
          const { map, engine } = (window as any).__maid
          const id = wayId ?? new URL(location.href).searchParams.get('id')
          const way = id ? engine.data.way(id) : undefined
          const graph = engine.data.history.staging.graph
          return {
            id: way ? id : null,
            nodes: way ? [...way.nodes] : [],
            tags: way ? { ...way.tags } : {},
            drawnIn: Object.entries(sources)
              .filter(([, source]) =>
                map.querySourceFeatures(source).some((f: any) => String(f.id) === id),
              )
              .map(([name]) => name),
            undo: engine.undoState().undoLabel ?? null,
            mode: engine.mode,
            entities: graph.local?.entities?.size ?? -1,
          }
        },
        { wayId, sources: EDIT_SOURCES },
      ) as Promise<WayState>
    const isNew = (ids: string[]) => ids.map((id) => id.includes('-'))

    // open ground: places with no line, point or label within 14 px (snapping reaches 8), far enough apart from each other
    const free = (await page.evaluate(() => {
      const { map } = (window as any).__maid
      const { width, height } = map.getCanvas().getBoundingClientRect()
      const out: XY[] = []
      for (let y = 100; y < height - 100 && out.length < 9; y += 10)
        for (let x = 100; x < width - 100 && out.length < 9; x += 10) {
          if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 40)) continue
          const hits = map.queryRenderedFeatures([
            [x - 14, y - 14],
            [x + 14, y + 14],
          ])
          // the fill of an area counts as open ground: only outlines are snapped to
          if (hits.every((f: any) => f.layer.type === 'fill')) out.push({ x, y })
        }
      return out
    })) as XY[]
    if (free.length < 9) {
      report('find open ground to draw on', '9 places', `${free.length} places`)
      return 1
    }
    const at = (i: number) => free[i]!

    // --- a line on open ground: 2, three clicks, Enter ---
    await key('2')
    await click(at(0))
    await click(at(1))
    await click(at(2))
    await key('Enter')
    const line = await read()
    // the sidebar now asks for the type and has the keyboard: Escape gives it back to the map
    await key('Escape')
    report('line: three new nodes', [true, true, true], isNew(line.nodes))
    report(
      'line: selected, drawn as a line, back in browse mode',
      ['lines', 'browse'],
      [...line.drawnIn, line.mode],
    )
    report('line: one undo step', 'Added a line', line.undo)

    // --- continue it from its end ---
    await key('2')
    await click(at(2))
    await click(at(3))
    await key('Enter')
    const longer = await read(line.id ?? '')
    await key('Escape')
    report('continue: same way with one more node', [line.id, 4], [longer.id, longer.nodes.length])
    report('continue: undo label', 'Continued a line', longer.undo)
    await key('Meta+z')
    const again = await read(line.id ?? '')
    report('continue, then undo: three nodes again', line.nodes, again.nodes)

    // --- snapping: from open ground to an existing node, then onto a way ---
    const snap = (await page.evaluate(() => {
      const { map, engine } = (window as any).__maid
      const { width, height } = map.getCanvas().getBoundingClientRect()
      const inView = (p: XY) => p.x > 60 && p.y > 60 && p.x < width - 60 && p.y < height - 60
      for (const f of map.queryRenderedFeatures()) {
        const wayId = String(f.id ?? '')
        const way = wayId.startsWith('w') && !wayId.includes('-') && engine.data.way(wayId)
        if (!way || !way.tags.highway || way.nodes.length < 4) continue
        // a junction to snap to, and a long segment of the same way to click in the middle of
        const junction = way.nodes.find((id: string) => (engine.data.nodeUses.get(id) ?? 0) > 1)
        const jLoc = junction && engine.data.node(junction)?.loc
        if (!jLoc) continue
        const j = map.project(jLoc)
        for (let i = 0; i + 1 < way.nodes.length; i++) {
          const a = engine.data.node(way.nodes[i])?.loc
          const b = engine.data.node(way.nodes[i + 1])?.loc
          if (!a || !b) continue
          const pa = map.project(a)
          const pb = map.project(b)
          const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
          if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < 60 || !inView(mid) || !inView(j)) continue
          if (Math.hypot(mid.x - j.x, mid.y - j.y) < 40) continue
          // only this way under the middle, so the click cannot land on something else
          const under = map
            .queryRenderedFeatures([
              [mid.x - 10, mid.y - 10],
              [mid.x + 10, mid.y + 10],
            ])
            .filter((h: any) => h.layer.type !== 'background')
          if (under.some((h: any) => String(h.id) !== wayId)) continue
          return {
            wayId,
            junction,
            junctionAt: { x: j.x, y: j.y },
            edge: [way.nodes[i], way.nodes[i + 1]],
            mid,
          }
        }
      }
      return null
    })) as { wayId: string; junction: string; junctionAt: XY; edge: string[]; mid: XY } | null
    if (!snap) {
      report('find a highway with a junction and a free segment', 'one in view', null)
    } else {
      await key('2')
      await click(at(4))
      await click(snap.junctionAt)
      await click(snap.mid)
      await key('Enter')
      const snapped = await read()
      await key('Escape')
      // several nodes can lie within reach of the click: any existing one under it is right
      const reach = await page.evaluate(
        ({ id, at }) => {
          const { map, engine } = (window as any).__maid
          const loc = engine.data.node(id)?.loc
          const p = loc && map.project(loc)
          // picking looks at a square of 8 px each way and at the drawn size of a vertex
          return p ? Math.hypot(p.x - at.x, p.y - at.y) <= 16 : false
        },
        { id: snapped.nodes[1] ?? '', at: snap.junctionAt },
      )
      report(
        'snap: the second node is an existing node under the click',
        [false, true],
        [(snapped.nodes[1] ?? '-').includes('-'), reach],
      )
      const target = await read(snap.wayId)
      const between = target.nodes.indexOf(snapped.nodes[2] ?? '')
      report(
        'snap: the third node is new and sits in the clicked way between the two nodes',
        [true, [snap.edge[0], snap.edge[1]].sort((a, b) => a!.localeCompare(b!))],
        [
          (snapped.nodes[2] ?? '').includes('-'),
          [target.nodes[between - 1], target.nodes[between + 1]].sort((a, b) =>
            (a ?? '').localeCompare(b ?? ''),
          ),
        ],
      )
      await key('Meta+z')
      const restored = await read(snap.wayId)
      report(
        'snap, then undo: the clicked way has its nodes back',
        -1,
        restored.nodes.indexOf(snapped.nodes[2] ?? ''),
      )
    }

    // --- an area: 3, three clicks, a click on the first node closes it ---
    await key('3')
    await click(at(5))
    await click(at(6))
    await click(at(7))
    await click(at(5))
    const area = await read()
    await key('Escape')
    report(
      'area: closed way with three nodes',
      [4, true],
      [area.nodes.length, area.nodes[0] === area.nodes[3]],
    )
    report(
      'area: area=yes, drawn as an area, browse mode',
      [{ area: 'yes' }, 'areas', 'browse'],
      [area.tags, ...area.drawnIn, area.mode],
    )
    report('area: one undo step', 'Added an area', area.undo)

    // --- Escape drops what was drawn ---
    const before = await read(area.id ?? '')
    await key('2')
    await click(at(8))
    await click(at(3))
    await key('Escape')
    const after = await read(area.id ?? '')
    report(
      'cancel: nothing added, no undo step, browse mode',
      [before.entities, before.undo, 'browse'],
      [after.entities, after.undo, after.mode],
    )

    report('no request outside localhost', {}, Object.fromEntries(blocked))
    return failed ? 1 : 0
  } finally {
    await browser.close()
  }
}

process.exit(await main())
