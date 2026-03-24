import { useState, useEffect } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import type { Workspace } from '@/types/firestore'
import { logAudit, ENV_COLORS, ColorPicker, Field } from './shared'

const workspaceEditSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80, 'Max 80 characters'),
  initials: z.string().min(1, 'Required').max(2, 'Max 2 characters'),
})

export function EditWorkspaceDialog({ open, onOpenChange, ws, actor }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  ws: Workspace
  actor: { uid: string; name: string; role: string }
}) {
  const [name, setName] = useState(ws.name)
  const [initials, setInitials] = useState(ws.initials || '')
  const [color, setColor] = useState(ws.color || ENV_COLORS[0])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setName(ws.name); setInitials(ws.initials || ''); setColor(ws.color || ENV_COLORS[0]); setErrors({}); setServerError(null) }
  }, [open, ws.name, ws.initials, ws.color])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = workspaceEditSchema.safeParse({ name, initials })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe); return
    }
    setSaving(true); setServerError(null)
    try {
      await updateDoc(doc(db, 'workspaces', ws.id), { name: result.data.name, initials: result.data.initials.toUpperCase(), color, updatedAt: serverTimestamp() })
      void logAudit({
        wsId: ws.id, eventType: 'workspace.updated',
        actorUid: actor.uid, actorName: actor.name, actorRole: actor.role,
        targetType: 'workspace', targetId: ws.id, targetName: result.data.name,
        targetPath: `workspaces/${ws.id}`,
        metadata: { oldName: ws.name, newName: result.data.name },
      })
      onOpenChange(false)
      toast.success('Workspace updated successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update workspace'
      setServerError(msg)
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit workspace</DialogTitle>
          <DialogDescription>Update workspace name and appearance.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold text-white text-base" style={{ backgroundColor: color }}>
              {initials.toUpperCase() || '??'}
            </div>
            <p className="font-semibold text-sm truncate">{name || <span className="text-muted-foreground">Workspace name</span>}</p>
          </div>
          <Field label="Workspace name" required error={errors.name}>
            <Input placeholder="e.g. Acme Corp" value={name} onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })) }} autoFocus />
          </Field>
          <Field label="Initials" required error={errors.initials}>
            <Input placeholder="e.g. AC" value={initials} onChange={(e) => { setInitials(e.target.value.toUpperCase().slice(0, 2)); setErrors((p) => ({ ...p, initials: '' })) }} maxLength={2} className="uppercase tracking-widest" />
          </Field>
          <Field label="Color">
            <ColorPicker colors={ENV_COLORS} value={color} onChange={setColor} />
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
