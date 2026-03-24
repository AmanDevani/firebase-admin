import { useState } from 'react'
import { Moon, Sun, LogOut, Shield, UserCircle, ArrowLeft, Bell, Settings2, Bug } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { BugReportDialog } from '@/components/BugReportDialog'
import { useAuth } from '@/context/AuthContext'
import { useFirestoreDoc } from '@/hooks/useFirestoreDoc'
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection'
import type { JoinRequest, Workspace } from '@/types/firestore'
import { cn } from '@/lib/utils'

// ─── Join Requests notification ───────────────────────────────────────────────

function JoinRequestsBadge({ wsId, isOwner }: { wsId: string; isOwner: boolean }) {
  const navigate = useNavigate()
  const { data: requests } = useFirestoreCollection<JoinRequest>({
    collectionName: 'joinRequests',
    filters: [
      { field: 'wsId', op: '==', value: wsId },
      { field: 'status', op: '==', value: 'PENDING' },
    ],
    realtime: true,
    enabled: isOwner,
  })

  if (!isOwner || requests.length === 0) return null

  return (
    <button
      onClick={() => navigate(`/workspaces/${wsId}/members`)}
      className="relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors"
      title={`${requests.length} pending join request${requests.length !== 1 ? 's' : ''}`}
    >
      <Bell className="h-4 w-4 text-muted-foreground" />
      <span className={cn(
        'absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1',
        'bg-primary text-[10px] font-bold text-primary-foreground'
      )}>
        {requests.length > 9 ? '9+' : requests.length}
      </span>
    </button>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isSuperAdmin, logout } = useAuth()
  const [dark, setDark] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [bugReportOpen, setBugReportOpen] = useState(false)

  // Parse active wsId from current URL path
  const wsIdMatch = location.pathname.match(/\/workspaces\/([^/]+)/)
  const wsId = wsIdMatch?.[1] ?? null

  const isOnAdminPage = location.pathname.startsWith('/admin')
  // Detect if on join page
  const isOnJoinPage = location.pathname.startsWith('/join/')

  // Load workspace doc only when wsId is present (cached by Firestore SDK)
  const { data: ws } = useFirestoreDoc<Workspace>('workspaces', wsId)
  const isOwner = !!ws && ws.ownerId === user?.uid

  const toggleDark = () => {
    setDark(!dark)
    document.documentElement.classList.toggle('dark')
  }

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? '?'

  return (
    <>
    <BugReportDialog open={bugReportOpen} onOpenChange={setBugReportOpen} />
    <header className="flex h-14 items-center border-b bg-card px-3 sm:px-4 gap-2 sm:gap-3">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <Shield className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm hidden sm:block">Admin Portal</span>
      </div>

      {/* Divider */}
      <span className="text-border hidden sm:block">|</span>

      {/* Workspace switcher */}
      <WorkspaceSwitcher />

      {/* Return to workspace — shown on members or join pages when wsId is known */}
      {wsId && isOnJoinPage && (
        <Button
          variant="ghost"
          size="sm"
          className="hidden sm:flex h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => navigate(`/workspaces/${wsId}`)}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to workspace
        </Button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Super admin portal toggle */}
        {isSuperAdmin && (
          isOnAdminPage ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs hidden sm:flex"
              onClick={() => navigate('/workspaces')}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Portal
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs hidden sm:flex border-primary/40 text-primary hover:bg-primary/5"
              onClick={() => navigate('/admin')}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Admin Panel
            </Button>
          )
        )}

        {/* Join requests notification bell — owners only */}
        {wsId && (
          <JoinRequestsBadge wsId={wsId} isOwner={isOwner} />
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setBugReportOpen(true)}
          title="Report a bug"
        >
          <Bug className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleDark}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent transition-colors"
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src={user?.photoURL ?? ''} referrerPolicy="no-referrer" />
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            {user?.displayName && (
              <span className="hidden lg:block text-sm font-medium max-w-[100px] truncate">
                {user.displayName}
              </span>
            )}
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 z-20 mt-1 w-48 sm:w-52 rounded-md border bg-popover shadow-md py-1 text-sm">
                <div className="px-3 py-2 border-b">
                  <p className="font-medium truncate">{user?.displayName ?? 'User'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                {wsId && (
                  <button
                    onClick={() => { setShowMenu(false); navigate(`/workspaces/${wsId}`) }}
                    className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                    Return to workspace
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    onClick={() => { setShowMenu(false); navigate('/admin') }}
                    className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-primary"
                  >
                    <Settings2 className="h-4 w-4" />
                    Platform Admin
                  </button>
                )}
                <button
                  onClick={() => { setShowMenu(false); navigate('/profile') }}
                  className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted transition-colors"
                >
                  <UserCircle className="h-4 w-4 text-muted-foreground" />
                  Profile
                </button>
                <button
                  onClick={() => { setShowMenu(false); logout() }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
    </>
  )
}
