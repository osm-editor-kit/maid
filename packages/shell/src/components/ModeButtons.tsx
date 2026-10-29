import { CheckIcon, ChevronDownIcon, MapPinIcon } from '@heroicons/react/20/solid'
import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { device, m } from '@osm-editor-kit/maid-i18n'
import type { DrawToolItem, Mode } from '@osm-editor-kit/maid-renderer'
import {
  AreaIcon,
  Flyout,
  LineIcon,
  ROW_BASE,
  ROW_CURRENT,
  ROW_FOCUS,
  ROW_HOVER,
  ToolButton,
  ToolGroup,
  toolButtonClass,
} from '@osm-editor-kit/maid-ui'
import { Fragment, useRef, useState, type ReactNode } from 'react'
import { areaToolKeys } from '../drawing'
import { LongPress } from '../long-press'
import { useEngine, useShell } from '../shell-context'
import { FavouritesButton } from './FavouritesButton'

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
      label: m.topbar_add_point_hint({ ...device() }),
      shortcut: '1',
      text: m.topbar_point(),
      icon: <MapPinIcon />,
    },
    {
      mode: 'draw-line',
      label: m.topbar_draw_line_hint({ ...device() }),
      shortcut: '2',
      text: m.topbar_line(),
      icon: <LineIcon />,
    },
    {
      mode: 'draw-area',
      label: m.topbar_draw_area_hint({ ...device() }),
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
  // the dropdown is open by its chevron, or by a long press on the Area button (touch, or a held mouse button)
  const [areaMenuOpen, setAreaMenuOpen] = useState(false)
  const [areaPress] = useState(() => new LongPress())
  // set when a long press opened the dropdown: the click that ends that press starts no area
  const areaHeld = useRef(false)
  const pressArea: NonNullable<Parameters<typeof ToolButton>[0]['press']> = {
    onPointerDown: (event) => {
      if (event.button !== 0) return
      areaHeld.current = false
      areaPress.start({ x: event.clientX, y: event.clientY }, () => {
        areaHeld.current = true
        setAreaMenuOpen(true)
      })
    },
    onPointerMove: (event) => areaPress.move({ x: event.clientX, y: event.clientY }),
    onPointerUp: () => areaPress.end(),
    onPointerLeave: () => areaPress.end(),
    onPointerCancel: () => areaPress.end(),
    // a long press on a touch screen must not open the browser's own menu
    onContextMenu: (event) => event.preventDefault(),
    // a key is not a press: a stale flag from a long press must not swallow the key's click
    onKeyDown: () => {
      areaHeld.current = false
    },
  }
  return (
    <ToolGroup label={m.topbar_group_add()}>
      <FavouritesButton />
      {addModes().map((add) => {
        const longPressable = add.mode === 'draw-area' && drawTools.length > 0
        return (
          <Fragment key={add.mode}>
            <ToolButton
              label={add.label}
              shortcut={add.shortcut}
              text={add.text}
              collapseLabel
              icon={add.icon}
              pressed={mode === add.mode}
              press={longPressable ? pressArea : undefined}
              onClick={() => {
                // the press that opened the dropdown ends here: its click starts nothing
                if (areaHeld.current) {
                  areaHeld.current = false
                  return
                }
                engine.setMode(mode === add.mode ? 'browse' : add.mode)
              }}
            />
            {longPressable && (
              <AreaToolsMenu
                area={add}
                tools={drawTools}
                open={areaMenuOpen}
                onOpenChange={setAreaMenuOpen}
              />
            )}
          </Fragment>
        )
      })}
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
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { area, tools, open, onOpenChange: setOpen } = props
  const { engine } = useShell()
  const mode = useEngine((e) => e.mode)
  const moduleId = useEngine((e) => e.moduleMode?.id)
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
      // as wide as its longest row, and at least 14rem
      className="w-auto min-w-56"
      trigger={
        <button
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={toolUnderway}
          // shown pressed while the list is open
          className={toolButtonClass(false, toolUnderway || open)}
        >
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </button>
      }
    >
      <div role="menu" className="flex w-full flex-col p-1">
        <MenuRow
          icon={area.icon}
          label={area.text}
          shortcut={area.shortcut}
          pressed={!toolUnderway && mode === 'draw-area'}
          onClick={() => choose(() => engine.setMode('draw-area'))}
        />
        {tools.map((tool, index) => {
          const Icon = tool.icon
          return (
            <MenuRow
              key={tool.id}
              icon={Icon ? <Icon /> : undefined}
              label={tool.label()}
              shortcut={areaToolKeys(index)}
              pressed={tool.id === moduleId}
              onClick={() => choose(() => tool.start(engine))}
            />
          )
        })}
      </div>
    </Flyout>
  )
}

/**
 * One choice of the area dropdown, in the look of the Tailwind Plus dropdown items: an icon, its name,
 * and its key on the right. The row follows the shared list-row look (`listbox.ts` in maid-ui): a grey
 * hover, a ring and grey on keyboard focus, and the choice under way (current) in the blue background
 * with a check and a semibold name.
 */
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
      className={`flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left text-base/6 text-zinc-950 sm:px-3 sm:py-1.5 sm:text-sm/6 dark:text-white ${ROW_BASE} ${ROW_FOCUS} ${pressed ? `${ROW_CURRENT} font-semibold` : ROW_HOVER}`}
    >
      <span
        aria-hidden="true"
        className="-ml-0.5 inline-flex size-5 shrink-0 items-center justify-center text-zinc-500 sm:size-4 dark:text-zinc-400 [&>svg]:size-5 sm:[&>svg]:size-4"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      {pressed && <CheckIcon aria-hidden="true" className="size-5 shrink-0 sm:size-4" />}
      {shortcut && (
        <kbd className="font-sans text-xs text-zinc-500 dark:text-zinc-400 touch:hidden">
          {shortcut}
        </kbd>
      )}
    </button>
  )
}
