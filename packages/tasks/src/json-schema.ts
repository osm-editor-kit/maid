/**
 * The task file's JSON Schema, from the Zod schema. It states the types, the patterns and the caps. The rules Zod
 * checks in `superRefine` (unique ids, a tag both set and removed, the non-empty option) are not in it: `parse.ts`
 * checks those.
 */
import { z } from 'zod'
import { taskFileSchema } from './schema.ts'

/** The JSON Schema (draft 2020-12) of a task file, as `scripts/json-schema.ts` writes it */
export function taskFileJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(taskFileSchema, { io: 'input' }) as Record<string, unknown>
}
