import { describe, expect, it } from 'bun:test'
import { createMapRouletteMock } from './maproulette'

const mock = createMapRouletteMock()
const BASE = 'http://localhost:8090/maproulette/api/v2'
const ask = async (path: string, init?: RequestInit) => {
  const url = new URL(`${BASE}${path}`)
  const response = await mock.answer(new Request(url, init), url)
  if (!response) throw new Error(`no answer for ${path}`)
  return response
}

describe('MapRoulette mock', () => {
  it('serves the open tasks in a box, with their geometries', async () => {
    const response = await ask(
      '/tasks/box/13.393/52.385/13.407/52.393?tStatus=0&includeGeometries=true',
    )
    const tasks = (await response.json()) as {
      status: number
      geometries?: unknown
      parentId: number
    }[]
    expect(tasks.length).toBeGreaterThan(10)
    expect(tasks.every((task) => task.status === 0 && task.geometries !== undefined)).toBe(true)
    expect(new Set(tasks.map((task) => task.parentId))).toEqual(new Set([9001, 9002, 9003]))
  })

  it('serves a challenge and a task, and 404 for others', async () => {
    expect(((await (await ask('/challenge/9001')).json()) as { name: string }).name).toBe(
      'Footways without surface',
    )
    expect((await ask('/challenge/1')).status).toBe(404)
    expect((await ask('/task/190001')).status).toBe(200)
  })

  it('changes a status only with a login, and forgets it on reset', async () => {
    expect((await ask('/task/190001/1', { method: 'PUT' })).status).toBe(401)
    expect(
      (await ask('/task/190001/1', { method: 'PUT', headers: { apiKey: 'invalid' } })).status,
    ).toBe(401)
    const put = await ask('/task/190001/1', {
      method: 'PUT',
      headers: { Authorization: 'Bearer t' },
    })
    expect(put.status).toBe(204)
    expect(((await (await ask('/task/190001')).json()) as { status: number }).status).toBe(1)
    const reset = new URL('http://localhost:8090/maproulette/reset')
    await mock.answer(new Request(reset), reset)
    expect(((await (await ask('/task/190001')).json()) as { status: number }).status).toBe(0)
  })

  it('leaves other paths to the OSM mock', async () => {
    const url = new URL('http://localhost:8090/s/small/api/0.6/map?bbox=0,0,1,1')
    expect(await mock.answer(new Request(url), url)).toBeNull()
  })
})
