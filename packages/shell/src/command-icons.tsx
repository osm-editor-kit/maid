import { ClipboardDocumentCheckIcon, ClipboardDocumentIcon } from '@heroicons/react/16/solid'
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

/** The commands that have no iD icon: a heroicon (16 solid), in the current text colour */
const HEROICON: Record<string, typeof ClipboardDocumentIcon> = {
  'copy-tags': ClipboardDocumentIcon,
  'paste-tags': ClipboardDocumentCheckIcon,
}

/**
 * The icon of a command, in the current text colour so that a disabled row greys it too: iD's icon for its own
 * commands, else the icon the operation names (`Operation.icon`, a sprite name).
 */
export function commandIcon(id: string, icon?: string) {
  const Heroicon = HEROICON[id]
  if (Heroicon) return <Heroicon className="size-5" />
  return <PresetIcon icon={ICON[id] ?? icon} className="size-5 fill-current" />
}
