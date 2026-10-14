import type { Operation } from '@osm-editor-kit/maid-operations'
import { copyParkingOperation } from './copy-parking.ts'
import { removeParkingOperation } from './remove-parking.ts'
import { swapSidesOperation } from './swap-sides.ts'

/** The edit menu's operations for parking. `parking()` registers them on `edit.operation`. Their texts follow the page's language. */
export const parkingOperations: Operation[] = [
  copyParkingOperation('left', 'right'),
  copyParkingOperation('right', 'left'),
  swapSidesOperation,
  removeParkingOperation,
]
