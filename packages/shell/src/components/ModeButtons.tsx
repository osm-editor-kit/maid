import { ChevronDownIcon, MapPinIcon } from '@heroicons/react/20/solid'
import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { m } from '@osm-editor-kit/maid-i18n'
import type { DrawToolItem, Mode } from '@osm-editor-kit/maid-renderer'
import { Flyout, ToolButton, ToolGroup, toolButtonClass } from '@osm-editor-kit/maid-ui'
import { Fragment, useState, type ReactNode } from 'react'
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
  const { editor, engine } = useShell()
  const mode = useEngine((e) => e.mode)
  // the drawing tools that modules add: the Area button gets a dropdown when there are any (ADR 0011, hook 3)
  const drawTools = useExtensionPoint(editor, 'draw.tool')
  return (
    <ToolGroup label={m.topbar_group_add()}>
      {addModes().map((add) => (
        <Fragment key={add.mode}>
          <ToolButton
            label={add.label}
            shortcut={add.shortcut}
            text={add.text}
            icon={add.icon}
            pressed={mode === add.mode}
            onClick={() => engine.setMode(mode === add.mode ? 'browse' : add.mode)}
          />
          {add.mode === 'draw-area' && drawTools.length > 0 && (
            <AreaToolsMenu area={add} tools={drawTools} />
          )}
        </Fragment>
      ))}
    </ToolGroup>
  )
}

/**
 * The small dropdown beside the Area button: "Area" and the drawing tools of the modules. A tool that is under way
 * is shown pressed, on the trigger and in the list.
 */
function AreaToolsMenu(props: {
  area: { shortcut: string; text: string; icon: ReactNode }
  tools: readonly DrawToolItem[]
}) {
  const { area, tools } = props
  const { engine } = useShell()
  const mode = useEngine((e) => e.mode)
  const moduleId = useEngine((e) => e.moduleMode?.id)
  const [open, setOpen] = useState(false)
  const toolUnderway = tools.some((tool) => tool.id === moduleId)
  // a choice closes the menu, then starts the mode
  const choose = (start: () => void) => {
    setOpen(false)
    start()
  }
  const label = m.topbar_more_area_tools()
  return (
    <Flyout
      label={label}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={toolUnderway}
          className={toolButtonClass(false, toolUnderway)}
        >
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </button>
      }
    >
      <div role="menu" className="flex w-56 flex-col p-1">
        <MenuRow
          icon={area.icon}
          label={area.text}
          shortcut={area.shortcut}
          pressed={!toolUnderway && mode === 'draw-area'}
          onClick={() => choose(() => engine.setMode('draw-area'))}
        />
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <MenuRow
              key={tool.id}
              icon={Icon ? <Icon /> : undefined}
              label={tool.label()}
              shortcut={tool.shortcut?.toUpperCase()}
              pressed={tool.id === moduleId}
              onClick={() => choose(() => tool.start(engine))}
            />
          )
        })}
      </div>
    </Flyout>
  )
}

/** One choice of the area dropdown: an icon, its name, and its key on the right */
function MenuRow(props: {
  icon?: ReactNode
  label: string
  shortcut?: string
  pressed: boolean
  onClick: () => void
}) {
  const { icon, label, shortcut, pressed, onClick } = props
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={pressed || undefined}
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800 ${pressed ? 'bg-zinc-100 font-semibold dark:bg-zinc-800' : ''}`}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-5 shrink-0 items-center justify-center [&>svg]:size-5"
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{shortcut}</kbd>
      )}
    </button>
  )
}
