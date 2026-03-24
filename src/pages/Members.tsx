import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Crown, ShieldCheck, Eye, Edit2, Trash2, ArrowLeftRight, ArrowLeft,
  Link2, Copy, Check, X, UserCheck, UserX, AlertTriangle,
} from 'lucide-react'
import {
  updateDoc, doc, getDoc, setDoc, deleteField, arrayRemove, arrayUnion,
  serverTimestamp, addDoc, collection,
} from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollSentinel } from '@/components/ui/ScrollSentinel'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useFirestoreDoc } from '@/hooks/useFirestoreDoc'
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection'
import type { InviteLink, JoinRequest, MemberRole, MemberRoleData, Workspace } from '@/types/firestore'
import type { Timestamp } from 'firebase/firestore'
import { cn } from '@/lib/utils'

// ─── Audit log helper ─────────────────────────────────────────────────────────

async function logAudit(params: {
  wsId: string
  eventType: string
  actorUid: string
  actorName: string
  actorRole: string
  targetType: string
  targetId: string
  targetName: string
  targetPath: string
  metadata?: Record<string, unknown>
}) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      wsId: params.wsId,
      eventType: params.eventType,
      actorUid: params.actorUid,
      actorName: params.actorName,
      actorRole: params.actorRole,
      targetType: params.targetType,
      targetId: params.targetId,
      targetName: params.targetName,
      targetPath: params.targetPath,
      metadata: params.metadata ?? {},
      timestamp: serverTimestamp(),
      deleteAt: null,
    })
  } catch {
    // fire-and-forget — never block the main action
  }
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<MemberRole, { label: string; variant: string; icon: React.ElementType }> = {
  OWNER:  { label: 'Owner',  variant: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: Crown },
  ADMIN:  { label: 'Admin',  variant: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: ShieldCheck },
  EDITOR: { label: 'Editor', variant: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: Edit2 },
  VIEWER: { label: 'Viewer', variant: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', icon: Eye },
}

function RoleBadge({ role }: { role: MemberRole }) {
  const { label, variant, icon: Icon } = ROLE_CONFIG[role] ?? ROLE_CONFIG.VIEWER
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', variant)}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  )
}

function MemberAvatar({ member }: { member: MemberRoleData }) {
  const initials = (member.name || member.email || '?').slice(0, 2).toUpperCase()
  return member.photoURL ? (
    <img src={member.photoURL} alt={member.name} className="h-8 w-8 rounded-full object-cover" />
  ) : (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
      {initials}
    </div>
  )
}

function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-sm font-medium">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

function formatTs(ts: Timestamp | null | undefined): string {
  if (!ts) return '—'
  return ts.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatExpiry(ts: Timestamp | null): string {
  if (!ts) return 'Never'
  const d = ts.toDate()
  if (d < new Date()) return 'Expired'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Create Invite Link dialog ────────────────────────────────────────────────

interface InviteLinkDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  wsId: string
  wsName: string
  wsColor: string
  wsInitials: string
}

const EXPIRY_OPTIONS = [
  { label: '5 minutes', ms: 5 * 60 * 1000 },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: 'Never', ms: null },
]

function InviteLinkDialog({ open, onOpenChange, wsId, wsName, wsColor, wsInitials }: InviteLinkDialogProps) {
  const { user } = useAuth()
  const [role, setRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR')
  const [expiryMs, setExpiryMs] = useState<number | null>(7 * 24 * 60 * 60 * 1000)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = () => { setRole('EDITOR'); setExpiryMs(7 * 24 * 60 * 60 * 1000); setError(null); setCreatedToken(null); setCopied(false) }

  const handleCreate = async () => {
    setSaving(true)
    setError(null)
    try {
      const token = crypto.randomUUID()
      const expiresAt = expiryMs ? new Date(Date.now() + expiryMs) : null
      // token is the doc ID — direct lookup on join page, no collectionGroup needed
      await setDoc(doc(db, 'inviteLinks', token), {
        wsId,
        wsName,
        wsColor,
        wsInitials,
        token,
        role,
        createdBy: user?.uid ?? '',
        createdByName: user?.displayName ?? user?.email ?? 'Admin',
        expiresAt,
        active: true,
        usageCount: 0,
        createdAt: serverTimestamp(),
      })
      setCreatedToken(token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create link')
    } finally {
      setSaving(false)
    }
  }

  const inviteUrl = createdToken ? `${window.location.origin}/join/${createdToken}` : ''

  const handleCopy = () => {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { reset(); onOpenChange(v) } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create invite link</DialogTitle>
          <DialogDescription>
            Generate a shareable link that lets people request to join <span className="font-medium text-foreground">{wsName}</span>.
          </DialogDescription>
        </DialogHeader>

        {createdToken ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Invite link created!</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-background px-3 py-2 text-xs font-mono truncate">
                  {inviteUrl}
                </code>
                <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={handleCopy}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this link with people you want to invite. They'll need to be signed in to request access. The workspace owner will need to approve each request.
              </p>
            </div>
            <DialogFooter>
              <Button className="w-full" onClick={() => { reset(); onOpenChange(false) }}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div>
            <Field label="Role" required>
              <Select value={role} onValueChange={(v) => setRole(v as 'EDITOR' | 'VIEWER')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EDITOR">Editor — can create and edit environments</SelectItem>
                  <SelectItem value="VIEWER">Viewer — read-only access</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Link expiry" required>
              <Select
                value={expiryMs === null ? 'null' : String(expiryMs)}
                onValueChange={(v) => setExpiryMs(v === 'null' ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((o) => (
                    <SelectItem key={String(o.ms)} value={String(o.ms)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>Cancel</Button>
              <Button onClick={handleCreate} disabled={saving} className="gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                {saving ? 'Creating…' : 'Create link'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Active Invite Links section ──────────────────────────────────────────────

function InviteLinksSection({ wsId }: { wsId: string }) {
  const { data: rawLinks, hasMore: linksHasMore, loadMore: linksLoadMore } = useFirestoreCollection<InviteLink>({
    collectionName: 'inviteLinks',
    filters: [
      { field: 'wsId', op: '==', value: wsId },
      { field: 'active', op: '==', value: true },
    ],
    pageSize: 10,
    realtime: true,
  })
  const links = [...rawLinks].sort((a, b) => {
    const ta = a.createdAt?.toMillis() ?? 0
    const tb = b.createdAt?.toMillis() ?? 0
    return tb - ta
  })

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState<string | null>(null)

  if (links.length === 0) return null

  const handleCopy = (link: InviteLink) => {
    const url = `${window.location.origin}/join/${link.token}`
    navigator.clipboard.writeText(url)
    setCopiedId(link.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDeactivate = async (link: InviteLink) => {
    setDeactivating(link.id)
    try {
      await updateDoc(doc(db, 'inviteLinks', link.id), { active: false })
    } finally {
      setDeactivating(null)
    }
  }

  return (
    <>
      <Separator className="my-2" />
      <div className="px-4 sm:px-6 pt-3 pb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Active invite links ({links.length})
        </h3>
      </div>
      <div className="px-4 sm:px-6 space-y-2 pb-3">
        {links.map((link) => {
          const url = `${window.location.origin}/join/${link.token}`
          const isExpired = link.expiresAt && link.expiresAt.toDate() < new Date()
          return (
            <div
              key={link.id}
              className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <RoleBadge role={link.role} />
                  {isExpired ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      Expired
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {formatExpiry(link.expiresAt)}
                    </span>
                  )}
                  {link.usageCount > 0 && (
                    <span className="text-xs text-muted-foreground">{link.usageCount} use{link.usageCount !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <p className={cn('text-[11px] truncate mt-0.5 font-mono', isExpired ? 'text-muted-foreground/50 line-through' : 'text-muted-foreground')}>{url}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 gap-1 text-xs"
                  onClick={() => handleCopy(link)}
                  disabled={!!isExpired}
                  title={isExpired ? 'Link has expired' : undefined}
                >
                  {copiedId === link.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  {copiedId === link.id ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  title="Deactivate link"
                  disabled={deactivating === link.id}
                  onClick={() => handleDeactivate(link)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
        {linksHasMore && <ScrollSentinel onInView={linksLoadMore} loading={false} />}
      </div>
    </>
  )
}

// ─── Join Requests table ──────────────────────────────────────────────────────

function JoinRequestsTable({ wsId, requests, actorRole, hasMore, loadMore }: { wsId: string; requests: JoinRequest[]; actorRole: string; hasMore: boolean; loadMore: () => void }) {
  const { user } = useAuth()
  const [processing, setProcessing] = useState<string | null>(null)

  if (requests.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        No pending join requests
      </div>
    )
  }

  const handleApprove = async (req: JoinRequest) => {
    setProcessing(req.id)
    try {
      // Validate the originating invite link is still active and not expired
      const linkSnap = await getDoc(doc(db, 'inviteLinks', req.linkId))
      if (!linkSnap.exists() || !linkSnap.data().active) {
        toast.error('The invite link for this request has been deactivated.')
        return
      }
      if (linkSnap.data().expiresAt && (linkSnap.data().expiresAt as { toDate: () => Date }).toDate() < new Date()) {
        toast.error('The invite link for this request has expired.')
        return
      }

      // Add user to workspace members
      await updateDoc(doc(db, 'workspaces', wsId), {
        members: arrayUnion(req.userId),
        [`memberRoles.${req.userId}`]: {
          name: req.userName,
          email: req.userEmail,
          role: req.requestedRole,
          joinedAt: new Date().toISOString(),
          photoURL: req.userPhotoURL ?? null,
        },
        updatedAt: serverTimestamp(),
      })
      // Update request status
      await updateDoc(doc(db, 'joinRequests', req.id), {
        status: 'APPROVED',
        resolvedAt: serverTimestamp(),
        resolvedBy: user?.uid ?? '',
      })
      void logAudit({
        wsId, eventType: 'member.approved',
        actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
        targetType: 'member', targetId: req.userId, targetName: req.userName,
        targetPath: `workspaces/${wsId}`,
        metadata: { role: req.requestedRole, userEmail: req.userEmail },
      })
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (req: JoinRequest) => {
    setProcessing(req.id)
    try {
      await updateDoc(doc(db, 'joinRequests', req.id), {
        status: 'REJECTED',
        resolvedAt: serverTimestamp(),
        resolvedBy: user?.uid ?? '',
      })
      void logAudit({
        wsId, eventType: 'member.rejected',
        actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
        targetType: 'member', targetId: req.userId, targetName: req.userName,
        targetPath: `workspaces/${wsId}`,
        metadata: { userEmail: req.userEmail },
      })
    } finally {
      setProcessing(null)
    }
  }

  return (
    <>
      <Separator className="my-2" />
      <div className="px-4 sm:px-6 pt-3 pb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Join Requests
        </h3>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {requests.length}
        </span>
      </div>
      <div className="px-4 sm:px-6 pb-4">
        <div className="rounded-lg border overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="py-2.5 text-xs">User</TableHead>
                <TableHead className="py-2.5 text-xs">Role requested</TableHead>
                <TableHead className="py-2.5 text-xs">Requested</TableHead>
                <TableHead className="py-2.5 text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => {
                const busy = processing === req.id
                const initials = (req.userName || req.userEmail || '?').slice(0, 2).toUpperCase()
                return (
                  <TableRow key={req.id}>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2.5">
                        {req.userPhotoURL ? (
                          <img src={req.userPhotoURL} alt={req.userName} className="h-8 w-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{req.userName || '—'}</p>
                          <p className="text-xs text-muted-foreground truncate">{req.userEmail}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <RoleBadge role={req.requestedRole} />
                    </TableCell>
                    <TableCell className="py-3 text-xs text-muted-foreground">
                      {formatTs(req.requestedAt)}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          className="h-7 gap-1.5 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => handleApprove(req)}
                          disabled={busy}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          {busy ? '…' : 'Approve'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 px-2.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => handleReject(req)}
                          disabled={busy}
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        {hasMore && <ScrollSentinel onInView={loadMore} loading={false} />}
      </div>
    </>
  )
}

// ─── Change Role dialog ───────────────────────────────────────────────────────

interface ChangeRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  wsId: string
  uid: string
  member: MemberRoleData
  actorUid: string
  actorName: string
  actorRole: string
}

function ChangeRoleDialog({ open, onOpenChange, wsId, uid, member, actorUid, actorName, actorRole }: ChangeRoleDialogProps) {
  const [role, setRole] = useState<Exclude<MemberRole, 'OWNER'>>(
    member.role === 'OWNER' ? 'ADMIN' : member.role as Exclude<MemberRole, 'OWNER'>
  )
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (role === member.role) { onOpenChange(false); return }
    setSaving(true)
    setServerError(null)
    try {
      await updateDoc(doc(db, 'workspaces', wsId), {
        [`memberRoles.${uid}.role`]: role,
      })
      void logAudit({
        wsId, eventType: 'member.role_changed',
        actorUid, actorName, actorRole,
        targetType: 'member', targetId: uid, targetName: member.name || member.email,
        targetPath: `workspaces/${wsId}`,
        metadata: { oldRole: member.role, newRole: role },
      })
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { setServerError(null); onOpenChange(v) } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Update role for <span className="font-medium text-foreground">{member.name || member.email}</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Field label="New role" required>
            <Select value={role} onValueChange={(v) => setRole(v as Exclude<MemberRole, 'OWNER'>)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin — full workspace management</SelectItem>
                <SelectItem value="EDITOR">Editor — can create and edit environments</SelectItem>
                <SelectItem value="VIEWER">Viewer — read-only access</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {serverError && <p className="mb-3 text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Transfer Ownership dialog ────────────────────────────────────────────────

interface TransferOwnershipDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  wsId: string
  currentOwnerId: string
  members: Array<{ uid: string; member: MemberRoleData }>
  actorUid: string
  actorName: string
  actorRole: string
}

function TransferOwnershipDialog({ open, onOpenChange, wsId, currentOwnerId, members, actorUid, actorName, actorRole }: TransferOwnershipDialogProps) {
  const candidates = members.filter((m) => m.uid !== currentOwnerId)
  const [selectedUid, setSelectedUid] = useState(candidates[0]?.uid ?? '')
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const reset = () => { setSelectedUid(candidates[0]?.uid ?? ''); setServerError(null); setConfirmed(false) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUid || !confirmed) return
    setSaving(true)
    setServerError(null)
    try {
      await updateDoc(doc(db, 'workspaces', wsId), {
        ownerId: selectedUid,
        [`memberRoles.${selectedUid}.role`]: 'OWNER',
        [`memberRoles.${currentOwnerId}.role`]: 'ADMIN',
      })
      const newOwnerMember = members.find((m) => m.uid === selectedUid)
      void logAudit({
        wsId, eventType: 'ownership.transferred',
        actorUid, actorName, actorRole,
        targetType: 'member', targetId: selectedUid, targetName: newOwnerMember?.member.name || newOwnerMember?.member.email || selectedUid,
        targetPath: `workspaces/${wsId}`,
        metadata: { previousOwner: currentOwnerId, newOwner: selectedUid },
      })
      reset()
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to transfer ownership')
    } finally {
      setSaving(false)
    }
  }

  if (candidates.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">No other members to transfer ownership to. Invite members first.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { reset(); onOpenChange(v) } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            The selected member will become the new workspace owner. You will be demoted to Admin.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Field label="New owner" required>
            <Select value={selectedUid} onValueChange={setSelectedUid}>
              <SelectTrigger>
                <SelectValue placeholder="Select a member…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map(({ uid, member }) => (
                  <SelectItem key={uid} value={uid}>
                    {member.name || member.email} ({member.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
            <input
              id="confirm-transfer"
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="accent-destructive"
            />
            <label htmlFor="confirm-transfer" className="text-xs text-destructive cursor-pointer">
              I understand this action cannot be undone
            </label>
          </div>

          {serverError && <p className="mb-3 text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={saving || !confirmed || !selectedUid}>
              {saving ? 'Transferring…' : 'Transfer ownership'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Remove Member dialog ─────────────────────────────────────────────────────

interface RemoveMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  wsId: string
  uid: string
  member: MemberRoleData
  actorUid: string
  actorName: string
  actorRole: string
}

function RemoveMemberDialog({ open, onOpenChange, wsId, uid, member, actorUid, actorName, actorRole }: RemoveMemberDialogProps) {
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const handleRemove = async () => {
    setSaving(true)
    setServerError(null)
    try {
      await updateDoc(doc(db, 'workspaces', wsId), {
        members: arrayRemove(uid),
        [`memberRoles.${uid}`]: deleteField(),
        updatedAt: serverTimestamp(),
      })
      void logAudit({
        wsId, eventType: 'member.removed',
        actorUid, actorName, actorRole,
        targetType: 'member', targetId: uid, targetName: member.name || member.email,
        targetPath: `workspaces/${wsId}`,
        metadata: { removedRole: member.role, email: member.email },
      })
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { setServerError(null); onOpenChange(v) } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove member</DialogTitle>
          <DialogDescription>
            Remove <span className="font-medium text-foreground">{member.name || member.email}</span> from this workspace? They will lose all access.
          </DialogDescription>
        </DialogHeader>
        {serverError && <p className="mb-3 text-sm text-destructive">{serverError}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button variant="destructive" onClick={handleRemove} disabled={saving}>
            {saving ? 'Removing…' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Members panel ────────────────────────────────────────────────────────────

type MemberAction =
  | { type: 'changeRole'; uid: string; member: MemberRoleData }
  | { type: 'remove'; uid: string; member: MemberRoleData }
  | { type: 'transferOwnership' }
  | null

function MembersPanel({ wsId }: { wsId: string }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: ws, loading } = useFirestoreDoc<Workspace>('workspaces', wsId)

  const isOwnerEarly = !!ws && ws.ownerId === user?.uid
  const { data: rawJoinRequests, hasMore: joinHasMore, loadMore: joinLoadMore } = useFirestoreCollection<JoinRequest>({
    collectionName: 'joinRequests',
    filters: [
      { field: 'wsId', op: '==', value: wsId },
      { field: 'status', op: '==', value: 'PENDING' },
    ],
    pageSize: 15,
    realtime: true,
    enabled: isOwnerEarly,
  })
  const joinRequests = [...rawJoinRequests].sort((a, b) => {
    const ta = a.requestedAt?.toMillis() ?? 0
    const tb = b.requestedAt?.toMillis() ?? 0
    return ta - tb
  })

  const [tab, setTab] = useState<'members' | 'requests'>('members')
  const [inviteLinkOpen, setInviteLinkOpen] = useState(false)
  const [action, setAction] = useState<MemberAction>(null)
  const [membersVisible, setMembersVisible] = useState(15)
  const loadMoreMembers = useCallback(() => setMembersVisible((c) => c + 15), [])

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (!ws) return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Workspace not found</div>

  const memberEntries = Object.entries(ws.memberRoles ?? {})
    .map(([uid, m]) => ({ uid, member: m as MemberRoleData }))
    .sort((a, b) => {
      const order: Record<MemberRole, number> = { OWNER: 0, ADMIN: 1, EDITOR: 2, VIEWER: 3 }
      return (order[a.member.role] ?? 9) - (order[b.member.role] ?? 9)
    })
  const visibleMembers = memberEntries.slice(0, membersVisible)
  const hasMoreMembers = membersVisible < memberEntries.length

  const isCurrentUserOwner = ws.ownerId === user?.uid
  const isCurrentUserAdmin = ws.memberRoles?.[user?.uid ?? '']?.role === 'ADMIN'
  const canManage = isCurrentUserOwner || isCurrentUserAdmin
  const actorRole = isCurrentUserOwner ? 'OWNER' : isCurrentUserAdmin ? 'ADMIN' : (ws.memberRoles?.[user?.uid ?? '']?.role ?? 'VIEWER')
  const actorUid = user?.uid ?? ''
  const actorName = user?.displayName ?? user?.email ?? 'Unknown'

  return (
    <>
      {/* Dialogs */}
      <InviteLinkDialog
        open={inviteLinkOpen}
        onOpenChange={setInviteLinkOpen}
        wsId={wsId}
        wsName={ws.name}
        wsColor={ws.color ?? '#6366f1'}
        wsInitials={ws.initials ?? ws.name.slice(0, 2).toUpperCase()}
      />

      {action?.type === 'changeRole' && (
        <ChangeRoleDialog
          open
          onOpenChange={(v) => { if (!v) setAction(null) }}
          wsId={wsId}
          uid={action.uid}
          member={action.member}
          actorUid={actorUid}
          actorName={actorName}
          actorRole={actorRole}
        />
      )}
      {action?.type === 'remove' && (
        <RemoveMemberDialog
          open
          onOpenChange={(v) => { if (!v) setAction(null) }}
          wsId={wsId}
          uid={action.uid}
          member={action.member}
          actorUid={actorUid}
          actorName={actorName}
          actorRole={actorRole}
        />
      )}
      {action?.type === 'transferOwnership' && (
        <TransferOwnershipDialog
          open
          onOpenChange={(v) => { if (!v) setAction(null) }}
          wsId={wsId}
          currentOwnerId={ws.ownerId}
          members={memberEntries}
          actorUid={actorUid}
          actorName={actorName}
          actorRole={actorRole}
        />
      )}

      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 border-b px-4 sm:px-6 py-3 sm:py-4">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate(`/workspaces/${wsId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: ws.color || '#6366f1' }}
          >
            {ws.initials || ws.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-base leading-none truncate">{ws.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{memberEntries.length} member{memberEntries.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {isCurrentUserOwner && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2.5 sm:px-3 text-xs"
                onClick={() => setAction({ type: 'transferOwnership' })}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Transfer ownership</span>
              </Button>
            )}
            {isCurrentUserOwner && (
              <Button size="sm" className="h-8 gap-1.5 px-2.5 sm:px-3 text-xs" onClick={() => setInviteLinkOpen(true)}>
                <Link2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Create invite link</span>
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setTab('members')}
            className={cn(
              'py-2.5 pr-4 text-sm font-medium border-b-2 transition-colors',
              tab === 'members'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Members
          </button>
          {isCurrentUserOwner && (
            <button
              type="button"
              onClick={() => setTab('requests')}
              className={cn(
                'flex items-center gap-1.5 py-2.5 px-4 text-sm font-medium border-b-2 transition-colors',
                tab === 'requests'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              Join Requests
              {joinRequests.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {joinRequests.length}
                </span>
              )}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Join Requests tab */}
          {tab === 'requests' && isCurrentUserOwner && (
            <JoinRequestsTable wsId={wsId} requests={joinRequests} actorRole={actorRole} hasMore={joinHasMore} loadMore={joinLoadMore} />
          )}

          {/* Members tab */}
          {tab === 'members' && (
            <>
              <div className="divide-y">
                {visibleMembers.map(({ uid, member }) => {
                  const isOwner = member.role === 'OWNER'
                  const isSelf = uid === user?.uid
                  const canEdit = canManage && !isOwner
                  const canRemove = canManage && !isOwner && !isSelf

                  return (
                    <div key={uid} className="flex items-center gap-3 px-4 sm:px-6 py-3 hover:bg-muted/30 transition-colors">
                      <MemberAvatar member={member} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{member.name || <span className="text-muted-foreground">No name</span>}</p>
                          {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      </div>
                      <RoleBadge role={member.role} />
                      {(canEdit || canRemove) && (
                        <div className="flex items-center gap-1 ml-2">
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => setAction({ type: 'changeRole', uid, member })}
                            >
                              Change role
                            </Button>
                          )}
                          {canRemove && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setAction({ type: 'remove', uid, member })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {hasMoreMembers && <ScrollSentinel onInView={loadMoreMembers} loading={false} />}

              {memberEntries.length === 0 && (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  No members found
                </div>
              )}

              {/* Active invite links */}
              {canManage && <InviteLinksSection wsId={wsId} />}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Members({ wsId }: { wsId: string | null }) {
  if (!wsId) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Select a workspace to manage members
      </div>
    )
  }
  return <MembersPanel key={wsId} wsId={wsId} />
}
