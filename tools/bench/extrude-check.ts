import { checkHelpers, moveToOpenGround, type XY } from './check-helpers'
import { app, runCheck } from './check-page'
/**
 * Extrude check for the parking editor, with real mouse drags and keys: draws a rectangle, shows Extrude in the
 * inspector's command bar (its tooltip lists J and Shift) and pulls sides with the handles of the module's source
 * (`map.getSource('extrude-sides')`, the source's own data). The east side pulled out makes the rectangle longer with no
 * new corner and the panel shows the distance; two clicks on the outline add two corners and the part between pulled
 * out is a bump with two new corners; Shift moves the bump's side without new corners; a second bump snaps in line with
 * the first and shows a guide, Alt pulls it freely. Each pull and each corner is one
 * undo step and the mode stays on; Enter ends it with the area selected; J starts it again and Escape ends it.
 *
 *   bun tools/bench/extrude-check.ts small --app parking
 *
 * Needs open ground in view: the small scene has it. Prints one line per check: `ok <check>`, or `FAIL <check>` with
 * expected and actual. Exits 1 on any failure, including a request outside localhost.
 * Expected: 22 `ok` lines.
 */

const sceneName = process.argv[2] ?? 'small'

/** The area's rectangle on the screen: 120 by 80 px around a centre on open ground */
const HALF_W = 60
const HALF_H = 40

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    if (app !== 'parking' && app !== 'buildings') {
      report(
        'the check runs on --app parking or buildings, where Extrude is on',
        'parking or buildings',
        app,
      )
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
          for (let x = 260; x < width - 300; x += 20) {
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
    /** The handles on the screen, from the source's own data; empty when the extrude is not drawn */
    const handles = () =>
      page.evaluate(async () => {
        const { map } = window.__maid
        const source = map.getSource('extrude-sides') as
          | { getData(): Promise<{ features?: any[] }> }
          | undefined
        const features = (await source?.getData())?.features ?? []
        return features
          .filter((feature) => feature.properties?.kind === 'handle')
          .map((feature) => {
            const p = map.project(feature.geometry.coordinates)
            return { x: p.x, y: p.y }
          })
      }) as Promise<XY[]>
    /** The handle nearest a place on the screen */
    const handleNear = async (p: XY) =>
      (await handles()).reduce<XY | undefined>(
        (best, h) =>
          !best || Math.hypot(h.x - p.x, h.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)
            ? h
            : best,
        undefined,
      )
    /** A real drag from a handle by (dx, dy) px, with keys held from before the press to after the release */
    let lastGuide = false
    const dragFrom = async (from: XY, dx: number, dy: number, keys: string[] = []) => {
      const a = abs(from)
      for (const k of keys) await page.keyboard.down(k)
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      await page.mouse.move(a.x + dx / 2, a.y + dy / 2, { steps: 4 })
      await page.mouse.move(a.x + dx, a.y + dy, { steps: 4 })
      await settle()
      const shown = await page.locator('[data-extrude-distance]').allInnerTexts()
      // whether the pull snapped: the module's source has a guide line during the drag
      lastGuide = await page.evaluate(async () => {
        const source = window.__maid.map.getSource('extrude-sides') as
          | { getData(): Promise<{ features?: any[] }> }
          | undefined
        const features = (await source?.getData())?.features ?? []
        return features.some((f) => f.properties?.kind === 'guide')
      })
      await page.mouse.up()
      for (const k of [...keys].reverse()) await page.keyboard.up(k)
      await settle()
      return shown.join(' ')
    }
    const near = (a: XY | null | undefined, b: XY, px = 1.5) =>
      !!a && Math.hypot(a.x - b.x, a.y - b.y) <= px

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
    const undoAfterDraw = await undoLabel()

    // --- the command bar: Extrude with J, and Shift in its tooltip ---
    const button = page.getByRole('button', { name: 'Extrude', exact: true })
    report('the inspector has an Extrude button', 1, await button.count())
    await button.hover()
    await page.waitForTimeout(900)
    const tip = (await page.locator('[role="tooltip"]').allInnerTexts()).join(' ')
    report(
      'its tooltip shows the key J and Shift to move the side',
      [true, true],
      [/\bJ\b/.test(tip), /(Shift|⇧)\s*Move side/.test(tip)],
    )
    await page.mouse.move(abs(centre).x, abs(centre).y)

    // --- J: a handle on each of the four sides, and the panel ---
    await key('j')
    report('J starts the extrude mode', 'extrude', await modeId())
    report('the rectangle has four handles', 4, (await handles()).length)
    const panel = page.locator('[data-extrude-panel]')
    report('the panel is open', 1, await panel.count())

    // --- the east side pulled 60 px out (and 25 px along it, which does not count) ---
    const east = await handleNear({ x: centre.x + HALF_W, y: centre.y })
    const shown = await dragFrom(east!, 60, 25)
    report('the panel shows the distance out during the pull', true, /\d m out/.test(shown))
    let nodes = await nodesOf(areaId)
    let corners = (await where(nodes.slice(0, 4))) as XY[]
    report(
      'east +60 px: still four corners, the east side 60 px further, the west side where it was',
      [5, true, true, true],
      [
        nodes.length,
        near(corners[1], { x: drawn[1]!.x + 60, y: drawn[1]!.y }),
        near(corners[2], { x: drawn[2]!.x + 60, y: drawn[2]!.y }),
        near(corners[0], drawn[0]!),
      ],
    )
    report(
      'one undo step, the mode stays on',
      ['Extruded a side', 'extrude'],
      [await undoLabel(), await modeId()],
    )

    // --- two clicks on the north side add two corners: the part between them gets a handle ---
    const top = centre.y - HALF_H
    await click({ x: centre.x - 30, y: top })
    await click({ x: centre.x, y: top })
    nodes = await nodesOf(areaId)
    report(
      'two clicks on the outline: two corners more, each its own undo step',
      [7, 'Added a corner', 'extrude'],
      [nodes.length, await undoLabel(), await modeId()],
    )
    report('six handles', 6, (await handles()).length)

    // --- the part between them pulled 40 px up: a bump with two new corners ---
    const part = await handleNear({ x: centre.x - 15, y: top })
    report(
      'the part has its handle in its middle',
      true,
      near(part, { x: centre.x - 15, y: top }, 2),
    )
    await dragFrom(part!, 0, -40)
    nodes = await nodesOf(areaId)
    const bump = (await where(nodes.slice(1, 5))) as XY[]
    report(
      'the bump: nine nodes, the corners on the wall stay, two new ones 40 px above them',
      [9, true, true, true, true],
      [
        nodes.length,
        near(bump[0], { x: centre.x - 30, y: top }),
        near(bump[1], { x: centre.x - 30, y: top - 40 }),
        near(bump[2], { x: centre.x, y: top - 40 }),
        near(bump[3], { x: centre.x, y: top }),
      ],
    )
    report('one undo step for the bump', 'Extruded a side', await undoLabel())

    // --- Shift: the bump's top moves 20 px higher, no new corners ---
    const bumpTop = await handleNear({ x: centre.x - 15, y: top - 40 })
    await dragFrom(bumpTop!, 0, -20, ['Shift'])
    nodes = await nodesOf(areaId)
    const moved = (await where(nodes.slice(2, 4))) as XY[]
    report(
      'Shift: still nine nodes, the top of the bump 60 px above the wall',
      [9, true, true],
      [
        nodes.length,
        near(moved[0], { x: centre.x - 30, y: top - 60 }),
        near(moved[1], { x: centre.x, y: top - 60 }),
      ],
    )

    // --- Enter ends the mode with the area selected; undo takes back the last pull only ---
    await key('Enter')
    report(
      'Enter: the mode ends, the area is still selected, the handles are gone',
      [null, [areaId], 0],
      [await modeId(), await selection(), (await handles()).length],
    )
    await key('ControlOrMeta+z')
    const undone = (await where((await nodesOf(areaId)).slice(2, 4))) as XY[]
    report(
      'undo: the bump is back at 40 px',
      [true, 'Extruded a side'],
      [near(undone[0], { x: centre.x - 30, y: top - 40 }), await undoLabel()],
    )

    // --- J again: a second bump right of the first, pulled 37 px, snaps in line with the first (40 px) ---
    await page.evaluate((id) => window.__bench.select(id), areaId)
    await settle()
    await key('j')
    report('J starts it again', 'extrude', await modeId())
    await click({ x: centre.x + 30, y: top })
    await click({ x: centre.x + 60, y: top })
    const second = await handleNear({ x: centre.x + 45, y: top })
    await dragFrom(second!, 0, -37)
    let nodes2 = await nodesOf(areaId)
    let twin = (await where(nodes2.slice(6, 8))) as XY[]
    report(
      'pulled 37 px near the first bump: it snaps to 40 px, with a guide during the pull',
      [true, true, true],
      [
        lastGuide,
        near(twin[0], { x: centre.x + 30, y: top - 40 }),
        near(twin[1], { x: centre.x + 60, y: top - 40 }),
      ],
    )
    // Alt pulls freely: the same pull stays at 37 px
    // undo ends the mode (as every module mode, engine.undo); J starts it again
    await key('ControlOrMeta+z')
    await key('j')
    const again = await handleNear({ x: centre.x + 45, y: top })
    await dragFrom(again!, 0, -37, ['Alt'])
    nodes2 = await nodesOf(areaId)
    twin = (await where(nodes2.slice(6, 8))) as XY[]
    report(
      'with Alt: no snap, the bump is 37 px high and no guide',
      [false, true],
      [lastGuide, near(twin[0], { x: centre.x + 30, y: top - 37 })],
    )
    const before = await undoLabel()
    await key('Escape')
    report(
      'Escape: the mode ends with no undo step',
      [null, before],
      [await modeId(), await undoLabel()],
    )
    report('the drawing is still in the history', true, undoAfterDraw !== null)
  }),
)
