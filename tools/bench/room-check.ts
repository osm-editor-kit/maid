import { checkHelpers, moveToOpenGround, type XY } from './check-helpers'
import { app, runCheck } from './check-page'
/**
 * The room tool of the indoor editor (`--app indoor`), with real clicks and keys on open ground beside the small scene:
 * draws a square, tags it as a building, and checks the "Room" button (off without a building, on with one), a room
 * drawn from wall to wall (Shift for right angles) that shares its two wall nodes with the building, which keeps its
 * shape and tags, the tags indoor=room and the edited level, one undo step, the end with Enter along the guide, and
 * that Escape writes nothing.
 *
 *   bun tools/bench/room-check.ts small --app indoor
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>` with expected and actual. Exits 1 on any failure.
 */

const sceneName = process.argv[2] ?? 'small'
/** A folder for screenshots of the steps (ROOM_SHOTS=<dir>), for a person to look at; unset takes none */
const shots = process.env.ROOM_SHOTS

/** Half the side of the building square, in pixels around the map's centre */
const HALF = 120

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    if (app !== 'indoor') {
      report('the check runs on --app indoor, where the room tool is on', 'indoor', app)
      return
    }
    const { click, key } = await checkHelpers(page, settle)
    const shot = async (name: string) => {
      if (shots) await page.screenshot({ path: `${shots}/${name}.png` })
    }
    await moveToOpenGround(page, settle, sceneName)

    const centre = await page.evaluate(() => {
      const box = window.__maid.map.getCanvas().getBoundingClientRect()
      return { x: Math.round(box.width / 2), y: Math.round(box.height / 2) }
    })
    const at = (dx: number, dy: number): XY => ({ x: centre.x + dx, y: centre.y + dy })

    /** The new ways of the data (negative ids), with their nodes and tags */
    const newWays = () =>
      page.evaluate(() => {
        const { engine } = window.__maid
        const graph = engine.data.history.staging.graph
        const ways: { id: string; nodes: string[]; tags: Record<string, string> }[] = []
        for (const [id, entity] of graph.local?.entities ?? []) {
          if (entity && String(id).startsWith('w-'))
            ways.push({
              id: String(id),
              nodes: [...((entity as { nodes?: string[] }).nodes ?? [])],
              tags: { ...entity.tags },
            })
        }
        return ways
      })
    const undoLabel = () =>
      page.evaluate(() => (window.__maid.engine.undoState().undoLabel ?? null) as string | null)
    const moduleMode = () =>
      page.evaluate(() => (window.__maid.engine.moduleMode?.id ?? null) as string | null)
    const selection = () => page.evaluate(() => [...window.__maid.engine.selection] as string[])
    const button = () => page.getByRole('button', { name: /room/i }).first()
    /** The preview the room tool draws, by kind */
    const preview = () =>
      page.evaluate(() => {
        const source = window.__maid.map.getSource('shapes-room-preview') as
          | { serialize?: () => { data?: { features?: { properties: { kind: string } }[] } } }
          | undefined
        const features = source?.serialize?.().data?.features ?? []
        const kinds: Record<string, number> = {}
        for (const f of features) kinds[f.properties.kind] = (kinds[f.properties.kind] ?? 0) + 1
        return kinds
      })

    // a square, drawn as an area with key 3, closed on its first corner
    await key('3')
    for (const p of [
      at(-HALF, -HALF),
      at(HALF, -HALF),
      at(HALF, HALF),
      at(-HALF, HALF),
      at(-HALF, -HALF),
    ])
      await click(p)
    const drawn = await newWays()
    report('a square is drawn', 1, drawn.length)
    const building = drawn[0]?.id ?? ''
    await page.evaluate((id) => {
      window.__maid.engine.changeTags([id], { set: { building: 'yes' } }, 'Building')
    }, building)
    await key('Escape')
    await settle()

    report('without a selection the Room button is off', true, await button().isDisabled())
    // a click on the building's left wall selects it
    await click(at(-HALF, 0))
    report('a click on the wall selects the building', [building], await selection())
    report('with the building selected the Room button is on', false, await button().isDisabled())
    await button().locator('xpath=..').hover()
    await page.waitForTimeout(800)
    await shot('1-button')

    // the room: a click on the bottom wall, Shift up to a corner, Shift right to a corner, a click on the right wall
    await button().click()
    await settle()
    report('the button starts the room mode', 'room', await moduleMode())
    await page.mouse.move(0, 0)
    const { abs } = await checkHelpers(page, settle)
    const bottom = at(0, HALF)
    await page.mouse.move(abs(bottom).x, abs(bottom).y)
    await settle()
    report('on a wall the start point shows', 1, (await preview()).wall ?? 0)
    await click(bottom)
    await click(at(3, 40), { shift: true })
    const corner = at(80, 40)
    await page.keyboard.down('Shift')
    await page.mouse.move(abs(corner).x, abs(corner).y, { steps: 4 })
    await settle()
    const shown = await preview()
    await shot('2-preview')
    await page.keyboard.up('Shift')
    report(
      'after two clicks the whole room shows, with its guide',
      [1, true],
      [shown.room ?? 0, (shown.guide ?? 0) >= 1],
    )
    await click(at(HALF, 40))
    const after = await newWays()
    const room = after.find((w) => w.id !== building)
    const house = after.find((w) => w.id === building)
    report('a click on the right wall makes the room', true, room !== undefined)
    await shot('3-room')
    report('the room is tagged indoor=room', 'room', room?.tags.indoor)
    const shared = room ? room.nodes.filter((n) => house?.nodes.includes(n)) : []
    // the two wall nodes and the corner of the building between them
    report(
      'the room shares its wall nodes and the corner with the building',
      3,
      new Set(shared).size,
    )
    report('the building keeps its tags', 'yes', house?.tags.building)
    report('the building has the two wall nodes added', 7, house?.nodes.length)
    report('one undo step "Drew a room"', 'Drew a room', await undoLabel())
    report('the mode ends', null, await moduleMode())
    report('the room is selected', [room?.id], await selection())

    await page.evaluate(() => window.__maid.engine.undo())
    await settle()
    const undone = await newWays()
    report(
      'one undo takes the room and the wall nodes back',
      [1, 5],
      [undone.length, undone[0]?.nodes.length],
    )

    // Escape after two clicks writes nothing
    await click(at(-HALF, 0))
    await button().click()
    await settle()
    await click(at(-60, HALF))
    await click(at(-60, 0))
    await key('Escape')
    report(
      'Escape ends the mode and writes nothing',
      [null, 1],
      [await moduleMode(), (await newWays()).length],
    )

    // on level 0, Enter ends the room along the guide back to the wall it started on
    await page.evaluate(() => window.__maid.engine.setLevel(0))
    await settle()
    await click(at(-HALF, 0))
    report('on a level the building can still be selected', [building], await selection())
    await button().click()
    await settle()
    await click(at(-60, HALF))
    await click(at(-60, 30), { shift: true })
    const enterAt = at(40, 30)
    await page.keyboard.down('Shift')
    await page.mouse.move(abs(enterAt).x, abs(enterAt).y, { steps: 4 })
    await page.keyboard.up('Shift')
    await settle()
    await key('Enter')
    const withLevel = (await newWays()).find((w) => w.id !== building)
    report('Enter makes the room along the guide', 5, withLevel?.nodes.length)
    report('the room gets the edited level', { indoor: 'room', level: '0' }, withLevel?.tags)
  }),
)
