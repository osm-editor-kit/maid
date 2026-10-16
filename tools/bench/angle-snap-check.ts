import { checkHelpers, type XY, moveToOpenGround } from './check-helpers'
/**
 * Angle snap check for Maid's parking editor, with real key presses and mouse input: Shift turns a line's
 * segment to 45 degrees, a continued line to a right angle, a square area's last corner locks, a dragged
 * corner locks, the guide lines follow the keys, a blur clears them, Shift over a node or a way uses it
 * with no guide, Shift with Alt does not snap, and the first segment is measured from the map's east at
 * a bearing. Every step reads the data, and the guide lines the map has (the `osm-guides` source).
 *
 *   bun tools/bench/angle-snap-check.ts [scene] --app parking
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
/** The unit vector from a to b */
const unit = (a: XY, b: XY) => {
  const d = distance(a, b)
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }
}
/**
 * How far, in pixels, each corner of a closed ring of four strays from a right angle: the outgoing side,
 * measured on the incoming one. Zero is a right angle. Returns the largest of the four.
 */
const squareness = (corners: XY[]) =>
  Math.max(
    ...corners.map((p, i) => {
      const before = corners[(i + 3) % 4]!
      const after = corners[(i + 1) % 4]!
      const along = unit(before, p)
      return Math.abs(along.x * (after.x - p.x) + along.y * (after.y - p.y))
    }),
  )

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    const { abs, key, state, selection, where } = await checkHelpers(page, settle)
    // beside the scene's data: open ground for the drawings of this check
    await moveToOpenGround(page, settle, sceneName)

    /** Screen positions of nodes on the canvas; a node that is gone is NaN, so every comparison with it fails */
    const positions = async (ids: string[]): Promise<XY[]> =>
      (await where(ids)).map((p) => p ?? { x: Number.NaN, y: Number.NaN })
    /** The nodes of a way, as the data has them */
    const nodesOf = (id: string) =>
      page.evaluate(
        (id) => [...(window.__maid.engine.data.way(id)?.nodes ?? [])] as string[],
        id,
      ) as Promise<string[]>
    /** The nodes of the way being drawn; empty when nothing is drawn */
    const drawingNodes = () =>
      page.evaluate(() => [...(window.__maid.engine.draw.way?.nodes ?? [])] as string[])
    const wayExists = (id: string) =>
      page.evaluate((id) => window.__maid.engine.data.way(id) !== undefined, id)
    /**
     * The node that follows the pointer while drawing. The draw tool keeps it private and has no getter for it,
     * so the check reads it on purpose.
     */
    const cursorAt = async (): Promise<XY> => {
      const id = await page.evaluate(
        () => (window.__maid.engine.draw as unknown as { cursorId?: string }).cursorId ?? null,
      )
      return id ? (await positions([id]))[0]! : { x: Number.NaN, y: Number.NaN }
    }
    /** How many guide lines the map shows (the `osm-guides` source; -1 if the source is missing) */
    const guides = () =>
      page.evaluate(async () => {
        const source = window.__maid.map.getSource('osm-guides') as unknown as
          | { getData(): Promise<{ features: unknown[] }> }
          | undefined
        return source ? (await source.getData()).features.length : -1
      }) as Promise<number>

    /** Moves the pointer to `p` on the map, with whatever keys are held */
    const pointer = async (p: XY) => {
      const at = abs(p)
      await page.mouse.move(at.x, at.y)
      await settle()
    }
    /** Clicks at `p` (moving there first), without holding keys */
    const tapAt = async (p: XY) => {
      const at = abs(p)
      await page.mouse.click(at.x, at.y)
      await settle()
    }
    /** Holds the keys while `body` runs, then lets them go */
    const holding = async (keys: string[], body: () => Promise<void>) => {
      for (const k of keys) await page.keyboard.down(k)
      try {
        await body()
      } finally {
        for (const k of [...keys].reverse()) await page.keyboard.up(k)
        await settle()
      }
    }
    /**
     * A drag from `from` to `to`. `press` keys are held when the button goes down, `during` keys are pressed
     * after the first part of the drag, so the constraint starts while the vertex is held.
     */
    const dragWith = async (from: XY, to: XY, press: string[], during: string[]) => {
      const a = abs(from)
      const b = abs(to)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      for (const k of press) await page.keyboard.down(k)
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      await page.mouse.move(mid.x, mid.y, { steps: 4 })
      for (const k of during) await page.keyboard.down(k)
      await page.mouse.move(b.x, b.y, { steps: 4 })
      await page.mouse.up()
      for (const k of [...during, ...press].reverse()) await page.keyboard.up(k)
      await settle()
    }

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
      // --- a line: Shift turns the segment to 45 degrees (the first segment is measured from the map's east) ---
      const [a, b, c] = await openGround('line: open ground for a line at 37 degrees', [
        { x: 0, y: 0 },
        { x: 80, y: 60 },
        { x: 0, y: 120 },
      ])
      await key('2')
      await tapAt(a!)
      await holding(['Shift'], async () => {
        await pointer(b!)
        report('line: a guide shows while the pointer is snapped', 1, await guides())
        await tapAt(b!)
      })
      await key('Enter')
      const line = (await selection())[0] ?? ''
      await key('Escape')
      const lineNodes = await nodesOf(line)
      const [a1, b1] = await positions(lineNodes.slice(0, 2))
      report(
        'line: the first segment is 45 degrees on the screen (within 0.1)',
        true,
        Math.abs(angleOf(a1!, b1!) - 45) <= 0.1,
      )

      // --- continue from the end at a right angle: the reference is the previous segment ---
      await key('2')
      await tapAt(b!)
      await holding(['Shift'], async () => {
        await pointer(c!)
        await tapAt(c!)
      })
      await key('Enter')
      await key('Escape')
      const continued = await nodesOf(line)
      report('continue: the line has three nodes', 3, continued.length)
      const [p0, p1, p2] = await positions(continued.slice(0, 3))
      // the dot product of the two unit segments: zero for a right angle
      const previousSide = unit(p0!, p1!)
      const newSide = unit(p1!, p2!)
      report(
        'continue: the new segment is a right angle to the previous one',
        true,
        Math.abs(previousSide.x * newSide.x + previousSide.y * newSide.y) < 1e-3,
      )

      // --- Shift over an existing node: the node is used, no guide line ---
      const [o2] = await openGround('node: open ground for a line to a node', [{ x: 0, y: 0 }])
      const start = continued[0]!
      const [startAt] = await positions([start])
      await key('2')
      await tapAt(o2!)
      await holding(['Shift'], async () => {
        await pointer(startAt!)
        report('node: no guide line over a node', 0, await guides())
        await tapAt(startAt!)
      })
      await key('Enter')
      const toNode = (await selection())[0] ?? ''
      await key('Escape')
      const [, second] = await nodesOf(toNode)
      report('node: the new line uses the existing node', start, second)

      // --- Shift over a way: a node goes into the way between its two nodes, no guide line ---
      const [o3] = await openGround('way: open ground for a line to a way', [{ x: 0, y: 0 }])
      const [wayA, wayB] = await positions([continued[0]!, continued[1]!])
      const middle = { x: (wayA!.x + wayB!.x) / 2, y: (wayA!.y + wayB!.y) / 2 }
      await key('2')
      await tapAt(o3!)
      await holding(['Shift'], async () => {
        await pointer(middle)
        report('way: no guide line over a way', 0, await guides())
        await tapAt(middle)
      })
      await key('Enter')
      const toWay = (await selection())[0] ?? ''
      await key('Escape')
      const withNode = await nodesOf(line)
      const drawnNodes = await nodesOf(toWay)
      report(
        'way: the way has a new node between its first two nodes',
        true,
        withNode.length === 4 &&
          withNode[0] === continued[0] &&
          withNode[2] === continued[1] &&
          withNode[1]!.includes('-'),
      )
      report('way: the new line uses that node', withNode[1], drawnNodes[1])

      // --- Shift pressed with no move: the preview moves at once; released, it goes back under the pointer ---
      const [o4, b4] = await openGround('press: open ground for a line at 37 degrees', [
        { x: 0, y: 0 },
        { x: 80, y: 60 },
      ])
      await key('2')
      await tapAt(o4!)
      await pointer(b4!)
      report(
        'press: without Shift the preview is under the pointer',
        true,
        distance(await cursorAt(), b4!) <= 1,
      )
      const pressStart = (await positions([(await drawingNodes())[0]!]))[0]!
      await page.keyboard.down('Shift')
      await settle()
      report(
        'press: Shift alone moves the preview to 45 degrees, with no mouse move',
        true,
        Math.abs(angleOf(pressStart, await cursorAt()) - 45) <= 0.1,
      )
      report('press: a guide line shows', 1, await guides())
      await page.keyboard.up('Shift')
      await settle()
      report(
        'release: the preview goes back under the pointer',
        true,
        distance(await cursorAt(), b4!) <= 1,
      )
      report('release: no guide line', 0, await guides())
      await key('Delete')

      // --- Shift with Alt: no angle snap, the preview stays under the pointer ---
      const [o5, b5] = await openGround('alt: open ground for a line at 37 degrees', [
        { x: 0, y: 0 },
        { x: 80, y: 60 },
      ])
      await key('2')
      await tapAt(o5!)
      await holding(['Shift', 'Alt'], async () => {
        await pointer(b5!)
        report(
          'shift with alt: the preview stays under the pointer',
          true,
          distance(await cursorAt(), b5!) <= 1,
        )
        report('shift with alt: no guide line', 0, await guides())
      })
      await key('Delete')

      // --- an area: Shift on the last corners; the fourth locks where the two snapped sides meet ---
      const [s1, s2, s3, s4, q3, q4] = await openGround(
        'area: open ground for a square with a side of 100 px',
        [
          { x: 0, y: 0 },
          { x: 100, y: 3 },
          { x: 103, y: 97 },
          { x: -3, y: 103 },
          { x: 106, y: 94 },
          { x: -40, y: 120 },
        ],
      )
      await key('3')
      await tapAt(s1!)
      await holding(['Shift'], async () => {
        await tapAt(s2!)
        await tapAt(s3!)
        await tapAt(s4!)
      })
      await tapAt(s1!)
      const areaId = (await selection())[0] ?? ''
      await key('Escape')
      const area = await nodesOf(areaId)
      report(
        'area: four corners and the closing node',
        [5, true],
        [area.length, area[0] === area[4]],
      )
      report('area: one undo step, named Added an area', 'Added an area', (await state()).undo)
      const corners = await positions(area.slice(0, 4))
      report('area: the four corners are square within 0.5 px', true, squareness(corners) <= 0.5)
      report(
        'area: the fourth corner sits at the square corner (within 0.5 px)',
        true,
        distance(corners[3]!, { x: corners[0]!.x, y: corners[2]!.y }) <= 0.5,
      )

      // --- a corner dragged with Shift locks to the square; the drag is one undo step ---
      // the edge between the first two corners selects the area, as a click on it does in browse mode
      await tapAt({
        x: (corners[0]!.x + corners[1]!.x) / 2,
        y: (corners[0]!.y + corners[1]!.y) / 2,
      })
      await dragWith(corners[2]!, q3!, [], ['Shift'])
      const [moved3] = await positions([area[2]!])
      report(
        'drag: with Shift the corner locks back to the square corner (within 0.5 px)',
        true,
        distance(moved3!, corners[2]!) <= 0.5,
      )
      report(
        'drag: the four corners stay square after the drag',
        true,
        squareness(await positions(area.slice(0, 4))) <= 0.5,
      )
      report('drag: one undo step, named Moved a node', 'Moved a node', (await state()).undo)
      await key('Meta+z')

      // --- a drag that starts with Shift held still moves the corner ---
      await tapAt({
        x: (corners[0]!.x + corners[1]!.x) / 2,
        y: (corners[0]!.y + corners[1]!.y) / 2,
      })
      await dragWith(corners[3]!, q4!, ['Shift'], [])
      const [moved4] = await positions([area[3]!])
      report(
        'drag: a drag that starts with Shift still moves the corner',
        true,
        distance(moved4!, corners[3]!) > 5,
      )
      report(
        'drag: that drag is one undo step, named Moved a node',
        'Moved a node',
        (await state()).undo,
      )
      await key('Meta+z')

      // --- one undo step for the whole area: the two drags are undone, then the area goes ---
      report(
        'area: the step under the drags is Added an area',
        'Added an area',
        (await state()).undo,
      )
      await key('Meta+z')
      report('area: one undo removes the whole area', false, await wayExists(areaId))

      // --- the window loses focus while Shift is held: the guides go, the preview goes back under the pointer ---
      const [o6, b6] = await openGround('blur: open ground for a line at 37 degrees', [
        { x: 0, y: 0 },
        { x: 80, y: 60 },
      ])
      await key('2')
      await tapAt(o6!)
      await page.keyboard.down('Shift')
      await pointer(b6!)
      report('blur: a guide shows before the blur', 1, await guides())
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
      await settle()
      report('blur: the guide lines are cleared', 0, await guides())
      report(
        'blur: the preview goes back under the pointer',
        true,
        distance(await cursorAt(), b6!) <= 1,
      )
      await page.keyboard.up('Shift')
      await settle()
      await key('Delete')

      // --- bearing 30: map east is at -30 degrees on the screen, so a pointer at 0 degrees snaps to 15 ---
      await page.evaluate(() => {
        window.__maid.map.setBearing(30)
      })
      await settle()
      const [o7, b7] = await openGround('bearing: open ground for a line along the screen', [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ])
      await key('2')
      await tapAt(o7!)
      await holding(['Shift'], async () => {
        await tapAt(b7!)
      })
      await key('Enter')
      const turned = (await selection())[0] ?? ''
      await key('Escape')
      const [t0, t1] = await positions((await nodesOf(turned)).slice(0, 2))
      report(
        'bearing 30: the first segment is 15 degrees on the screen, 45 from map east',
        true,
        Math.abs(angleOf(t0!, t1!) - 15) <= 0.1,
      )
      await page.evaluate(() => {
        window.__maid.map.setBearing(0)
      })
      await settle()
    } catch (error) {
      if (!(error instanceof NoOpenGround)) throw error
    }
  }),
)
