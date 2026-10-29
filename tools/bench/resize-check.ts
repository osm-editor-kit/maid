import { checkHelpers, moveToOpenGround, type XY } from './check-helpers'
import { app, runCheck } from './check-page'
/**
 * Resize check for the parking editor, with real mouse drags and modifier keys: draws a rectangle, shows Resize in the
 * edit menu and the inspector's command bar (its tooltip lists K, Shift and Alt), and drags the box's handles. An edge
 * stretches one side and keeps where it was grabbed, Shift on a corner keeps the proportions, Alt keeps the centre, Shift pressed during a drag without
 * a move takes effect at once, and the panel's toggle does what Shift does. After each drag it compares the corners the
 * preview draws with the box's handles, both from the module's source (`map.getSource('resize-box')`, the source's own
 * data, not rendered features), and checks that neither the data nor the undo steps changed. Enter keeps the result as
 * one undo step; undo puts the area back; K starts the mode again, Escape leaves the data as it was, undo during a
 * resize only ends it, and a click outside the box applies.
 *
 *   bun tools/bench/resize-check.ts small --app parking
 *
 * Needs open ground in view: the small scene has it. Prints one line per check: `ok <check>`, or `FAIL <check>` with
 * expected and actual. Exits 1 on any failure, including a request outside localhost.
 * Expected: 32 `ok` lines.
 */

const sceneName = process.argv[2] ?? 'small'

/** The area's rectangle on the screen: 120 by 80 px around a centre on open ground */
const HALF_W = 60
const HALF_H = 40

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    if (app !== 'parking') {
      report('the check runs on --app parking, where Resize is on', 'parking', app)
      return
    }
    const { abs, click, key, where, selection } = await checkHelpers(page, settle)
    await moveToOpenGround(page, settle, sceneName)

    // open ground for the rectangle, with room around it for the drags (up to 100 px beyond each side)
    const centre = (await page.evaluate(
      ({ hw, hh }) => {
        const { map } = window.__maid
        const { width, height } = map.getCanvas().getBoundingClientRect()
        const open = (x: number, y: number) =>
          map
            .queryRenderedFeatures([
              [x - 14, y - 14],
              [x + 14, y + 14],
            ])
            .every((f: any) => f.layer.type === 'fill')
        for (let y = 220; y < height - 220; y += 20)
          for (let x = 260; x < width - 260; x += 20) {
            const corners: [number, number][] = [
              [x - hw, y - hh],
              [x + hw, y - hh],
              [x + hw, y + hh],
              [x - hw, y + hh],
            ]
            if (corners.every(([cx, cy]) => open(cx, cy))) return { x, y }
          }
        return undefined
      },
      { hw: HALF_W, hh: HALF_H },
    )) as XY | undefined
    if (!centre) {
      report('find open ground for a rectangle with room around it', 'place', 'none')
      return
    }

    const undoLabel = () =>
      page.evaluate(() => window.__maid.engine.undoState().undoLabel ?? null) as Promise<
        string | null
      >
    const modeId = () =>
      page.evaluate(() => window.__maid.engine.moduleMode?.id ?? null) as Promise<string | null>
    const nodesOf = (id: string) =>
      page.evaluate((id) => [...(window.__maid.engine.data.way(id)?.nodes ?? [])], id) as Promise<
        string[]
      >
    /** The box's handles on the screen, from the source's own data; empty when the box is not drawn */
    const handles = () =>
      page.evaluate(async () => {
        const { map } = window.__maid
        const source = map.getSource('resize-box') as
          | { getData(): Promise<{ features?: any[] }> }
          | undefined
        const features = (await source?.getData())?.features ?? []
        const out: Record<string, { x: number; y: number }> = {}
        for (const feature of features) {
          const name = feature.properties?.handle as string | undefined
          if (!name) continue
          const p = map.project(feature.geometry.coordinates)
          out[name.replace('resize:', '')] = { x: p.x, y: p.y }
        }
        return out
      }) as Promise<Record<string, XY>>

    /** The rectangle's four corners on the screen, in the order drawn (top left, top right, bottom right, bottom left) */
    const cornersOf = async (id: string) => (await where((await nodesOf(id)).slice(0, 4))) as XY[]
    const sizeOf = (corners: XY[]) => ({
      w: Math.hypot(corners[1]!.x - corners[0]!.x, corners[1]!.y - corners[0]!.y),
      h: Math.hypot(corners[2]!.x - corners[1]!.x, corners[2]!.y - corners[1]!.y),
    })
    const round = (n: number) => Math.round(n)
    /**
     * The area's corners as the preview draws them during the resize, from the source's own data (the fill's ring, in the
     * way's order); the data changes only when the resize is kept
     */
    const drawnCorners = () =>
      page.evaluate(async () => {
        const { map } = window.__maid
        const source = map.getSource('resize-box') as
          | { getData(): Promise<{ features?: any[] }> }
          | undefined
        const features = (await source?.getData())?.features ?? []
        const fill = features.find((f) => f.properties?.kind === 'preview-fill')
        const ring = (fill?.geometry.coordinates[0] ?? []) as [number, number][]
        return ring.slice(0, 4).map((c) => {
          const p = map.project(c)
          return { x: p.x, y: p.y }
        })
      }) as Promise<XY[]>
    const sameCorners = (a: XY[], b: XY[]) =>
      a.length === b.length && a.every((p, i) => Math.hypot(p.x - b[i]!.x, p.y - b[i]!.y) <= 1)
    /** Whether the box's corner handles sit on the corners the preview draws, within 2 px */
    const boxOnArea = async () => {
      const corners = await drawnCorners()
      if (corners.length < 4) return false
      const h = await handles()
      const pairs: [XY | undefined, XY][] = [
        [h.nw, corners[0]!],
        [h.ne, corners[1]!],
        [h.se, corners[2]!],
        [h.sw, corners[3]!],
      ]
      return pairs.every(([a, b]) => !!a && Math.hypot(a.x - b.x, a.y - b.y) <= 2)
    }

    /**
     * A real drag of a handle by (dx, dy) px, with keys held from before the press to after the release. `grab` presses
     * that far from the handle's centre, within its hit radius.
     */
    const dragHandle = async (
      name: string,
      dx: number,
      dy: number,
      keys: string[] = [],
      grab: XY = { x: 0, y: 0 },
    ) => {
      const from = (await handles())[name]
      if (!from) return false
      const a = abs({ x: from.x + grab.x, y: from.y + grab.y })
      for (const k of keys) await page.keyboard.down(k)
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      await page.mouse.move(a.x + dx / 2, a.y + dy / 2, { steps: 4 })
      await page.mouse.move(a.x + dx, a.y + dy, { steps: 4 })
      await page.mouse.up()
      for (const k of [...keys].reverse()) await page.keyboard.up(k)
      await settle()
      return true
    }

    // --- draw the rectangle: key 3, four corners, the first again ---
    const drawn: XY[] = [
      { x: centre.x - HALF_W, y: centre.y - HALF_H },
      { x: centre.x + HALF_W, y: centre.y - HALF_H },
      { x: centre.x + HALF_W, y: centre.y + HALF_H },
      { x: centre.x - HALF_W, y: centre.y + HALF_H },
    ]
    await key('3')
    for (const p of drawn) await click(p)
    await click(drawn[0]!)
    const areaId = (await selection())[0]
    await key('Escape')
    if (!areaId) {
      report('the rectangle is drawn', 'a way', null)
      return
    }
    await page.evaluate((id) => window.__bench.select(id), areaId)
    await settle()
    const original = await cornersOf(areaId)
    const undoAfterDraw = await undoLabel()

    // --- the command bar: Resize with K, and Shift and Alt in its tooltip ---
    const button = page.getByRole('button', { name: 'Resize', exact: true })
    report('the inspector has a Resize button', 1, await button.count())
    await button.hover()
    await page.waitForTimeout(900)
    const tip = (await page.locator('[role="tooltip"]').allInnerTexts()).join(' ')
    report(
      'its tooltip shows the key K, Shift for proportions and Alt for the centre',
      [true, true, true],
      [
        /\bK\b/.test(tip),
        /(Shift|⇧)\s*Keep proportions/.test(tip),
        /(Alt|⌥)\s*From the centre/.test(tip),
      ],
    )
    await page.mouse.move(abs(centre).x, abs(centre).y)

    // --- the edit menu offers Resize; choosing it shows the box on the area, and the panel ---
    const menu = page.getByRole('menu', { name: 'Edit' })
    await click({ x: centre.x, y: centre.y - HALF_H }, { button: 'right' })
    const items = (await menu.getByRole('menuitem').allInnerTexts()).map((t) => t.split('\n')[0])
    report('the edit menu offers Resize', true, items.includes('Resize'))
    await menu.getByRole('menuitem', { name: 'Resize' }).click()
    await settle()
    report('the resize mode is on', 'resize', await modeId())
    report('the box has eight handles', 8, Object.keys(await handles()).length)
    report('the box sits on the area', true, await boxOnArea())
    const panel = page.locator('[data-resize-panel]')
    report('the panel is open', 1, await panel.count())

    // --- the east edge: only the east side moves, by 60 px ---
    await dragHandle('e', 60, 25)
    let now = await drawnCorners()
    report(
      'e +60 px: the west side stays, the east side moves 60 px, the height stays',
      [true, 180, 80],
      [
        Math.hypot(now[0]!.x - original[0]!.x, now[0]!.y - original[0]!.y) <= 1.5,
        round(sizeOf(now).w),
        round(sizeOf(now).h),
      ],
    )
    report('the box follows the area', true, await boxOnArea())
    report('no undo step yet', undoAfterDraw, await undoLabel())
    report(
      'the data stays until the resize is kept',
      true,
      sameCorners(await cornersOf(areaId), original),
    )

    // --- grabbed 8 px beside the east handle: the side moves by the drag, it does not jump to the pointer ---
    await dragHandle('e', 20, 0, [], { x: 8, y: 0 })
    now = await drawnCorners()
    report(
      'e grabbed 8 px off, +20 px: the area is 200 px wide, not 208',
      200,
      round(sizeOf(now).w),
    )
    await dragHandle('e', -20, 0)
    now = await drawnCorners()

    // --- Shift on the south-east corner: the proportions stay (180 by 80) ---
    const ratio = sizeOf(now).w / sizeOf(now).h
    await dragHandle('se', 90, 10, ['Shift'])
    now = await drawnCorners()
    report(
      'se with Shift: the proportions stay and the box grows',
      [true, true],
      [Math.abs(sizeOf(now).w / sizeOf(now).h - ratio) < 0.02, sizeOf(now).w > 200],
    )
    report('the box follows the area', true, await boxOnArea())

    // --- Alt on the east edge: the west side moves the other way ---
    const beforeAlt = now
    await dragHandle('e', 20, 0, ['Alt'])
    now = await drawnCorners()
    report(
      'e +20 px with Alt: the west side moves 20 px west, the middle stays (within 1.5 px)',
      [true, true],
      [
        Math.abs(now[0]!.x - beforeAlt[0]!.x + 20) <= 1.5,
        Math.abs((now[0]!.x + now[1]!.x) / 2 - (beforeAlt[0]!.x + beforeAlt[1]!.x) / 2) <= 1.5,
      ],
    )

    // --- Shift pressed during a drag without a move: the box changes at once ---
    const beforeKey = await drawnCorners()
    const ne = (await handles()).ne!
    const a = abs(ne)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(a.x + 40, a.y - 4, { steps: 4 })
    await settle()
    const free = sizeOf(await drawnCorners())
    await page.keyboard.down('Shift')
    await settle()
    const held = sizeOf(await drawnCorners())
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await settle()
    const startRatio = sizeOf(beforeKey).w / sizeOf(beforeKey).h
    report(
      'Shift during a drag, no move: the box takes the proportions at once',
      [false, true],
      [
        Math.abs(free.w / free.h - startRatio) < 0.02,
        Math.abs(held.w / held.h - startRatio) < 0.02,
      ],
    )

    // --- Enter keeps everything as one undo step, the area still selected ---
    const final = await drawnCorners()
    await key('Enter')
    report('Enter: one undo step, named Resized a feature', 'Resized a feature', await undoLabel())
    report(
      'the mode ends and the area is still selected',
      [null, [areaId]],
      [await modeId(), await selection()],
    )
    report('the box is gone', 0, Object.keys(await handles()).length)
    const kept = await cornersOf(areaId)
    report(
      'the area keeps its last shape',
      true,
      kept.every((p, i) => Math.hypot(p.x - final[i]!.x, p.y - final[i]!.y) <= 1),
    )

    // --- undo puts the area back as drawn ---
    await key('ControlOrMeta+z')
    const undone = await cornersOf(areaId)
    report(
      'undo: the area is back as drawn',
      [true, undoAfterDraw],
      [
        undone.every((p, i) => Math.hypot(p.x - original[i]!.x, p.y - original[i]!.y) <= 1),
        await undoLabel(),
      ],
    )

    // --- K starts it again; a drag and Escape leave the data as it was ---
    await page.evaluate((id) => window.__bench.select(id), areaId)
    await settle()
    await key('k')
    report('K starts the resize mode', 'resize', await modeId())
    await dragHandle('n', 0, -50)
    const stretched = sizeOf(await drawnCorners())
    report('n -50 px: the area is 130 px high', 130, round(stretched.h))
    await key('Escape')
    const escaped = await cornersOf(areaId)
    report(
      'Escape: the mode ends, the area is as drawn, no undo step',
      [null, true, undoAfterDraw],
      [
        await modeId(),
        escaped.every((p, i) => Math.hypot(p.x - original[i]!.x, p.y - original[i]!.y) <= 1),
        await undoLabel(),
      ],
    )

    // --- undo during a resize only ends it: the step before stays ---
    await key('k')
    await dragHandle('n', 0, -30)
    await key('ControlOrMeta+z')
    report(
      'undo during a resize: the mode ends, the area is as drawn, the drawing is not undone',
      [null, true, undoAfterDraw],
      [await modeId(), sameCorners(await cornersOf(areaId), original), await undoLabel()],
    )

    // --- the panel's toggle keeps the proportions without Shift; a click outside the box applies ---
    await key('k')
    report('K again: the mode is on', 'resize', await modeId())
    await panel.getByRole('button', { name: /Keep proportions/ }).click()
    await settle()
    report(
      'the toggle is pressed',
      'true',
      await panel.getByRole('button', { name: /Keep proportions/ }).getAttribute('aria-pressed'),
    )
    await dragHandle('se', 60, 0)
    const toggled = sizeOf(await drawnCorners())
    report(
      'se +60 px with the toggle: the proportions stay (3 to 2)',
      true,
      Math.abs(toggled.w / toggled.h - 1.5) < 0.02 && toggled.w > 150,
    )
    // a held Shift turns the toggle round: the corner stretches freely
    await dragHandle('se', 0, 40, ['Shift'])
    const freed = sizeOf(await drawnCorners())
    report(
      'se with Shift and the toggle: the width stays (within 1.5 px), the height grows',
      [true, true],
      [Math.abs(freed.w - toggled.w) <= 1.5, freed.h > toggled.h + 30],
    )
    const panelBox = await panel.boundingBox()
    const outside = { x: centre.x - HALF_W - 120, y: centre.y + HALF_H + 120 }
    report(
      'the place for the click outside is not under the panel',
      true,
      !panelBox || abs(outside).y > panelBox.y + panelBox.height,
    )
    await click(outside)
    report(
      'a click outside the box: one undo step, the mode ends',
      ['Resized a feature', null],
      [await undoLabel(), await modeId()],
    )
  }),
)
