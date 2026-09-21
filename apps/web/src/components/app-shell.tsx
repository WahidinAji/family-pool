import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'

function initialsFrom(email: string) {
  return email.slice(0, 1).toUpperCase()
}

export function AppShell({
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
  const { data: user } = trpc.auth.me.useQuery()
  const utils = trpc.useUtils()
  const navigate = useNavigate()
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate()
      navigate({ to: '/login' })
    },
  })

  return (
    <div data-slot="shell" className="bg-muted/30 min-h-screen">
      <header data-slot="shell-header" className="bg-background border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link to="/rooms" className="shrink-0 text-sm font-semibold tracking-tight">
            family-pool
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {user && (
              <Link to="/inbox" className="text-muted-foreground hover:text-foreground text-sm">
                Inbox
              </Link>
            )}
            <ThemeToggle />
            {user && (
              <>
                <span className="text-muted-foreground hidden text-sm sm:inline">{user.email}</span>
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs">{initialsFrom(user.email)}</AvatarFallback>
                </Avatar>
                <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
                  <LogOut />
                  <span className="hidden sm:inline">Log out</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            {crumbs && crumbs.length > 0 && (
              <nav className="text-muted-foreground mb-1 flex max-w-[calc(100vw-2rem)] items-center gap-1 overflow-x-auto whitespace-nowrap text-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {crumbs.map((crumb, i) => (
                  <span key={crumb.label} className="flex min-w-0 shrink-0 items-center gap-1">
                    {i > 0 && <span className="shrink-0">/</span>}
                    {crumb.to ? (
                      <Link
                        to={crumb.to}
                        className="block max-w-32 truncate hover:text-foreground hover:underline sm:max-w-none"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="block max-w-44 truncate sm:max-w-none">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {children}
      </div>
    </div>
  )
}
