import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { taskFileJsonSchema } from './json-schema.ts'

const committed = join(import.meta.dir, '..', 'task-file.schema.json')

describe('taskFileJsonSchema', () => {
  test('states the caps and the patterns', () => {
    const schema = taskFileJsonSchema() as {
      $schema: string
      properties: { features: { maxItems: number }; type: { const: string } }
    }
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.properties.features.maxItems).toBe(20_000)
    expect(schema.properties.type.const).toBe('FeatureCollection')
  })

  test('is the same on every call', () => {
    expect(JSON.stringify(taskFileJsonSchema())).toBe(JSON.stringify(taskFileJsonSchema()))
  })

  test('the committed task-file.schema.json holds what the code writes (formatting aside)', async () => {
    const committedSchema: unknown = JSON.parse(await Bun.file(committed).text())
    expect(committedSchema).toEqual(JSON.parse(JSON.stringify(taskFileJsonSchema())))
  })
})
