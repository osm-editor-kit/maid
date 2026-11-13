/**
 * MapRoulette's API v2 as the mock answers it, for Maid MapRoulette (packages/module-maproulette), under
 * /maproulette/api/v2. The challenges and tasks are the made-up ones of fixtures/maproulette (`bun run
 * fixtures-maproulette`); a task's status changes in memory only and /maproulette/reset forgets the changes, as the user
 * preferences do. No request goes to maproulette.org (AGENTS.md, core rule 1).
 *
 *   GET  /tasks/box/{left}/{bottom}/{right}/{top}?tStatus=0,1,2&includeGeometries=true   the tasks in the box
 *   GET  /challenge/{id}, GET /task/{id}
 *   POST /task/{id}/comment?actionId=…, PUT /task/{id}/{status}, GET /task/{id}/release   need a login: an
 *        `Authorization` or an `apiKey` header, any value but `invalid` (that one is a 401, for the checks)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Json = Record<string, unknown>
const BASE = '/maproulette/api/v2'
const ROOT = join(import.meta.dir, '../../fixtures/maproulette')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
}

export type MapRouletteMock = {
  /** The answer to a MapRoulette request, or null when the path is not MapRoulette's */
  answer: (req: Request, url: URL) => Promise<Response | null>
}

export function createMapRouletteMock(): MapRouletteMock {
  const challenges = JSON.parse(readFileSync(join(ROOT, 'challenges.json'), 'utf8')) as Json[]
  const fixtureTasks = JSON.parse(readFileSync(join(ROOT, 'tasks.json'), 'utf8')) as Json[]
  // the tasks with the statuses set since the start (or the last reset)
  let tasks = new Map(fixtureTasks.map((task) => [Number(task.id), structuredClone(task)]))
  const comments = new Map<number, string[]>()

  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
  const loggedIn = (req: Request) => {
    const header = req.headers.get('authorization') ?? req.headers.get('apikey')
    return header !== null && !header.endsWith('invalid')
  }

  return {
    async answer(req, url) {
      if (url.pathname === '/maproulette/reset') {
        tasks = new Map(fixtureTasks.map((task) => [Number(task.id), structuredClone(task)]))
        comments.clear()
        return json({ ok: true })
      }
      if (!url.pathname.startsWith(`${BASE}/`)) return null
      const path = url.pathname.slice(BASE.length)

      const box = path.match(/^\/tasks\/box\/([-\d.]+)\/([-\d.]+)\/([-\d.]+)\/([-\d.]+)$/)
      if (box && req.method === 'GET') {
        const [left, bottom, right, top] = box.slice(1).map(Number) as [
          number,
          number,
          number,
          number,
        ]
        const statuses = url.searchParams.get('tStatus')?.split(',').map(Number)
        const geometries = url.searchParams.get('includeGeometries') === 'true'
        const inBox = [...tasks.values()].filter((task) => {
          const point = task.point as { lng: number; lat: number }
          const status = Number(task.status ?? 0)
          return (
            point.lng >= left &&
            point.lng <= right &&
            point.lat >= bottom &&
            point.lat <= top &&
            (!statuses || statuses.includes(status))
          )
        })
        return json(
          inBox.map((task) => {
            const { geometries: taskGeometries, instruction: _, ...rest } = task
            return geometries ? { ...rest, geometries: taskGeometries } : rest
          }),
        )
      }

      const challenge = path.match(/^\/challenge\/(\d+)$/)
      if (challenge && req.method === 'GET') {
        const found = challenges.find((c) => c.id === Number(challenge[1]))
        return found ? json(found) : json({ status: 'NotFound', message: 'No challenge' }, 404)
      }

      const task = path.match(/^\/task\/(\d+)(?:\/([a-z]+|\d+))?$/)
      if (task) {
        const id = Number(task[1])
        const found = tasks.get(id)
        if (!found) return json({ status: 'NotFound', message: 'No task' }, 404)
        const action = task[2]
        if (action === undefined && req.method === 'GET') return json(found)
        if (!loggedIn(req)) return json({ status: 'Unauthorized', message: 'Not logged in' }, 401)
        if (action === 'release' && req.method === 'GET') return json(found)
        if (action === 'comment' && req.method === 'POST') {
          const body = (await req.json().catch(() => ({}))) as { comment?: string }
          comments.set(id, [...(comments.get(id) ?? []), body.comment ?? ''])
          return json({ id: comments.get(id)?.length ?? 0, taskId: id, comment: body.comment })
        }
        if (action !== undefined && /^\d+$/.test(action) && req.method === 'PUT') {
          found.status = Number(action)
          found.mappedOn = new Date().toISOString()
          return new Response(null, { status: 204, headers: CORS })
        }
      }
      return json({ status: 'BadRequest', message: 'Not served by the mock' }, 400)
    },
  }
}
