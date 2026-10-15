// The way table module: see docs/research/way-table.md. The pure parts (chain, rows, cell states, plans, writes) and
// the store are plain TypeScript; the dock view and the module are the React parts.

export * from './types.ts'
export * from './chain.ts'
export * from './area-chain.ts'
export * from './order.ts'
export * from './mirror.ts'
export * from './cell-state.ts'
export * from './rows.ts'
export * from './plan.ts'
export * from './carry.ts'
export { buildTable, labelOf, type TableModel, type TableView, type TableColumn } from './table.ts'
export { wayTable, type WayTableOptions } from './module.tsx'
