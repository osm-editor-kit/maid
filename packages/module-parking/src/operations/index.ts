import type { Operation } from '@osm-editor-kit/maid-operations'
import { copyParkingOperation } from './copy-parking.ts'
import { MESSAGES_DE } from './messages-de.ts'
import { removeParkingOperation } from './remove-parking.ts'
import { swapSidesOperation } from './swap-sides.ts'

/** The edit menu's operations for parking. `parking()` registers them on `edit.operation`. */
export const parkingOperations: Operation[] = [
  copyParkingOperation('left', 'right'),
  copyParkingOperation('right', 'left'),
  swapSidesOperation,
  removeParkingOperation,
]

/** The operation with its menu label, its reason for being disabled and its undo step's name in German (messages-de.ts) */
export function inGerman(operation: Operation): Operation {
  const text = MESSAGES_DE[operation.id]
  if (!text) return operation
  return {
    ...operation,
    label: text.label,
    disabled: (context) => {
      const reason = operation.disabled(context)
      return reason === undefined ? undefined : (text.disabled ?? reason)
    },
    run: (context) => ({ ...operation.run(context), annotation: text.annotation }),
  }
}
