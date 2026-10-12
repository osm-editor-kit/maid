import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/20/solid'
import { useTheme } from './theme'
import { ToolButton, ToolGroup } from './Toolbar'

/** Light, dark and match-system buttons; the current choice is shown as selected. */
export function ThemeSwitch() {
  const [theme, setTheme] = useTheme()
  return (
    <ToolGroup label="Theme">
      <ToolButton
        label="Light theme"
        icon={<SunIcon />}
        selected={theme === 'light'}
        onClick={() => setTheme('light')}
      />
      <ToolButton
        label="Dark theme"
        icon={<MoonIcon />}
        selected={theme === 'dark'}
        onClick={() => setTheme('dark')}
      />
      <ToolButton
        label="Match system"
        icon={<ComputerDesktopIcon />}
        selected={theme === 'system'}
        onClick={() => setTheme('system')}
      />
    </ToolGroup>
  )
}
