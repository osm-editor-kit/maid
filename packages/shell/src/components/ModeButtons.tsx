import { MapPinIcon } from '@heroicons/react/20/solid'
import type { Mode } from '@osm-editor-kit/maid-renderer'
import { ToolButton, ToolGroup } from '@osm-editor-kit/maid-ui'
import { engine, useEngine } from '../editor'

/** iD's line and area icons are in its sprite; these two small drawings stand in for them */
function LineIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M3 15 8 6l5 7 4-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AreaIcon() {
  return (
    <svg viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M4 5h12v10H4z" fill="currentColor" fillOpacity={0.25} strokeLinejoin="round" />
    </svg>
  )
}

const ADD: { mode: Mode; label: string; shortcut: string; text: string; icon: React.ReactNode }[] =
  [
    {
      mode: 'add-point',
      label: 'Add a point: click the map to place it',
      shortcut: '1',
      text: 'Point',
      icon: <MapPinIcon />,
    },
    {
      mode: 'draw-line',
      label: 'Draw a line: click for every node, Enter or a click on the last node finishes',
      shortcut: '2',
      text: 'Line',
      icon: <LineIcon />,
    },
    {
      mode: 'draw-area',
      label: 'Draw an area: click for every node, Enter or a click on the first node finishes',
      shortcut: '3',
      text: 'Area',
      icon: <AreaIcon />,
    },
  ]

/** Top bar: what a click on the map adds. Deleting is in the sidebar's edit commands and on right click. */
export function ModeButtons() {
  const mode = useEngine((e) => e.mode)
  return (
    <ToolGroup label="Add">
      {ADD.map((add) => (
        <ToolButton
          key={add.mode}
          label={add.label}
          shortcut={add.shortcut}
          text={add.text}
          icon={add.icon}
          pressed={mode === add.mode}
          onClick={() => engine.setMode(mode === add.mode ? 'browse' : add.mode)}
        />
      ))}
    </ToolGroup>
  )
}
