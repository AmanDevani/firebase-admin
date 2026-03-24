import { useState, useEffect } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { Globe, Eye, EyeOff, Copy, Check, ExternalLink, Trash2, Pencil } from 'lucide-react'
import { collection, doc, addDoc, deleteDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollSentinel } from '@/components/ui/ScrollSentinel'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import type { UrlItem } from '@/types/firestore'
import { cn } from '@/lib/utils'
import { encrypt } from '@/lib/crypto'
import { logAudit, useDecrypted, EmptyList, ConfirmDialog, Field } from './shared'

// eslint-disable-next-line react-refresh/only-export-components
export const urlSchema = z.object({
  label: z.string().min(1, 'Label is required').max(80),
  url: z.string().url('Must be a valid URL'),
  username: z.string().max(200).optional(),
  password: z.string().max(500).optional(),
})

export function UrlCard({ u, envId, wsId, canDelete, canEdit, actorRole, onSuccess }: { u: UrlItem; envId: string; wsId: string; canDelete: boolean; canEdit: boolean; actorRole: string; onSuccess: () => void }) {
  const { user } = useAuth()
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedPass, setCopiedPass] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const hasCredentials = u.username || u.password
  const plain = useDecrypted({ username: u.username, password: u.password })

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(u.url)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 1500)
  }
  const handleCopyPass = () => {
    navigator.clipboard.writeText(plain.password ?? '')
    setCopiedPass(true)
    setTimeout(() => setCopiedPass(false), 1500)
  }
  const handleDelete = async () => {
    await deleteDoc(doc(db, 'environments', envId, 'urls', u.id))
    void logAudit({
      wsId, eventType: 'url.deleted',
      actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
      targetType: 'url', targetId: u.id, targetName: u.label,
      targetPath: `workspaces/${wsId}/environments/${envId}`,
      metadata: { url: u.url, status: u.status ?? 'ACTIVE' },
    })
    onSuccess()
  }
  const isActive = u.status === 'ACTIVE'
  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete URL"
        description={`Delete "${u.label}"? This action cannot be undone.`}
        onConfirm={handleDelete}
      />
      {canEdit && <EditUrlDialog open={editOpen} onOpenChange={setEditOpen} u={u} plain={plain} envId={envId} wsId={wsId} actorRole={actorRole} onSuccess={onSuccess} />}
    <div className="group flex flex-col rounded-2xl border bg-card shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', isActive ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-muted')}>
            <Globe className={cn('h-5 w-5', isActive ? 'text-emerald-600' : 'text-muted-foreground')} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-base truncate leading-tight">{u.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{isActive ? 'Active endpoint' : 'Inactive'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn(
            'rounded-full px-2.5 py-1 text-xs font-semibold',
            isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
          )}>
            {isActive ? '● Active' : '○ Inactive'}
          </span>
          {canEdit && (
            <button
              onClick={() => setEditOpen(true)}
              title="Edit URL"
              className="flex h-8 w-8 items-center justify-center rounded-xl border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete URL"
              className="flex h-8 w-8 items-center justify-center rounded-xl border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mx-5 border-t" />

      <div className="flex items-center gap-2 px-5 py-4">
        <span className="flex-1 truncate font-mono text-sm text-primary bg-muted/50 rounded-lg px-3 py-2.5">{u.url}</span>
        <button
          onClick={handleCopyUrl}
          title="Copy URL"
          className={cn(
            'shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
            copiedUrl ? 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/30' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          {copiedUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
        <a
          href={u.url}
          target="_blank"
          rel="noreferrer"
          title="Open in new tab"
          className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {hasCredentials && (
        <>
          <div className="mx-5 border-t" />
          <div className="flex flex-col gap-2 px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Credentials</p>
            {u.username && (
              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-2.5">
                <span className="text-xs font-medium text-muted-foreground">Username</span>
                <span className="font-mono text-sm font-medium">{plain.username || '…'}</span>
              </div>
            )}
            {u.password && (
              <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-2.5">
                <span className="text-xs font-medium text-muted-foreground shrink-0">Password</span>
                <span className="flex-1 truncate font-mono text-sm text-center">
                  {showPass ? (plain.password || '…') : '••••••••'}
                </span>
                <button
                  onClick={() => setShowPass((v) => !v)}
                  title={showPass ? 'Hide' : 'Show'}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={handleCopyPass}
                  title="Copy password"
                  className={cn('shrink-0 transition-colors', copiedPass ? 'text-emerald-600' : 'text-muted-foreground hover:text-foreground')}
                >
                  {copiedPass ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
    </>
  )
}

export function UrlsCards({ urls, envId, wsId, canDelete, canEdit, hasMore, loadMore, loading, actorRole, onSuccess }: {
  urls: UrlItem[]; envId: string; wsId: string; canDelete: boolean; canEdit: boolean
  hasMore: boolean; loadMore: () => void; loading: boolean; actorRole: string; onSuccess: () => void
}) {
  if (urls.length === 0 && !loading) return <EmptyList label="No URLs yet" />
  return (
    <div className="flex flex-col gap-0 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {urls.map((u) => <UrlCard key={u.id} u={u} envId={envId} wsId={wsId} canDelete={canDelete} canEdit={canEdit} actorRole={actorRole} onSuccess={onSuccess} />)}
      </div>
      {hasMore && <ScrollSentinel onInView={loadMore} loading={loading} />}
    </div>
  )
}

export function AddUrlDialog({ open, onOpenChange, envId, wsId, actorRole, onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; envId: string; wsId: string; actorRole: string; onSuccess: () => void }) {
  const { user } = useAuth()
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const reset = () => { setLabel(''); setUrl(''); setUsername(''); setPassword(''); setShowPass(false); setStatus('ACTIVE'); setErrors({}); setServerError(null) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = urlSchema.safeParse({ label, url, username: username || undefined, password: password || undefined })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe); return
    }
    setSaving(true); setServerError(null)
    try {
      const newItem: Record<string, unknown> = {
        label: result.data.label,
        url: result.data.url,
        status,
        createdBy: user?.uid ?? '',
        createdAt: new Date().toISOString(),
      }
      if (result.data.username) newItem.username = await encrypt(result.data.username)
      if (result.data.password) newItem.password = await encrypt(result.data.password)
      const urlRef = await addDoc(collection(db, 'environments', envId, 'urls'), newItem)
      void logAudit({
        wsId, eventType: 'url.created',
        actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
        targetType: 'url', targetId: urlRef.id, targetName: result.data.label,
        targetPath: `workspaces/${wsId}/environments/${envId}`,
        metadata: { url: result.data.url, status, hasCredentials: !!(result.data.username || result.data.password) },
      })
      reset(); onOpenChange(false); onSuccess()
      toast.success('URL added successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add URL'
      setServerError(msg)
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { reset(); onOpenChange(v) } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add URL</DialogTitle>
          <DialogDescription>Add a URL endpoint to this environment.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Field label="Label" required error={errors.label}>
            <Input placeholder="e.g. API Base" value={label} onChange={(e) => { setLabel(e.target.value); setErrors((p) => ({ ...p, label: '' })) }} autoFocus />
          </Field>
          <Field label="URL" required error={errors.url}>
            <Input placeholder="https://api.example.com" value={url} onChange={(e) => { setUrl(e.target.value); setErrors((p) => ({ ...p, url: '' })) }} />
          </Field>
          <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Credentials (optional)</p>
          <Field label="Username" error={errors.username}>
            <Input placeholder="e.g. admin" value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Password" error={errors.password}>
            <div className="relative">
              <Input
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="Status">
            <div className="flex gap-3">
              {(['ACTIVE', 'INACTIVE'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={cn('flex-1 rounded-md border px-3 py-2 text-sm transition-colors', status === s ? 'border-primary bg-primary/10 text-primary font-medium' : 'hover:bg-muted')}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
          {serverError && <p className="mb-3 text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add URL'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function EditUrlDialog({ open, onOpenChange, u, plain, envId, wsId, actorRole, onSuccess }: {
  open: boolean; onOpenChange: (v: boolean) => void
  u: UrlItem; plain: Record<string, string>; envId: string; wsId: string; actorRole: string; onSuccess: () => void
}) {
  const { user } = useAuth()
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setLabel(u.label); setUrl(u.url); setStatus(u.status ?? 'ACTIVE')
      setUsername(plain.username || ''); setPassword(plain.password || '')
      setShowPass(false); setErrors({}); setServerError(null)
    }
  }, [open, u.label, u.url, u.status, plain.username, plain.password])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = urlSchema.safeParse({ label, url, username: username || undefined, password: password || undefined })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe); return
    }
    setSaving(true); setServerError(null)
    try {
      const updates: Record<string, unknown> = { label: result.data.label, url: result.data.url, status, updatedAt: new Date().toISOString() }
      updates.username = result.data.username ? await encrypt(result.data.username) : ''
      updates.password = result.data.password ? await encrypt(result.data.password) : ''
      await updateDoc(doc(db, 'environments', envId, 'urls', u.id), updates)
      const actor = { actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole }
      const urlTarget = { targetType: 'url', targetId: u.id, targetName: result.data.label, targetPath: `workspaces/${wsId}/environments/${envId}` }
      const urlChanges: Array<Record<string, unknown>> = []
      if (u.label !== result.data.label)
        urlChanges.push({ eventType: 'url.label_updated', from: u.label, to: result.data.label })
      if (u.url !== result.data.url)
        urlChanges.push({ eventType: 'url.url_updated', from: u.url, to: result.data.url })
      if ((u.status ?? 'ACTIVE') !== status)
        urlChanges.push({ eventType: 'url.status_updated', from: u.status ?? 'ACTIVE', to: status })
      if (plain.username !== result.data.username || plain.password !== result.data.password)
        urlChanges.push({ eventType: 'url.credentials_updated', hasCredentials: !!(result.data.username || result.data.password) })
      if (urlChanges.length > 0)
        void logAudit({ wsId, eventType: 'url.updated', ...actor, ...urlTarget, metadata: { changes: urlChanges } })
      onOpenChange(false); onSuccess()
      toast.success('URL updated successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update URL'
      setServerError(msg)
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit URL</DialogTitle>
          <DialogDescription>Update this URL endpoint.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Field label="Label" required error={errors.label}>
            <Input placeholder="e.g. API Base" value={label} onChange={(e) => { setLabel(e.target.value); setErrors((p) => ({ ...p, label: '' })) }} autoFocus />
          </Field>
          <Field label="URL" required error={errors.url}>
            <Input placeholder="https://api.example.com" value={url} onChange={(e) => { setUrl(e.target.value); setErrors((p) => ({ ...p, url: '' })) }} />
          </Field>
          <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Credentials (optional)</p>
          <Field label="Username" error={errors.username}>
            <Input placeholder="e.g. admin" value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Password" error={errors.password}>
            <div className="relative">
              <Input type={showPass ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
              <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="Status">
            <div className="flex gap-3">
              {(['ACTIVE', 'INACTIVE'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={cn('flex-1 rounded-md border px-3 py-2 text-sm transition-colors', status === s ? 'border-primary bg-primary/10 text-primary font-medium' : 'hover:bg-muted')}>
                  {s}
                </button>
              ))}
            </div>
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
