import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { parseTaskFile } from './parse.ts'

/** The first JSON code block of FORMAT.md, the example that people and models copy */
async function exampleOfFormat(): Promise<unknown> {
  const text = await Bun.file(join(import.meta.dir, '..', 'FORMAT.md')).text()
  const match = /```json\n([\s\S]*?)\n```/.exec(text)
  if (!match?.[1]) throw new Error('FORMAT.md has no JSON example')
  return JSON.parse(match[1])
}

describe('FORMAT.md', () => {
  test('its example is a valid task file', async () => {
    const result = parseTaskFile(await exampleOfFormat())
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    expect(result.file.features).toHaveLength(1)
    expect(result.file.features[0]?.properties.options).toHaveLength(3)
  })
})
