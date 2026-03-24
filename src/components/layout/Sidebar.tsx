import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard,
  Users,
  Users2,
  ShoppingCart,
  BarChart3,
  Settings,
  Bell,
  FileText,
  ChevronLeft,
  ChevronRight,
  Shield,
  Building2,
} from 'lucide-react'

interface NavItem {
  icon: React.ElementType
  label: string
  id: string
  badge?: number
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', id: 'dashboard' },
  { icon: Building2, label: 'Workspaces', id: 'workspaces' },
  { icon: Users2, label: 'Members', id: 'members' },
  { icon: Users, label: 'Users', id: 'users', badge: 3 },
  { icon: ShoppingCart, label: 'Orders', id: 'orders', badge: 12 },
  { icon: BarChart3, label: 'Analytics', id: 'analytics' },
  { icon: FileText, label: 'Reports', id: 'reports' },
  { icon: Bell, label: 'Notifications', id: 'notifications', badge: 5 },
]

const bottomItems: NavItem[] = [
  { icon: Settings, label: 'Settings', id: 'settings' },
]

interface SidebarProps {
  activePage: string
  onNavigate: (page: string) => void
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r bg-card transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-4 border-b">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Shield className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm truncate">Admin Portal</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map((item) => (
          <Button
            key={item.id}
            variant={activePage === item.id ? 'secondary' : 'ghost'}
            className={cn(
              'w-full justify-start gap-3 relative',
              collapsed && 'justify-center px-0'
            )}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {item.badge && !collapsed && (
              <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {item.badge}
              </span>
            )}
            {item.badge && collapsed && (
              <span className="absolute top-1 right-1 flex h-3 w-3 rounded-full bg-destructive" />
            )}
          </Button>
        ))}
      </nav>

      <Separator />

      <div className="py-4 px-2 space-y-1">
        {bottomItems.map((item) => (
          <Button
            key={item.id}
            variant={activePage === item.id ? 'secondary' : 'ghost'}
            className={cn('w-full justify-start gap-3', collapsed && 'justify-center px-0')}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Button>
        ))}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  )
}
