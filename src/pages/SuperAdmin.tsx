import { useState } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { useAuth } from '@/context/AuthContext'
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection'
import { ScrollSentinel } from '@/components/ui/ScrollSentinel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Shield, ShieldOff, Users, Building2, ToggleLeft, ToggleRight, RefreshCw, Bug, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { UserDoc, Workspace, BugReport, BugStatus } from '@/types/firestore'

// UserDoc + display fields stored at signup time
type UserRow = UserDoc & { email?: string; displayName?: string; photoURL?: string }

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = 'users' | 'workspaces' | 'bugreports'

// ─── Users tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const { user: me } = useAuth()
  const { data: users, loading, hasMore, loadMore, refresh } = useFirestoreCollection<UserRow>({
    collectionName: 'users',
    pageSize: 15,
    realtime: false,
  })
  const [toggling, setToggling] = useState<string | null>(null)
  const [localOverrides, setLocalOverrides] = useState<Record<string, boolean>>({})

  async function toggleSuperAdmin(u: UserRow) {
    setToggling(u.id)
    const next = !( localOverrides[u.id] !== undefined ? localOverrides[u.id] : u.isSuperAdmin)
    try {
      await updateDoc(doc(db, 'users', u.id), { isSuperAdmin: next })
      setLocalOverrides((prev) => ({ ...prev, [u.id]: next }))
      toast.success(`${next ? 'Granted' : 'Revoked'} superadmin for ${u.email ?? u.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update user')
    } finally {
      setToggling(null)
    }
  }

  if (loading && users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading users…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">{users.length} users loaded</p>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {users.map((u) => {
        const isSuperAdmin = localOverrides[u.id] !== undefined ? localOverrides[u.id] : u.isSuperAdmin
        const initials = u.displayName
          ? u.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
          : u.email?.[0]?.toUpperCase() ?? '?'
        const isMe = u.id === me?.uid

        return (
          <div
            key={u.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={u.photoURL ?? ''} referrerPolicy="no-referrer" />
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {u.displayName ?? u.email}
                {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
              </p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isSuperAdmin && (
                <Badge variant="default" className="text-xs bg-primary">
                  Superadmin
                </Badge>
              )}
              <Button
                variant={isSuperAdmin ? 'destructive' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                disabled={toggling === u.id || isMe}
                onClick={() => toggleSuperAdmin(u)}
                title={isMe ? 'Cannot change your own superadmin status' : undefined}
              >
                {toggling === u.id ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : isSuperAdmin ? (
                  <><ShieldOff className="h-3 w-3 mr-1" />Revoke</>
                ) : (
                  <><Shield className="h-3 w-3 mr-1" />Grant</>
                )}
              </Button>
            </div>
          </div>
        )
      })}
      {hasMore && <ScrollSentinel onInView={loadMore} loading={loading} />}
    </div>
  )
}

// ─── Workspaces tab ───────────────────────────────────────────────────────────

function WorkspacesTab() {
  const { data: workspaces, loading, hasMore, loadMore, refresh } = useFirestoreCollection<Workspace>({
    collectionName: 'workspaces',
    orderByField: { field: 'name', direction: 'asc' },
    pageSize: 15,
    realtime: false,
  })
  const [toggling, setToggling] = useState<string | null>(null)
  const [localOverrides, setLocalOverrides] = useState<Record<string, boolean>>({})

  async function toggleActive(ws: Workspace) {
    setToggling(ws.id)
    const currentActive = localOverrides[ws.id] !== undefined ? localOverrides[ws.id] : ws.isActive !== false
    const next = !currentActive
    try {
      await updateDoc(doc(db, 'workspaces', ws.id), { isActive: next })
      setLocalOverrides((prev) => ({ ...prev, [ws.id]: next }))
      toast.success(`Workspace "${ws.name}" ${next ? 'activated' : 'deactivated'}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update workspace')
    } finally {
      setToggling(null)
    }
  }

  if (loading && workspaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading workspaces…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">{workspaces.length} workspaces loaded</p>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {workspaces.map((ws) => {
        const active = localOverrides[ws.id] !== undefined ? localOverrides[ws.id] : ws.isActive !== false
        return (
          <div
            key={ws.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: ws.color ?? '#6366f1' }}
            >
              {ws.initials}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{ws.name}</p>
              <p className="text-xs text-muted-foreground">
                {ws.members?.length ?? 0} members
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant={active ? 'default' : 'secondary'}
                className={cn('text-xs', active ? 'bg-emerald-500 text-white' : '')}
              >
                {active ? 'Active' : 'Inactive'}
              </Badge>
              <Button
                variant={active ? 'destructive' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                disabled={toggling === ws.id}
                onClick={() => toggleActive(ws)}
              >
                {toggling === ws.id ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : active ? (
                  <><ToggleLeft className="h-3 w-3 mr-1" />Deactivate</>
                ) : (
                  <><ToggleRight className="h-3 w-3 mr-1" />Activate</>
                )}
              </Button>
            </div>
          </div>
        )
      })}
      {hasMore && <ScrollSentinel onInView={loadMore} loading={loading} />}
    </div>
  )
}

// ─── Bug Reports tab ──────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700 border border-slate-300',
  medium: 'bg-yellow-50 text-yellow-700 border border-yellow-300',
  high: 'bg-orange-50 text-orange-700 border border-orange-300',
  critical: 'bg-red-50 text-red-700 border border-red-300',
}

const STATUS_STYLES: Record<BugStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border border-blue-300',
  in_progress: 'bg-purple-50 text-purple-700 border border-purple-300',
  resolved: 'bg-emerald-50 text-emerald-700 border border-emerald-300',
}

const STATUS_LABELS: Record<BugStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
}

const STATUS_TRANSITIONS: Record<BugStatus, { next: BugStatus; label: string }> = {
  open: { next: 'in_progress', label: 'Mark In Progress' },
  in_progress: { next: 'resolved', label: 'Mark Resolved' },
  resolved: { next: 'open', label: 'Reopen' },
}

function BugReportCard({ report, onUpdated }: { report: BugReport; onUpdated: (updated: BugReport) => void }) {
  const { user } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(report.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [togglingStatus, setTogglingStatus] = useState(false)

  async function handleStatusChange() {
    setTogglingStatus(true)
    const next = STATUS_TRANSITIONS[report.status].next
    try {
      const update: Record<string, unknown> = { status: next }
      if (next === 'resolved') {
        update.resolvedAt = serverTimestamp()
        update.resolvedBy = user?.uid ?? ''
      } else if (next === 'open') {
        update.resolvedAt = null
        update.resolvedBy = null
      }
      await updateDoc(doc(db, 'bugReports', report.id), update)
      onUpdated({ ...report, status: next })
      toast.success(`Status updated to "${STATUS_LABELS[next]}"`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setTogglingStatus(false)
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true)
    try {
      await updateDoc(doc(db, 'bugReports', report.id), { notes })
      onUpdated({ ...report, notes })
      toast.success('Notes saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  const transition = STATUS_TRANSITIONS[report.status]

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn('px-2 py-0.5 rounded text-xs font-medium', SEVERITY_STYLES[report.severity] ?? '')}>
              {report.severity.charAt(0).toUpperCase() + report.severity.slice(1)}
            </span>
            <span className={cn('px-2 py-0.5 rounded text-xs font-medium', STATUS_STYLES[report.status])}>
              {STATUS_LABELS[report.status]}
            </span>
          </div>
          <p className="text-sm font-medium truncate">{report.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {report.submittedByName} · {report.submittedByEmail}
            {report.createdAt && (
              <span> · {new Date((report.createdAt as unknown as { seconds: number }).seconds * 1000).toLocaleDateString()}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={togglingStatus}
            onClick={handleStatusChange}
          >
            {togglingStatus ? <RefreshCw className="h-3 w-3 animate-spin" /> : transition.label}
          </Button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded border hover:bg-muted transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 flex flex-col gap-3 bg-muted/30">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
            <p className="text-sm whitespace-pre-wrap">{report.description}</p>
          </div>
          {report.steps && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Steps to reproduce</p>
              <p className="text-sm whitespace-pre-wrap">{report.steps}</p>
            </div>
          )}
          {report.pageUrl && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Page URL</p>
              <p className="text-xs text-muted-foreground break-all">{report.pageUrl}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Admin notes</p>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[72px] resize-y"
              placeholder="Add internal notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex justify-end mt-1.5">
              <Button size="sm" className="h-7 text-xs" disabled={savingNotes || notes === report.notes} onClick={handleSaveNotes}>
                {savingNotes ? 'Saving…' : 'Save notes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BugReportsTab() {
  const [filter, setFilter] = useState<BugStatus | 'all'>('all')
  const [localUpdates, setLocalUpdates] = useState<Record<string, BugReport>>({})

  const statusFilter = filter !== 'all' ? [{ field: 'status', op: '==' as const, value: filter }] : []
  const { data: reports, loading, hasMore, loadMore, refresh } = useFirestoreCollection<BugReport>({
    collectionName: 'bugReports',
    filters: statusFilter,
    orderByField: { field: 'createdAt', direction: 'desc' },
    pageSize: 15,
    realtime: false,
  })

  function handleUpdated(updated: BugReport) {
    setLocalUpdates((prev) => ({ ...prev, [updated.id]: updated }))
  }

  const merged = reports.map((r) => localUpdates[r.id] ?? r)

  if (loading && reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading bug reports…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'open', 'in_progress', 'resolved'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                filter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-input text-muted-foreground hover:text-foreground'
              )}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {merged.length === 0 && !loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No bug reports found</p>
      ) : (
        merged.map((r) => <BugReportCard key={r.id} report={r} onUpdated={handleUpdated} />)
      )}
      {hasMore && <ScrollSentinel onInView={loadMore} loading={loading} />}
    </div>
  )
}

// ─── SuperAdmin page ──────────────────────────────────────────────────────────

export function SuperAdmin() {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b bg-card px-4 sm:px-6 py-3 sm:py-4 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Shield className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="font-semibold text-sm">Platform Administration</p>
          <p className="text-xs text-muted-foreground">Superadmin access only</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b bg-card px-4 sm:px-6 shrink-0">
        <button
          onClick={() => setTab('users')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 transition-colors',
            tab === 'users'
              ? 'border-primary text-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Users className="h-3.5 w-3.5" />
          Users
        </button>
        <button
          onClick={() => setTab('workspaces')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 transition-colors',
            tab === 'workspaces'
              ? 'border-primary text-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Building2 className="h-3.5 w-3.5" />
          Workspaces
        </button>
        <button
          onClick={() => setTab('bugreports')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 transition-colors',
            tab === 'bugreports'
              ? 'border-primary text-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Bug className="h-3.5 w-3.5" />
          Bug Reports
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === 'users' && <UsersTab />}
        {tab === 'workspaces' && <WorkspacesTab />}
        {tab === 'bugreports' && <BugReportsTab />}
      </div>
    </div>
  )
}
