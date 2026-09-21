import { useEffect, useState } from 'react'

export type UiTheme = 'modern' | 'retro'

const STORAGE_KEY = 'family-pool-ui-theme'

function readInitialTheme(): UiTheme {
  if (typeof window === 'undefined') return 'modern'
  return localStorage.getItem(STORAGE_KEY) === 'retro' ? 'retro' : 'modern'
}

export function useUiTheme() {
  const [theme, setTheme] = useState<UiTheme>(readInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('retro', theme === 'retro')
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  return [theme, setTheme] as const
}
