import { describe, expect, test } from 'bun:test'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { areaToolKeys, stepAreaTool } from './drawing'

/** The part of the engine stepAreaTool reads, with a log of what it was asked to do */
function fakeEngine(mode: string, moduleId?: string, drawing = false) {
  const log: string[] = []
  const engine = {
    mode,
    moduleMode: moduleId ? { id: moduleId } : undefined,
    draw: { active: drawing },
    setMode: (next: string) => {
      log.push(`mode ${next}`)
      return true
    },
  } as unknown as MaidEngine
  return { engine, log }
}

function tools(log: string[]) {
  return ['rectangle', 'circle'].map((id) => ({ id, start: () => log.push(`start ${id}`) }))
}

describe('stepAreaTool: 3, 33, 333', () => {
  test('3 from browsing starts an area', () => {
    const { engine, log } = fakeEngine('browse')
    stepAreaTool(engine, tools(log))
    expect(log).toEqual(['mode draw-area'])
  })

  test('3 again before the first click starts the first tool, then the next, then the area again', () => {
    const area = fakeEngine('draw-area')
    stepAreaTool(area.engine, tools(area.log))
    expect(area.log).toEqual(['start rectangle'])

    const rectangle = fakeEngine('browse', 'rectangle')
    stepAreaTool(rectangle.engine, tools(rectangle.log))
    expect(rectangle.log).toEqual(['start circle'])

    const circle = fakeEngine('browse', 'circle')
    stepAreaTool(circle.engine, tools(circle.log))
    expect(circle.log).toEqual(['mode draw-area'])
  })

  test('3 after the first click of an area starts a new area, as before', () => {
    const { engine, log } = fakeEngine('draw-area', undefined, true)
    stepAreaTool(engine, tools(log))
    expect(log).toEqual(['mode draw-area'])
  })

  test('without tools 3 is the area key alone', () => {
    const { engine, log } = fakeEngine('draw-area')
    stepAreaTool(engine, [])
    expect(log).toEqual(['mode draw-area'])
  })

  test('the dropdown shows 33 and 333', () => {
    expect([areaToolKeys(0), areaToolKeys(1)]).toEqual(['33', '333'])
  })
})
