import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const dir = import.meta.dir
const english = (await Bun.file(join(dir, '../messages/en.json')).json()) as Record<string, string>

describe('message ids of the headless code', () => {
  test('every id that parse, load and merge return has an English text', async () => {
    const ids = new Set<string>()
    for (const name of ['parse.ts', 'load.ts', 'merge.ts']) {
      const source = await Bun.file(join(dir, name)).text()
      for (const [id] of source.matchAll(/osmchange_(?:error|note)_[a-z_]+/g)) ids.add(id)
    }
    expect(ids.size).toBeGreaterThan(20)
    expect([...ids].filter((id) => english[id] === undefined)).toEqual([])
  })
})
