import { MapPinIcon } from '@heroicons/react/20/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import type { Mode } from '@osm-editor-kit/maid-renderer'
import { ToolButton, ToolGroup } from '@osm-editor-kit/maid-ui'
import { useEngine, useShell } from '../shell-context'

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

/** The three add modes. A function, so that the texts are read in the language of the moment. */
function addModes(): {
  mode: Mode
  label: string
  shortcut: string
  text: string
  icon: React.ReactNode
}[] {
  return [
    {
      mode: 'add-point',
      label: m.topbar_add_point_hint(),
      shortcut: '1',
      text: m.topbar_point(),
      icon: <MapPinIcon />,
    },
    {
      mode: 'draw-line',
      label: m.topbar_draw_line_hint(),
      shortcut: '2',
      text: m.topbar_line(),
      icon: <LineIcon />,
    },
    {
      mode: 'draw-area',
      label: m.topbar_draw_area_hint(),
      shortcut: '3',
      text: m.topbar_area(),
      icon: <AreaIcon />,
    },
  ]
}

/** Top bar: what a click on the map adds. Deleting is in the sidebar's edit commands and on right click. */
export function ModeButtons() {
  const { engine } = useShell()
  const mode = useEngine((e) => e.mode)
  return (
    <ToolGroup label={m.topbar_group_add()}>
      {addModes().map((add) => (
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
