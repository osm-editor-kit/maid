import { CommandBar } from '@osm-editor-kit/maid-ui'
import { useEditCommands } from '../commands'
import { PresetIcon } from './PresetIcon'

/** iD's icon for each command, from its sprite */
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

/**
 * The edit menu in the sidebar: the same commands as on a right click, as a row of icon
 * buttons. The tooltip of each says what it does, its key, and why it cannot run now.
 */
export function Operations() {
  const commands = useEditCommands()
  if (commands.length === 0) return null
  return (
    // a toolbar row under the header: no headline, the icons speak for themselves. The line under
    // it is the first group's own, as between all groups.
    <div className="pb-3">
      <CommandBar
        label="Edit"
        items={commands.map((command) => ({
          ...command,
          icon: <PresetIcon icon={ICON[command.id]} className="size-5 fill-current" />,
        }))}
      />
    </div>
  )
}
