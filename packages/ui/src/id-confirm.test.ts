// Adopted from iD test/spec/ui/confirm.js (ISC, © iD contributors), at commit 0194f3926.
//
// iD's confirm is a D3 widget with a header, a message, a buttons row and a close function. Maid has
// no confirm widget with that API: its dialogs are Flyout (dismissed by an outside click or Escape),
// BottomSheet (close button, drag, Escape) and RestorePrompt (answered by its two buttons).
import { describe, it } from 'bun:test'

describe('iD.uiConfirm', () => {
  // n/a: 'can be instantiated' (a D3 constructor; Maid's dialogs are React components)
  // n/a: 'has a header section', 'has a message section', 'has a buttons section' (the markup of
  //      iD's D3 widget; Maid's dialogs have their own markup)
  // n/a: 'can have an ok button added to it' (iD's okButton() API)
  // n/a: 'can be dismissed by calling close function' (iD's close() API; Maid closes a dialog by
  //      its open state)
  // n/a: 'can be dismissed by pressing backspace' (Backspace edits text in every Maid field, so it
  //      is not a dismissal key; iD's quirk, left out on purpose)

  it.todo('can be dismissed by clicking the close button', () => {}) // needs F-ui-12

  it.todo('can be dismissed by pressing escape', () => {}) // needs F-ui-12

  it.todo('can be dismissed by clicking the ok button', () => {}) // needs F-ui-12
})
