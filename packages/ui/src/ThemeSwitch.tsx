import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/20/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import type { Theme } from './settings.ts'
import { ToolButton, ToolGroup } from './Toolbar'

/**
 * Light, dark and match-system buttons; the theme in effect is shown as selected. Controlled: the shell owns the
 * value (the URL's `theme`, else the stored choice) and what a choice writes.
 */
export function ThemeSwitch({
  value,
  onChange,
}: {
  value: Theme
  onChange: (theme: Theme) => void
}) {
  return (
    <ToolGroup label={m.ui_theme()}>
      <ToolButton
        label={m.ui_theme_light()}
        icon={<SunIcon />}
        selected={value === 'light'}
        onClick={() => onChange('light')}
      />
      <ToolButton
        label={m.ui_theme_dark()}
        icon={<MoonIcon />}
        selected={value === 'dark'}
        onClick={() => onChange('dark')}
      />
      <ToolButton
        label={m.ui_theme_system()}
        icon={<ComputerDesktopIcon />}
        selected={value === 'system'}
        onClick={() => onChange('system')}
      />
    </ToolGroup>
  )
}
