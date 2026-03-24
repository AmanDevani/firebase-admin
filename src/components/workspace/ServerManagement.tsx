import { useState, useEffect } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { Server, Eye, EyeOff, Copy, Check, ExternalLink, Trash2, Pencil } from 'lucide-react'
import { collection, doc, addDoc, deleteDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollSentinel } from '@/components/ui/ScrollSentinel'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import type { ServerItem } from '@/types/firestore'
import { cn } from '@/lib/utils'
import { encrypt } from '@/lib/crypto'
import { logAudit, useDecrypted, EmptyList, ConfirmDialog, Field } from './shared'

// eslint-disable-next-line react-refresh/only-export-components
export const serverSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80),
  host: z.string().min(1, 'Host is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string(),
  introspection: z.string(),
})

export function ServerCard({ s, envId, wsId, canDelete, canEdit, actorRole, onSuccess }: { s: ServerItem; envId: string; wsId: string; canDelete: boolean; canEdit: boolean; actorRole: string; onSuccess: () => void }) {
  const { user } = useAuth()
  const [showPass, setShowPass] = useState(false)
  const [copiedPass, setCopiedPass] = useState(false)
  const [copiedHost, setCopiedHost] = useState(false)
  const [showIntro, setShowIntro] = useState(false)
  const [copiedUser, setCopiedUser] = useState(false)
  const [copiedIntro, setCopiedIntro] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const plain = useDecrypted({ username: s.username, password: s.password, introspection: s.introspection })

  const handleCopyHost = () => { navigator.clipboard.writeText(s.host); setCopiedHost(true); setTimeout(() => setCopiedHost(false), 1500) }
  const handleOpenHost = () => { const url = /^https?:\/\//i.test(s.host) ? s.host : `https://${s.host}`; window.open(url, '_blank', 'noopener,noreferrer') }
  const handleCopyPass = () => { navigator.clipboard.writeText(plain.password ?? ''); setCopiedPass(true); setTimeout(() => setCopiedPass(false), 1500) }
  const handleCopyUser = () => { navigator.clipboard.writeText(plain.username ?? ''); setCopiedUser(true); setTimeout(() => setCopiedUser(false), 1500) }
  const handleCopyIntro = () => { navigator.clipboard.writeText(plain.introspection ?? ''); setCopiedIntro(true); setTimeout(() => setCopiedIntro(false), 1500) }

  const handleDelete = async () => {
    await deleteDoc(doc(db, 'environments', envId, 'servers', s.id))
    void logAudit({
      wsId, eventType: 'server.deleted',
      actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
      targetType: 'server', targetId: s.id, targetName: s.name,
      targetPath: `workspaces/${wsId}/environments/${envId}`,
      metadata: { host: s.host },
    })
    onSuccess()
  }

  const actionBtn = 'flex h-7 w-7 items-center justify-center rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent'

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Server"
        description={`Delete "${s.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
      />
      {canEdit && <EditServerDialog open={editOpen} onOpenChange={setEditOpen} s={s} plain={plain} envId={envId} wsId={wsId} actorRole={actorRole} onSuccess={onSuccess} />}
      <div className="group relative rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Server className="h-4 w-4 text-primary" />
          </div>
          <p className="font-semibold text-sm truncate flex-1">{s.name}</p>
          {canEdit && (
            <button onClick={() => setEditOpen(true)} title="Edit server"
              className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {canDelete && (
            <button onClick={() => setConfirmDelete(true)} title="Delete server"
              className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="divide-y">
          <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/20 transition-colors">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">Host</span>
            <span className="font-mono text-xs truncate flex-1">{s.host}</span>
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={handleCopyHost} title="Copy host" className={cn(actionBtn, copiedHost && 'text-emerald-600 hover:text-emerald-600')}>
                {copiedHost ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button onClick={handleOpenHost} title="Open in new tab" className={actionBtn}>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {s.username && (
            <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/20 transition-colors">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">Username</span>
              <span className="font-mono text-xs truncate flex-1">{plain.username || '…'}</span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={handleCopyUser} title="Copy username" className={cn(actionBtn, copiedUser && 'text-emerald-600 hover:text-emerald-600')}>
                  {copiedUser ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )}

          {s.password && (
            <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/20 transition-colors">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">Password</span>
              <span className="font-mono text-xs truncate flex-1 tracking-widest">
                {showPass ? (plain.password || '…') : '••••••••'}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => setShowPass((v) => !v)} title={showPass ? 'Hide' : 'Show'} className={actionBtn}>
                  {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button onClick={handleCopyPass} title="Copy password" className={cn(actionBtn, copiedPass && 'text-emerald-600 hover:text-emerald-600')}>
                  {copiedPass ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )}

          {s.introspection && (
            <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/20 transition-colors">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">Introspection</span>
              <span className="font-mono text-xs truncate flex-1 tracking-widest">
                {showIntro ? (plain.introspection || '…') : '••••••••'}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => setShowIntro((v) => !v)} title={showIntro ? 'Hide' : 'Show'} className={actionBtn}>
                  {showIntro ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button onClick={handleCopyIntro} title="Copy introspection" className={cn(actionBtn, copiedIntro && 'text-emerald-600 hover:text-emerald-600')}>
                  {copiedIntro ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export function ServersCards({ servers, envId, wsId, canDelete, canEdit, hasMore, loadMore, loading, actorRole, onSuccess }: {
  servers: ServerItem[]; envId: string; wsId: string; canDelete: boolean; canEdit: boolean
  hasMore: boolean; loadMore: () => void; loading: boolean; actorRole: string; onSuccess: () => void
}) {
  if (servers.length === 0 && !loading) return <EmptyList label="No servers yet" />
  return (
    <div className="flex flex-col gap-0 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {servers.map((s) => <ServerCard key={s.id} s={s} envId={envId} wsId={wsId} canDelete={canDelete} canEdit={canEdit} actorRole={actorRole} onSuccess={onSuccess} />)}
      </div>
      {hasMore && <ScrollSentinel onInView={loadMore} loading={loading} />}
    </div>
  )
}

export function AddServerDialog({ open, onOpenChange, envId, wsId, actorRole, onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; envId: string; wsId: string; actorRole: string; onSuccess: () => void }) {
  const { user } = useAuth()
  const [fields, setFields] = useState({ name: '', host: '', username: '', password: '', introspection: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((p) => ({ ...p, [k]: e.target.value }))
    setErrors((p) => ({ ...p, [k]: '' }))
  }
  const reset = () => { setFields({ name: '', host: '', username: '', password: '', introspection: '' }); setErrors({}); setServerError(null) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = serverSchema.safeParse(fields)
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe); return
    }
    setSaving(true); setServerError(null)
    try {
      const now = new Date().toISOString()
      const newItem = {
        name: result.data.name,
        host: result.data.host,
        username: result.data.username ? await encrypt(result.data.username) : '',
        password: result.data.password ? await encrypt(result.data.password) : '',
        introspection: result.data.introspection ? await encrypt(result.data.introspection) : '',
        createdBy: user?.uid ?? '',
        createdAt: now,
        updatedAt: now,
      }
      const srvRef = await addDoc(collection(db, 'environments', envId, 'servers'), newItem)
      void logAudit({
        wsId, eventType: 'server.created',
        actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
        targetType: 'server', targetId: srvRef.id, targetName: result.data.name,
        targetPath: `workspaces/${wsId}/environments/${envId}`,
        metadata: { host: result.data.host, hasCredentials: !!(result.data.username || result.data.password), hasIntrospection: !!result.data.introspection },
      })
      reset(); onOpenChange(false); onSuccess()
      toast.success('Server added successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add server'
      setServerError(msg)
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { reset(); onOpenChange(v) } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Server</DialogTitle>
          <DialogDescription>Add a server to this environment.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Field label="Name" required error={errors.name}>
            <Input placeholder="e.g. Production DB" value={fields.name} onChange={set('name')} autoFocus />
          </Field>
          <Field label="Host" required error={errors.host}>
            <Input placeholder="e.g. db.example.com" value={fields.host} onChange={set('host')} />
          </Field>
          <Field label="Username" required error={errors.username}>
            <Input placeholder="e.g. admin" value={fields.username} onChange={set('username')} />
          </Field>
          <Field label="Password" error={errors.password}>
            <Input type="password" placeholder="••••••••" value={fields.password} onChange={set('password')} />
          </Field>
          <Field label="Introspection" error={errors.introspection}>
            <Input type="password" placeholder="••••••••" value={fields.introspection} onChange={set('introspection')} />
          </Field>
          {serverError && <p className="mb-3 text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add Server'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function EditServerDialog({ open, onOpenChange, s, plain, envId, wsId, actorRole, onSuccess }: {
  open: boolean; onOpenChange: (v: boolean) => void
  s: ServerItem; plain: Record<string, string>; envId: string; wsId: string; actorRole: string; onSuccess: () => void
}) {
  const { user } = useAuth()
  const [fields, setFields] = useState({ name: '', host: '', username: '', password: '', introspection: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setFields({ name: s.name, host: s.host, username: plain.username || '', password: plain.password || '', introspection: plain.introspection || '' })
      setErrors({}); setServerError(null)
    }
  }, [open, s.name, s.host, plain.username, plain.password, plain.introspection])

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((p) => ({ ...p, [k]: e.target.value }))
    setErrors((p) => ({ ...p, [k]: '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = serverSchema.safeParse(fields)
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe); return
    }
    setSaving(true); setServerError(null)
    try {
      const updates = {
        name: result.data.name,
        host: result.data.host,
        username: result.data.username ? await encrypt(result.data.username) : '',
        password: result.data.password ? await encrypt(result.data.password) : '',
        introspection: result.data.introspection ? await encrypt(result.data.introspection) : '',
        updatedAt: new Date().toISOString(),
      }
      await updateDoc(doc(db, 'environments', envId, 'servers', s.id), updates)
      const actor = { actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole }
      const srvTarget = { targetType: 'server', targetId: s.id, targetName: result.data.name, targetPath: `workspaces/${wsId}/environments/${envId}` }
      const srvChanges: Array<Record<string, unknown>> = []
      if (s.name !== result.data.name)
        srvChanges.push({ eventType: 'server.name_updated', from: s.name, to: result.data.name })
      if (s.host !== result.data.host)
        srvChanges.push({ eventType: 'server.host_updated', from: s.host, to: result.data.host })
      if (plain.username !== result.data.username || plain.password !== result.data.password)
        srvChanges.push({ eventType: 'server.credentials_updated', hasCredentials: !!(result.data.username || result.data.password) })
      if (plain.introspection !== result.data.introspection)
        srvChanges.push({ eventType: 'server.introspection_updated', hasIntrospection: !!result.data.introspection })
      if (srvChanges.length > 0)
        void logAudit({ wsId, eventType: 'server.updated', ...actor, ...srvTarget, metadata: { changes: srvChanges } })
      onOpenChange(false); onSuccess()
      toast.success('Server updated successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update server'
      setServerError(msg)
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Server</DialogTitle>
          <DialogDescription>Update server connection details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Field label="Name" required error={errors.name}>
            <Input placeholder="e.g. Production DB" value={fields.name} onChange={set('name')} autoFocus />
          </Field>
          <Field label="Host" required error={errors.host}>
            <Input placeholder="e.g. db.example.com" value={fields.host} onChange={set('host')} />
          </Field>
          <Field label="Username" required error={errors.username}>
            <Input placeholder="e.g. admin" value={fields.username} onChange={set('username')} />
          </Field>
          <Field label="Password" error={errors.password}>
            <Input type="password" placeholder="••••••••" value={fields.password} onChange={set('password')} />
          </Field>
          <Field label="Introspection" error={errors.introspection}>
            <Input type="password" placeholder="••••••••" value={fields.introspection} onChange={set('introspection')} />
          </Field>
          {serverError && <p className="mb-3 text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
