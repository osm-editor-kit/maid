import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/20/solid'
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
    <ToolGroup label="Theme">
      <ToolButton
        label="Light theme"
        icon={<SunIcon />}
        selected={value === 'light'}
        onClick={() => onChange('light')}
      />
      <ToolButton
        label="Dark theme"
        icon={<MoonIcon />}
        selected={value === 'dark'}
        onClick={() => onChange('dark')}
      />
      <ToolButton
        label="Match system"
        icon={<ComputerDesktopIcon />}
        selected={value === 'system'}
        onClick={() => onChange('system')}
      />
    </ToolGroup>
  )
}
