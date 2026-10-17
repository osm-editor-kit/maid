import { checkHelpers, moveToOpenGround, pickBuildingAndRoad, type XY } from './check-helpers'
/**
 * Long press check for Maid's parking editor, with real touch input (CDP touch events, held for real time):
 * a long press on the Area button opens its dropdown and starts no area, a short tap starts an area, a long
 * press on a building opens the edit menu, and in a line a finger held still for 500 ms is Shift: the segment
 * turns to 45 degrees on the screen, a guide shows during the hold, and the node is placed where the finger lifts.
 *
 *   bun tools/bench/touch-check.ts [scene] --app parking
 *
 * The module is on in apps/maid-parking only. Prints one line per check: `ok <check>`, or `FAIL <check>`
 * with expected and actual. Exits 1 on any failure, including a request outside localhost.
 */
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

/** Thrown when the scene has no open ground for a step: the step is reported as FAIL and the run stops there */
class NoOpenGround extends Error {}

/** The screen angle of the segment from a to b, in degrees (y runs down, as the screen does) */
const angleOf = (a: XY, b: XY) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
const distance = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y)

process.exit(
  await runCheck(
    sceneName,
    async ({ page, report, settle }) => {
      const { key, state, selection, where, abs } = await checkHelpers(page, settle)

      /** Screen positions of nodes on the canvas; a node that is gone is NaN, so every comparison with it fails */
      const positions = async (ids: string[]): Promise<XY[]> =>
        (await where(ids)).map((p) => p ?? NOWHERE)
      /** A position where no node is: every comparison with it fails, and so does an angle read from it */
      const NOWHERE: XY = { x: Number.NaN, y: Number.NaN }
      /** The nodes of a way, as the data has them */
      const nodesOf = (id: string) =>
        page.evaluate(
          (id) => [...(window.__maid.engine.data.way(id)?.nodes ?? [])] as string[],
          id,
        ) as Promise<string[]>
      /** The nodes of the way being drawn; empty when nothing is drawn */
      const drawingNodes = () =>
        page.evaluate(() => [...(window.__maid.engine.draw.way?.nodes ?? [])] as string[])
      /**
       * The node that follows the pointer while drawing. The draw tool keeps it private and has no getter for it,
       * so the check reads it on purpose.
       */
      const cursorAt = async (): Promise<XY> => {
        const id = await page.evaluate(
          () => (window.__maid.engine.draw as unknown as { cursorId?: string }).cursorId ?? null,
        )
        return id ? (await positions([id]))[0]! : NOWHERE
      }
      /** How many guide lines the map shows (the `osm-guides` source's lines; -1 if the source is missing) */
      const guides = () =>
        page.evaluate(async () => {
          const source = window.__maid.map.getSource('osm-guides') as unknown as
            | { getData(): Promise<{ features: { geometry: { type: string } }[] }> }
            | undefined
          if (!source) return -1
          return (await source.getData()).features.filter((f) => f.geometry.type === 'LineString')
            .length
        }) as Promise<number>
      const shiftHeld = () =>
        page.evaluate(() => window.__maid.engine.modifiers.shift) as Promise<boolean>

      // real touch input: the browser's own touch events, with the time the finger is down held for real
      const cdp = await page.context().newCDPSession(page)
      const touchStart = (p: XY) =>
        cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: p.x, y: p.y }],
        })
      const touchEnd = () =>
        cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      /** A quick tap: down and up, with a short time between */
      const tap = async (p: XY) => {
        await touchStart(p)
        await page.waitForTimeout(60)
        await touchEnd()
        await settle()
      }
      /** The finger is down at `p` and still: long enough for a long press (500 ms), with a margin */
      const holdAt = (p: XY) => touchStart(p).then(() => page.waitForTimeout(700))

      /**
       * Open ground for a set of pointer places, all `offsets` from one origin: no line, point or label within
       * 14 px of any of them, and at least 60 px from the places already used. Remembers them for later steps.
       */
      const used: XY[] = []
      const openGround = async (label: string, offsets: XY[]): Promise<XY[]> => {
        const origin = (await page.evaluate(
          ({ offsets, used }) => {
            const { map } = window.__maid
            const { width, height } = map.getCanvas().getBoundingClientRect()
            const inView = (p: XY) => p.x > 40 && p.y > 40 && p.x < width - 40 && p.y < height - 40
            // a fill is open ground: only outlines and points are snapped to
            const openAt = (p: XY) =>
              map
                .queryRenderedFeatures([
                  [p.x - 14, p.y - 14],
                  [p.x + 14, p.y + 14],
                ])
                .every((f: any) => f.layer.type === 'fill' || f.layer.type === 'background')
            for (let y = 80; y < height - 80; y += 16)
              for (let x = 80; x < width - 80; x += 16) {
                const points = offsets.map((o) => ({ x: x + o.x, y: y + o.y }))
                if (!points.every(inView)) continue
                if (points.some((p) => used.some((u) => Math.hypot(p.x - u.x, p.y - u.y) < 60)))
                  continue
                if (points.every(openAt)) return { x, y }
              }
            return null
          },
          { offsets, used },
        )) as XY | null
        if (!origin) {
          report(label, 'open ground', null)
          throw new NoOpenGround(label)
        }
        const points = offsets.map((o) => ({ x: origin.x + o.x, y: origin.y + o.y }))
        used.push(...points)
        return points
      }

      try {
        // --- the Area button: a long press opens its dropdown and starts no area ---
        const areaButton = page.getByRole('button', { name: /^Draw an area.*\(3\)$/ })
        const box = await areaButton.boundingBox()
        if (!box) throw new Error('the Area button is not on the page')
        const areaCentre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        await holdAt(areaCentre)
        const rectangle = page.getByRole('menuitem', { name: 'Rectangle' })
        const listed = await rectangle
          .waitFor({ state: 'visible', timeout: 2000 })
          .then(() => true)
          .catch(() => false)
        report('area long press: the dropdown lists Rectangle', true, listed)
        await touchEnd()
        await settle()
        // the click that the touch sends after the long press starts nothing
        await page.waitForTimeout(150)
        report('area long press: no area is started', 'browse', (await state()).mode)
        await key('Escape')

        // --- the Area button: a short tap starts an area ---
        await tap(areaCentre)
        report('area tap: starts drawing an area', 'draw-area', (await state()).mode)
        await key('Escape')

        // --- a building: a long press opens the edit menu, and the menu stays open when the finger lifts ---
        const { building } = await pickBuildingAndRoad(page)
        if (!building) throw new Error('the scene has no building in view')
        const buildingNodes = await nodesOf(building)
        const corners = (await positions(buildingNodes)).filter((p) => Number.isFinite(p.x))
        const centre = {
          x: corners.reduce((sum, p) => sum + p.x, 0) / corners.length,
          y: corners.reduce((sum, p) => sum + p.y, 0) / corners.length,
        }
        const menu = page.locator('[role="menu"][aria-label="Edit"]')
        await holdAt(abs(centre))
        report('building long press: the edit menu opens', 1, await menu.count())
        report(
          'building long press: the building is selected',
          true,
          (await selection()).includes(building),
        )
        await touchEnd()
        await settle()
        await page.waitForTimeout(150)
        report(
          'building long press: the menu stays open when the finger lifts',
          1,
          await menu.count(),
        )
        await key('Escape')

        // --- a line: a finger held still for 500 ms is Shift; the node goes where the finger lifts ---
        await moveToOpenGround(page, settle, sceneName)
        const [a, b] = await openGround('line: open ground for a line at 37 degrees', [
          { x: 0, y: 0 },
          { x: 80, y: 60 },
        ])
        await key('2')
        await tap(abs(a!))
        const [start = NOWHERE] = await positions([(await drawingNodes())[0]!])
        report(
          'line tap: the line starts where the finger tapped (within 1 px)',
          true,
          distance(start, a!) <= 1,
        )

        await holdAt(abs(b!))
        await settle()
        report('hold: a guide line shows during the hold', 1, await guides())
        report(
          'hold: the preview is at 45 degrees from the start (within 0.1)',
          true,
          Math.abs(angleOf(start!, await cursorAt()) - 45) <= 0.1,
        )
        await touchEnd()
        await settle()
        await page.waitForTimeout(150)
        report('hold: no guide line once the finger has lifted', 0, await guides())
        report('hold: Shift is let go when the finger lifts', false, await shiftHeld())

        await key('Enter')
        const line = (await selection())[0] ?? ''
        await key('Escape')
        const nodes = await nodesOf(line)
        report('hold: the line has its two nodes', 2, nodes.length)
        const [p0 = NOWHERE, p1 = NOWHERE] = await positions(nodes.slice(0, 2))
        report(
          'hold: the placed node is 45 degrees from the start (within 0.1)',
          true,
          Math.abs(angleOf(p0, p1) - 45) <= 0.1,
        )
      } catch (error) {
        if (!(error instanceof NoOpenGround)) throw error
      }
    },
    '',
    true,
  ),
)
