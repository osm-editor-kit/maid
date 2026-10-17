import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { Flyout, toolButtonClass } from '@osm-editor-kit/maid-ui'
import { useShell } from '../shell-context'

/** The panels of modules (`topbar.panel`): one icon button each, opening a flyout */
export function TopBarPanels() {
  const { editor, engine } = useShell()
  const panels = useExtensionPoint(editor, 'topbar.panel')
  return panels.map((panel) => (
    <Flyout
      key={panel.id}
      label={panel.label}
      placement="bottom-end"
      className={panel.width}
      trigger={
        <button
          type="button"
          aria-label={panel.label}
          title={panel.label}
          className={toolButtonClass(false)}
        >
          <span aria-hidden="true" className="inline-flex [&>svg]:size-5">
            {panel.icon}
          </span>
        </button>
      }
    >
      <panel.component editor={editor} engine={engine} />
    </Flyout>
  ))
}
