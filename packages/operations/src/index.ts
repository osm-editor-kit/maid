// Edit operations of Maid: reverse, split, merge, straighten, square, make round, disconnect, extract.
// Headless: plain data and functions on the data model. No map, no React, no DOM.
export * from './extent.ts'
export * from './operations.ts'
export * from './point-to-area.ts'
export type { Extent, Operation, OperationContext, OperationResult } from './types.ts'
export * from './rotate-direction.ts'

/**
 * What runs an operation that asks for more input (`Operation.start`). Empty here, because this package knows no map:
 * the renderer adds its engine and the editor by declaration merging, as it adds to maid-core's ExtensionPoints.
 * Declared in this entry file, not in types.ts, so that the renderer's `declare module` reaches it.
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type
export interface OperationHost {}
