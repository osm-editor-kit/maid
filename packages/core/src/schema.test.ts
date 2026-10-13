import { describe, expect, it } from 'bun:test'
import rulesetsSource from '../../model/src/schema/osm_rulesets.json5'
import { osmRulesets } from './osm-rulesets.ts'

describe('osm-rulesets.ts', () => {
  it("is the model's osm_rulesets.json5", () => {
    // After the model's file changed, write `export const osmRulesets: RulesetsInput = <the JSON5 as JSON>` again.
    expect(JSON.parse(JSON.stringify(osmRulesets))).toEqual(rulesetsSource)
  })
})
