import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  collection, query, where, getDocs, addDoc, getDoc, doc, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { useAuth } from '@/context/AuthContext'
import { Shield, CheckCircle, XCircle, Clock, Users, Edit2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { InviteLink, JoinRequest } from '@/types/firestore'
import type { Timestamp } from 'firebase/firestore'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatExpiry(ts: Timestamp | null): string {
  if (!ts) return 'Never expires'
  const d = ts.toDate()
  if (d < new Date()) return 'Expired'
  return `Expires ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function RoleChip({ role }: { role: 'EDITOR' | 'VIEWER' }) {
  const isEditor = role === 'EDITOR'
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
      isEditor
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
    )}>
      {isEditor ? <Edit2 className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {isEditor ? 'Editor' : 'Viewer'}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function JoinWorkspace() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [link, setLink] = useState<InviteLink | null>(null)
  const [existingRequest, setExistingRequest] = useState<JoinRequest | null>(null)
  const [alreadyMember, setAlreadyMember] = useState(false)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [joinedReqId, setJoinedReqId] = useState<string | null>(null)
  const [reqStatus, setReqStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return }

    async function load() {
      try {
        // Find invite link by token — direct O(1) lookup (token is the doc ID)
        const linkSnap = await getDoc(doc(db, 'inviteLinks', token!))
        if (!linkSnap.exists()) { setNotFound(true); setLoading(false); return }

        const linkData = { id: linkSnap.id, ...linkSnap.data() } as InviteLink

        if (!linkData.active) {
          setError('This invite link has been deactivated.')
          setLoading(false)
          return
        }
        if (linkData.expiresAt && linkData.expiresAt.toDate() < new Date()) {
          setError('This invite link has expired.')
          setLoading(false)
          return
        }

        setLink(linkData)

        if (user) {
          // Check if already a member of THIS specific workspace only
          const wsDoc = await getDoc(doc(db, 'workspaces', linkData.wsId))
          const isMember = wsDoc.exists() && (wsDoc.data().members as string[])?.includes(user.uid)
          if (isMember) { setAlreadyMember(true); setLoading(false); return }

          // Check for existing pending join request (flat collection)
          const reqSnap = await getDocs(
            query(
              collection(db, 'joinRequests'),
              where('userId', '==', user.uid),
              where('wsId', '==', linkData.wsId),
              where('status', '==', 'PENDING')
            )
          )
          if (!reqSnap.empty) {
            setExistingRequest({ id: reqSnap.docs[0].id, ...reqSnap.docs[0].data() } as JoinRequest)
          }
        }

        setLoading(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load invite link')
        setLoading(false)
      }
    }

    load()
  }, [token, user])

  // Watch own join request for approval / rejection
  useEffect(() => {
    if (!joinedReqId) return
    const unsub = onSnapshot(doc(db, 'joinRequests', joinedReqId), (snap) => {
      const status = snap.data()?.status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined
      if (!status) return
      setReqStatus(status)
      if (status === 'APPROVED') {
        navigate('/workspaces')
      }
    })
    return unsub
  }, [joinedReqId, navigate])

  const handleJoin = async () => {
    if (!user || !link) return
    setJoining(true)
    setError(null)
    try {
      // Re-validate the link at submit time — it may have expired or been deactivated since page load
      const freshSnap = await getDoc(doc(db, 'inviteLinks', link.id))
      if (!freshSnap.exists()) {
        setError('This invite link no longer exists.')
        return
      }
      const fresh = freshSnap.data() as InviteLink
      if (!fresh.active) {
        setError('This invite link has been deactivated.')
        return
      }
      if (fresh.expiresAt && fresh.expiresAt.toDate() < new Date()) {
        setError('This invite link has expired.')
        return
      }

      const ref = await addDoc(collection(db, 'joinRequests'), {
        wsId: link.wsId,
        wsName: link.wsName,
        wsColor: link.wsColor ?? '#6366f1',
        wsInitials: link.wsInitials ?? link.wsName.slice(0, 2).toUpperCase(),
        linkId: link.id,
        token: link.token,
        userId: user.uid,
        userName: user.displayName ?? user.email ?? 'Unknown',
        userEmail: user.email ?? '',
        userPhotoURL: user.photoURL ?? null,
        requestedRole: link.role,
        status: 'PENDING',
        requestedAt: serverTimestamp(),
        resolvedAt: null,
        resolvedBy: null,
      })
      setJoined(true)
      setJoinedReqId(ref.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit join request')
    } finally {
      setJoining(false)
    }
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary animate-pulse">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <p className="text-sm">Loading invite…</p>
        </div>
      </div>
    )
  }

  // ─── Not found ─────────────────────────────────────────────────────────────

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invite not found</CardTitle>
            <CardDescription>This invite link doesn't exist or has been removed.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate('/workspaces')}>
              Go to workspaces
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Link error (expired / deactivated) ────────────────────────────────────

  if (error && !link) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <CardTitle>Link unavailable</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate('/workspaces')}>
              Go to workspaces
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!link) return null

  // ─── Already a member ──────────────────────────────────────────────────────

  if (alreadyMember) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white"
              style={{ backgroundColor: link.wsColor ?? '#6366f1' }}
            >
              {link.wsInitials}
            </div>
            <CardTitle>Already a member</CardTitle>
            <CardDescription>
              You're already a member of <span className="font-medium text-foreground">{link.wsName}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate(`/workspaces`)}>
              Open workspace
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Already requested ─────────────────────────────────────────────────────

  if (existingRequest && !joined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white"
              style={{ backgroundColor: link.wsColor ?? '#6366f1' }}
            >
              {link.wsInitials}
            </div>
            <CardTitle>Request pending</CardTitle>
            <CardDescription>
              Your request to join <span className="font-medium text-foreground">{link.wsName}</span> is awaiting approval.
              You'll get access once the workspace owner approves it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate('/workspaces')}>
              Go to workspaces
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Request submitted (pending / rejected) ────────────────────────────────

  if (joined) {
    const rejected = reqStatus === 'REJECTED'
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            {rejected ? (
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
            ) : (
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
            )}
            <CardTitle>{rejected ? 'Request declined' : 'Request sent!'}</CardTitle>
            <CardDescription>
              {rejected
                ? <>Your request to join <span className="font-medium text-foreground">{link.wsName}</span> was declined by the workspace owner.</>
                : <>Your request to join <span className="font-medium text-foreground">{link.wsName}</span> has been submitted. You'll be redirected automatically once the owner approves it.</>
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate('/workspaces')}>
              Go to workspaces
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Join form ─────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl text-xl font-bold text-white"
            style={{ backgroundColor: link.wsColor ?? '#6366f1' }}
          >
            {link.wsInitials}
          </div>
          <CardTitle className="text-xl">Join {link.wsName}</CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{link.createdByName}</span> invited you to join this workspace.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Info pills */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <RoleChip role={link.role} />
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm bg-muted text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {formatExpiry(link.expiresAt)}
            </span>
          </div>

          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground space-y-1">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span>You'll join as <span className="font-medium text-foreground">{link.role === 'EDITOR' ? 'Editor' : 'Viewer'}</span></span>
            </div>
            <p className="text-xs pl-5">
              {link.role === 'EDITOR'
                ? 'Editors can create and edit projects, environments and resources.'
                : 'Viewers have read-only access to all workspace resources.'}
            </p>
          </div>

          {/* Signed in as */}
          {user && (
            <p className="text-center text-xs text-muted-foreground">
              Joining as <span className="font-medium text-foreground">{user.displayName ?? user.email}</span>
            </p>
          )}

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <Button className="w-full" onClick={handleJoin} disabled={joining}>
            {joining ? 'Sending request…' : 'Request to join'}
          </Button>

          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => navigate('/workspaces')}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
