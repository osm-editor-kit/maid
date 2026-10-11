// What the ported tests import as `Rapid`: the package itself, plus the names Rapid's tests expect.
export * from '../src/index.ts'
export { ModelContext as MockContext } from '../src/Context.ts'
export * from '../src/util/iterable.ts'
export * as sdk from './sdk.ts'

// The tests build Rapid's `SchemaSystem` and load the rulesets file into it. Here it is the small ruleset-only schema.
import { RulesetSchema } from '../src/schema/RulesetSchema.ts'
export class SchemaSystem extends RulesetSchema {
  public requestedAssetIDs: string | Set<string> = ''
  public initAsync(): Promise<void> {
    return Promise.resolve()
  }
}
