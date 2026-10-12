// Adopted from iD test/spec/ui/modal.js (ISC, © iD contributors), at commit 0194f3926.
//
// iD's modal is a D3 widget with a content section and a close function. Maid's dialogs are
// Flyout (dismissed by an outside click or Escape) and BottomSheet (close button, drag, Escape).
import { describe, it } from 'bun:test'

describe('iD.uiModal', () => {
  // n/a: 'can be instantiated' (a D3 constructor)
  // n/a: 'has a content section' (the markup of iD's D3 widget)
  // n/a: 'can be dismissed by calling close function' (iD's close() API)
  // n/a: 'can be dismissed by pressing backspace' (Backspace edits text in every Maid field, so it
  //      is not a dismissal key; iD's quirk, left out on purpose)

  it.todo('can be dismissed by clicking the close button', () => {}) // needs F-ui-12

  it.todo('can be dismissed by pressing escape', () => {}) // needs F-ui-12
})
