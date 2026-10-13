import { describe, expect, it } from 'bun:test'
import { legacySchema } from './legacy-schema.ts'
import { entity, ruleContext } from './test-helpers.ts'

const run = (tags: Record<string, string>) =>
  legacySchema.validate(entity('w-4', tags), ruleContext())

describe('parking_legacy_schema', () => {
  it('flags parking:lane:* and parking:condition:* as the old schema, without a fix', () => {
    const issues = run({
      highway: 'residential',
      'parking:lane:left': 'parallel',
      'parking:condition:right': 'ticket',
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('schema from before 2022')
    expect(issues[0]?.message).toContain('parking:lane:left=parallel')
    expect(issues[0]?.fixes).toHaveLength(0)
  })

  it('does not flag the current keys', () => {
    expect(
      run({
        highway: 'residential',
        'parking:left': 'lane',
        'parking:left:orientation': 'parallel',
      }),
    ).toHaveLength(0)
  })
})
