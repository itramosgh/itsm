'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Building2, Settings, Users, Ticket, Megaphone,
  BookOpen, CheckSquare, Calendar, GitMerge, BarChart2, Activity,
  ChevronRight, ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
}

interface NavGroup {
  label: string
  icon: React.ElementType
  items: NavItem[]
}

type NavEntry = NavItem | NavGroup

const navigation: NavEntry[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    label: 'Atendimento',
    icon: ClipboardList,
    items: [
      { href: '/chamados', label: 'Chamados', icon: Ticket },
      { href: '/mudancas', label: 'Mudanças (GMUD)', icon: GitMerge },
      { href: '/monitoramento', label: 'Monitoramento', icon: Activity },
      { href: '/tarefas', label: 'Tarefas', icon: CheckSquare },
      { href: '/reunioes', label: 'Reuniões', icon: Calendar },
    ],
  },
  {
    label: 'Clientes',
    icon: Building2,
    items: [
      { href: '/clientes', label: 'Clientes', icon: Building2 },
      { href: '/usuarios', label: 'Usuários', icon: Users },
    ],
  },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart2 },
  {
    label: 'Conhecimento',
    icon: BookOpen,
    items: [
      { href: '/conhecimento', label: 'Base de Conhecimento', icon: BookOpen },
      { href: '/comunicados', label: 'Comunicados', icon: Megaphone },
    ],
  },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry
}

function isActive(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

function getInitialOpenGroups(pathname: string): Record<string, boolean> {
  return Object.fromEntries(
    navigation
      .filter(isGroup)
      .map(g => [g.label, g.items.some(i => isActive(i.href, pathname))])
  )
}

interface SidebarProps {
  appName?: string | null
  logoUrl?: string | null
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ appName, logoUrl, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState<Record<string, boolean>>(
    () => getInitialOpenGroups(pathname)
  )
  const [syncedPathname, setSyncedPathname] = useState(pathname)

  if (pathname !== syncedPathname) {
    setSyncedPathname(pathname)
    setOpen(prev => {
      const updates: Record<string, boolean> = {}
      for (const entry of navigation) {
        if (isGroup(entry) && entry.items.some(i => isActive(i.href, pathname))) {
          updates[entry.label] = true
        }
      }
      return { ...prev, ...updates }
    })
  }

  useEffect(() => {
    onClose?.()
  }, [pathname, onClose])

  function toggle(label: string) {
    setOpen(prev => ({ ...prev, [label]: !prev[label] }))
  }

  return (
    <aside className={[
      'fixed inset-y-0 left-0 z-50 w-64 border-r bg-background h-screen flex flex-col',
      'transform transition-transform duration-200 ease-in-out',
      'md:relative md:z-auto md:translate-x-0',
      isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
    ].join(' ')}>
      <div className="h-14 px-4 border-b flex items-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={appName ?? 'Logo'} className="h-9 w-auto object-contain max-w-[180px]" />
        ) : (
          <span className="font-semibold text-lg">{appName || 'ITRAMOS ITSM'}</span>
        )}
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navigation.map(entry => {
          if (!isGroup(entry)) {
            const { href, label, icon: Icon } = entry
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive(href, pathname)
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            )
          }

          const { label, icon: Icon, items } = entry
          const isOpen = open[label] ?? false
          const groupActive = items.some(i => isActive(i.href, pathname))

          return (
            <div key={label}>
              <button
                type="button"
                onClick={() => toggle(label)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  groupActive && !isOpen
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                <ChevronRight
                  className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', isOpen && 'rotate-90')}
                />
              </button>
              {isOpen && (
                <div className="ml-3 mt-0.5 mb-0.5 border-l space-y-0.5 pl-2">
                  {items.map(({ href, label: itemLabel, icon: ItemIcon }) => (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                        isActive(href, pathname)
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      )}
                    >
                      <ItemIcon className="h-4 w-4 shrink-0" />
                      {itemLabel}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
