import { useState, useEffect } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { Key, Eye, EyeOff, Copy, Check, Trash2, Pencil } from 'lucide-react'
import { collection, doc, addDoc, deleteDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollSentinel } from '@/components/ui/ScrollSentinel'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import type { VarItem } from '@/types/firestore'
import { cn } from '@/lib/utils'
import { encrypt } from '@/lib/crypto'
import { logAudit, useDecrypted, EmptyList, ConfirmDialog, Field } from './shared'

// eslint-disable-next-line react-refresh/only-export-components
export const varSchema = z.object({
  key: z.string().min(1, 'Key is required').max(200).regex(/^\S+$/, 'No spaces allowed'),
  value: z.string(),
})

export function VarCard({ v, envId, wsId, canDelete, canEdit, actorRole, onSuccess }: { v: VarItem; envId: string; wsId: string; canDelete: boolean; canEdit: boolean; actorRole: string; onSuccess: () => void }) {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const plain = useDecrypted(v.secret ? { value: v.value } : {})
  const displayValue = v.secret ? (plain.value || '') : v.value
  const handleCopy = () => {
    navigator.clipboard.writeText(displayValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const handleDelete = async () => {
    await deleteDoc(doc(db, 'environments', envId, 'vars', v.id))
    void logAudit({
      wsId, eventType: 'var.deleted',
      actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
      targetType: 'var', targetId: v.id, targetName: v.key,
      targetPath: `workspaces/${wsId}/environments/${envId}`,
    })
    onSuccess()
  }
  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Variable"
        description={`Delete "${v.key}"? This action cannot be undone.`}
        onConfirm={handleDelete}
      />
      {canEdit && <EditVarDialog open={editOpen} onOpenChange={setEditOpen} v={v} plainValue={displayValue} envId={envId} wsId={wsId} actorRole={actorRole} onSuccess={onSuccess} />}
    <div className="group flex items-center gap-4 rounded-2xl border bg-card px-5 py-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', v.secret ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-muted')}>
        <Key className={cn('h-4.5 w-4.5', v.secret ? 'text-amber-600' : 'text-muted-foreground')} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-mono text-sm font-bold truncate">{v.key}</p>
          {v.secret && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
              secret
            </span>
          )}
        </div>
        <p className="font-mono text-sm text-muted-foreground truncate">
          {v.secret && !show ? '••••••••••••' : displayValue || <span className="italic opacity-50">empty</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={handleCopy}
          title="Copy value"
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
            copied ? 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/30' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
        {v.secret && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            title={show ? 'Hide value' : 'Show value'}
            className="flex h-9 w-9 items-center justify-center rounded-xl border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            title="Edit variable"
            className="flex h-9 w-9 items-center justify-center rounded-xl border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title="Delete variable"
            className="flex h-9 w-9 items-center justify-center rounded-xl border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
    </>
  )
}

export function VarsCards({ vars, envId, wsId, canDelete, canEdit, hasMore, loadMore, loading, actorRole, onSuccess }: {
  vars: VarItem[]; envId: string; wsId: string; canDelete: boolean; canEdit: boolean
  hasMore: boolean; loadMore: () => void; loading: boolean; actorRole: string; onSuccess: () => void
}) {
  if (vars.length === 0 && !loading) return <EmptyList label="No variables yet" />
  return (
    <div className="flex flex-col gap-3 p-6">
      {vars.map((v) => <VarCard key={v.id} v={v} envId={envId} wsId={wsId} canDelete={canDelete} canEdit={canEdit} actorRole={actorRole} onSuccess={onSuccess} />)}
      {hasMore && <ScrollSentinel onInView={loadMore} loading={loading} />}
    </div>
  )
}

export function AddVarDialog({ open, onOpenChange, envId, wsId, actorRole, onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; envId: string; wsId: string; actorRole: string; onSuccess: () => void }) {
  const { user } = useAuth()
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [secret, setSecret] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const reset = () => { setKey(''); setValue(''); setSecret(false); setErrors({}); setServerError(null) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = varSchema.safeParse({ key, value })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe); return
    }
    setSaving(true); setServerError(null)
    try {
      const storedValue = secret && result.data.value ? await encrypt(result.data.value) : result.data.value
      const newItem = {
        key: result.data.key,
        value: storedValue,
        secret,
        createdBy: user?.uid ?? '',
        createdAt: new Date().toISOString(),
      }
      const varRef = await addDoc(collection(db, 'environments', envId, 'vars'), newItem)
      void logAudit({
        wsId, eventType: 'var.created',
        actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
        targetType: 'var', targetId: varRef.id, targetName: result.data.key,
        targetPath: `workspaces/${wsId}/environments/${envId}`,
      })
      reset(); onOpenChange(false); onSuccess()
      toast.success('Variable added successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add variable'
      setServerError(msg)
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { reset(); onOpenChange(v) } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Variable</DialogTitle>
          <DialogDescription>Add an environment variable or secret.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Field label="Key" required error={errors.key}>
            <Input placeholder="e.g. DATABASE_URL" value={key} onChange={(e) => { setKey(e.target.value); setErrors((p) => ({ ...p, key: '' })) }} autoFocus className="font-mono" />
          </Field>
          <Field label="Value" error={errors.value}>
            <Input placeholder="Value" type={secret ? 'password' : 'text'} value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" />
          </Field>
          <div className="mb-4 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSecret((s) => !s)}
              className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none', secret ? 'bg-primary' : 'bg-muted')}
            >
              <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transition-transform', secret ? 'translate-x-4' : 'translate-x-0')} />
            </button>
            <label className="text-sm text-muted-foreground cursor-pointer select-none" onClick={() => setSecret((s) => !s)}>
              Mark as secret
            </label>
          </div>
          {serverError && <p className="mb-3 text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add Variable'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function EditVarDialog({ open, onOpenChange, v, plainValue, envId, wsId, actorRole, onSuccess }: {
  open: boolean; onOpenChange: (v: boolean) => void
  v: VarItem; plainValue: string; envId: string; wsId: string; actorRole: string; onSuccess: () => void
}) {
  const { user } = useAuth()
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [secret, setSecret] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setKey(v.key); setValue(plainValue); setSecret(v.secret); setErrors({}); setServerError(null) }
  }, [open, v.key, plainValue, v.secret])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = varSchema.safeParse({ key, value })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe); return
    }
    setSaving(true); setServerError(null)
    try {
      const storedValue = secret && result.data.value ? await encrypt(result.data.value) : result.data.value
      await updateDoc(doc(db, 'environments', envId, 'vars', v.id), { key: result.data.key, value: storedValue, secret })
      void logAudit({
        wsId, eventType: 'var.updated',
        actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
        targetType: 'var', targetId: v.id, targetName: result.data.key,
        targetPath: `workspaces/${wsId}/environments/${envId}`,
      })
      onOpenChange(false); onSuccess()
      toast.success('Variable updated successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update variable'
      setServerError(msg)
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Variable</DialogTitle>
          <DialogDescription>Update this environment variable.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Field label="Key" required error={errors.key}>
            <Input placeholder="e.g. DATABASE_URL" value={key} onChange={(e) => { setKey(e.target.value); setErrors((p) => ({ ...p, key: '' })) }} autoFocus className="font-mono" />
          </Field>
          <Field label="Value" error={errors.value}>
            <Input placeholder="Value" type={secret ? 'password' : 'text'} value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" />
          </Field>
          <div className="mb-4 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSecret((s) => !s)}
              className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none', secret ? 'bg-primary' : 'bg-muted')}
            >
              <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transition-transform', secret ? 'translate-x-4' : 'translate-x-0')} />
            </button>
            <label className="text-sm text-muted-foreground cursor-pointer select-none" onClick={() => setSecret((s) => !s)}>
              Mark as secret
            </label>
          </div>
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
