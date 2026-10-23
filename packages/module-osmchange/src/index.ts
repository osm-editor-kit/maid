// The osmChange module: see docs/research/osmchange-upload/README.md. The pure parts (parse, load, merge, plan, apply,
// map features) are plain TypeScript; the account item, the dock view and the map content are the React parts.

export * from './types.ts'
export { MAX_ELEMENTS, parseOsmChange, type ParseResult } from './parse.ts'
export { type LoadDeps, loadServerState, type Loaded } from './load.ts'
export {
  CLOSE_METRES,
  mergeChange,
  type Choice,
  type Conflict,
  type Merged,
  type Status,
} from './merge.ts'
export { planOf, usedByOf, type Plan, type PlanItem } from './plan.ts'
export { applyPlan, type Applied } from './apply.ts'
export { osmChange, type OsmChangeOptions } from './module.tsx'
