// Leading "-" excludes this from route generation (TanStack Router convention)
// — it's a shared layout component for the mockup screens, not a route.
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { currentUser } from '@/lib/mockData'
import { ThemeToggle } from '@/components/theme-toggle'

export function MockupShell({
  title,
  crumbs,
  actions,
  children,
}: {
  title: string
  crumbs?: { label: string; to?: string }[]
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div data-slot="shell" className="bg-muted/30 min-h-screen">
      <header data-slot="shell-header" className="bg-background border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link to="/mockups" className="text-sm font-semibold tracking-tight">
            family-pool
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="text-muted-foreground text-sm">{currentUser.email}</span>
            <Avatar className="size-7">
              <AvatarFallback className={`${currentUser.color} text-xs text-white`}>
                {currentUser.initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            {crumbs && crumbs.length > 0 && (
              <nav className="text-muted-foreground mb-1 flex items-center gap-1 text-sm">
                {crumbs.map((crumb, i) => (
                  <span key={crumb.label} className="flex items-center gap-1">
                    {i > 0 && <span>/</span>}
                    {crumb.to ? (
                      <Link to={crumb.to} className="hover:text-foreground hover:underline">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span>{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        {children}
      </div>
    </div>
  )
}
