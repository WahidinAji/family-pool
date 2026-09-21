import { useUiTheme } from '@/lib/theme'

export function ThemeToggle() {
  const [theme, setTheme] = useUiTheme()

  return (
    <div data-slot="theme-toggle" className="inline-flex overflow-hidden rounded-md border">
      {(['modern', 'retro'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setTheme(option)}
          data-active={theme === option}
          className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground text-muted-foreground px-2.5 py-1 text-xs capitalize"
        >
          {option}
        </button>
      ))}
    </div>
  )
}
