import type { ReactNode } from 'react'
import { PresetIcon } from './components/PresetIcon'

/** iD's icon for each command, from its sprite. The sidebar's command bar and the edit menu both use it. */
const ICON: Record<string, string> = {
  move: 'iD-operation-move',
  rotate: 'iD-operation-rotate',
  reverse: 'iD-operation-reverse',
  split: 'iD-operation-split',
  merge: 'iD-operation-merge',
  straighten: 'iD-operation-straighten',
  square: 'iD-operation-orthogonalize',
  circularize: 'iD-operation-circularize',
  disconnect: 'iD-operation-disconnect',
  extract: 'iD-operation-extract',
  'reflect-long': 'iD-operation-reflect-long',
  'reflect-short': 'iD-operation-reflect-short',
  copy: 'iD-operation-copy',
  paste: 'iD-operation-paste',
  delete: 'iD-operation-delete',
  'point-to-area': 'iD-icon-area',
}

/** The icon of a command, in the current text colour so that a disabled row greys it too */
export function commandIcon(id: string): ReactNode {
  return <PresetIcon icon={ICON[id]} className="size-5 fill-current" />
}
