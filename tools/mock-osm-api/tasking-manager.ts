/**
 * HOT's Tasking Manager API v2 as the mock answers it, for module-tasking-manager, under /tasking-manager/api/v2. The
 * project is the made-up one of fixtures/tasking-manager (`bun run fixtures-tasking-manager`). Read only, as Maid reads
 * the TM. No request goes to the TM (AGENTS.md, core rule 1).
 *
 *   GET /projects/{id}/         the project; 4243 is private (403), as a private or draft project is without a login
 *   GET /projects/{id}/tasks/   its tasks, a FeatureCollection
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = '/tasking-manager/api/v2'
const ROOT = join(import.meta.dir, '../../fixtures/tasking-manager')
/** The project the mock calls private, for the error of a project that needs the TM's login */
const PRIVATE = 4243

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** The answer to a TM request, or null when the path is not the TM's */
export function answerTaskingManager(req: Request, url: URL): Response | null {
  if (!url.pathname.startsWith(`${BASE}/`)) return null
  const match = url.pathname.slice(BASE.length).match(/^\/projects\/(\d+)\/(tasks\/)?$/)
  if (!match || req.method !== 'GET')
    return json({ Error: 'Not served by the mock', SubCode: 'BadRequest' }, 400)
  const id = Number(match[1])
  if (id === PRIVATE)
    return json({ Error: 'User not permitted: Private Project', SubCode: 'PrivateProject' }, 403)
  const file = join(ROOT, `${match[2] ? 'tasks' : 'project'}-${id}.json`)
  if (!existsSync(file)) return json({ Error: 'Project Not Found', SubCode: 'NotFound' }, 404)
  return json(JSON.parse(readFileSync(file, 'utf8')))
}
