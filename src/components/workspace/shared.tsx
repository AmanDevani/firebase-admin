/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { decrypt } from '@/lib/crypto'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ─── Audit log helper ─────────────────────────────────────────────────────────

export async function logAudit(params: {
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

// ─── Decryption hook ──────────────────────────────────────────────────────────

export function useDecrypted(fields: Record<string, string | undefined>): Record<string, string> {
  const [decrypted, setDecrypted] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    Promise.all(
      Object.entries(fields).map(async ([k, v]) => [k, v ? await decrypt(v) : ''] as [string, string])
    ).then((entries) => {
      if (!cancelled) setDecrypted(Object.fromEntries(entries))
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(fields)])
  return decrypted
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ENV_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#22c55e', '#14b8a6', '#0ea5e9',
]

// ─── Workspace avatar ─────────────────────────────────────────────────────────

export function WsAvatar({ ws }: { ws: { color?: string; initials?: string; name?: string } }) {
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold text-white text-base"
      style={{ backgroundColor: ws.color || '#6366f1' }}
    >
      {ws.initials || ws.name?.slice(0, 2).toUpperCase() || '??'}
    </div>
  )
}

// ─── Empty helper ─────────────────────────────────────────────────────────────

export function EmptyList({ label }: { label: string }) {
  return <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">{label}</div>
}

// ─── Color picker helper ──────────────────────────────────────────────────────

export function ColorPicker({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'h-7 w-7 rounded-full transition-transform hover:scale-110',
            value === c && 'ring-2 ring-offset-2 ring-offset-background scale-110'
          )}
          style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
        />
      ))}
    </div>
  )
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

export function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
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

// ─── Confirm dialog ───────────────────────────────────────────────────────────

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Delete', onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handle = async () => {
    setBusy(true); setErr(null)
    try { await onConfirm(); onOpenChange(false) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { setErr(null); onOpenChange(v) } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {err && <p className="mb-3 text-sm text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={handle} disabled={busy}>
            {busy ? 'Deleting…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
