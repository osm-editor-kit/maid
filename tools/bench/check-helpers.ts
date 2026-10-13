/**
 * Pointer, key and state helpers that the browser checks share. A check calls `checkHelpers` once
 * at the start of its body: the map's canvas position is read then, and every helper works from it.
 */
import type { Page } from '@playwright/test'

export type XY = { x: number; y: number }

export type HelpersOptions = {
  /**
   * Blur a text field before a key press. The editor's keys do not work in a text field, and the
   * type search takes the keyboard again after some steps. The snapping check of the interactions
   * script did not do this, so it passes false.
   */
  leaveFields?: boolean
}

export type Helpers = {
  /** The map's canvas position on the page: screen points of the map are relative to it */
  origin: XY
  /** A map point on the page */
  abs: (p: XY) => XY
  /** Moves to the point, optionally with Shift held, then clicks it (once, or `count` times) */
  click: (
    p: XY,
    options?: { shift?: boolean; count?: number; button?: 'left' | 'right' },
  ) => Promise<void>
  /** Presses the left button at `from`, moves to `to` in steps and releases */
  drag: (from: XY, to: XY) => Promise<void>
  /** Presses a key (or a chord such as `Meta+z`) and waits for the map */
  key: (name: string) => Promise<void>
  /** The editor's state: selection, zoom (2 decimals), mode, whether a measure runs, undo label */
  state: () => Promise<{
    selection: string[]
    zoom: number
    mode: string
    measuring: boolean
    undo: string | null
  }>
  /** The selection of the editor */
  selection: () => Promise<string[]>
  /** Screen positions of nodes; a node that is gone, or has no position, is null */
  where: (ids: string[]) => Promise<(XY | null)[]>
  /** Whether two screen points are within `px` pixels; a missing point is never near */
  near: (a: XY | null | undefined, b: XY | null | undefined, px?: number) => boolean
}

export async function checkHelpers(
  page: Page,
  settle: () => Promise<void>,
  options: HelpersOptions = {},
): Promise<Helpers> {
  const leaveFields = options.leaveFields ?? true
  const origin = (await page.evaluate(() => {
    const box = window.__maid.map.getCanvas().getBoundingClientRect()
    return { x: box.left, y: box.top }
  })) as XY
  const abs = (p: XY) => ({ x: origin.x + p.x, y: origin.y + p.y })
  const click: Helpers['click'] = async (p, how = {}) => {
    const at = abs(p)
    await page.mouse.move(at.x, at.y)
    if (how.shift) await page.keyboard.down('Shift')
    await page.mouse.click(at.x, at.y, {
      clickCount: how.count ?? 1,
      button: how.button ?? 'left',
    })
    if (how.shift) await page.keyboard.up('Shift')
    await settle()
  }
  const drag: Helpers['drag'] = async (from, to) => {
    const a = abs(from)
    const b = abs(to)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
    await page.mouse.move(b.x, b.y, { steps: 4 })
    await page.mouse.up()
    await settle()
  }
  const key: Helpers['key'] = async (name) => {
    if (leaveFields) {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
      })
    }
    await page.keyboard.press(name)
    await settle()
  }
  const state: Helpers['state'] = () =>
    page.evaluate(() => {
      const { map, engine } = window.__maid
      return {
        selection: [...engine.selection] as string[],
        zoom: Math.round(map.getZoom() * 100) / 100,
        mode: engine.mode as string,
        measuring: engine.measuring as boolean,
        undo: (engine.undoState().undoLabel ?? null) as string | null,
      }
    })
  const selection: Helpers['selection'] = () =>
    page.evaluate(() => [...window.__maid.engine.selection] as string[])
  const where: Helpers['where'] = (ids) =>
    page.evaluate((ids) => {
      const { map, engine } = window.__maid
      return ids.map((id) => {
        const loc = engine.data.node(id)?.loc
        if (!loc) return null
        const p = map.project(loc)
        return { x: p.x, y: p.y }
      })
    }, ids) as Promise<(XY | null)[]>
  const near: Helpers['near'] = (a, b, px = 3) =>
    !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) <= px
  return { origin, abs, click, drag, key, state, selection, where, near }
}

/**
 * Deletes the given features the way the app does: the delete operation, which the edit menu and
 * the Delete key both run. Returns the next selection, or null when the engine refused (a read-only
 * feature, or one the operation cannot delete).
 */
export const runDelete = (page: Page, ids: string[]) =>
  page.evaluate((ids) => {
    const { engine, editor } = window.__maid
    const operation = editor
      .registry('edit.operation')
      .list()
      .find((o) => o.id === 'delete')!
    engine.setSelected(ids)
    const next = engine.runOperation(operation)
    return next ? [...next] : null
  }, ids)

/**
 * A building (not a highway) and a residential road that are drawn, picked before any change. The
 * road must have at least `roadMinNodes` nodes; `vertex` is the road's second node when there is a
 * road.
 */
export const pickBuildingAndRoad = (page: Page, roadMinNodes = 0) =>
  page.evaluate((roadMinNodes) => {
    const { map, engine } = window.__maid
    let building: string | undefined
    let road: string | undefined
    for (const source of ['osm-areas', 'osm-lines'])
      for (const f of map.querySourceFeatures(source)) {
        const id = String(f.id ?? '')
        const way = id.startsWith('w') && engine.data.way(id)
        if (!way) continue
        if (!building && way.tags.building && !way.tags.highway) building = id
        if (!road && way.tags.highway === 'residential' && way.nodes.length >= roadMinNodes)
          road = id
      }
    const vertex = road ? engine.data.way(road)!.nodes[1] : undefined
    return { building, road, vertex }
  }, roadMinNodes)
