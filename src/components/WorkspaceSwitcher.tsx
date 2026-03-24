import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { z } from 'zod'
import { toast } from 'sonner'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection'
import { ScrollSentinel } from '@/components/ui/ScrollSentinel'
import type { Workspace } from '@/types/firestore'
import { cn } from '@/lib/utils'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const wsSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80, 'Max 80 characters'),
})

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#0ea5e9', '#3b82f6',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function WsAvatar({ ws, size = 'sm' }: { ws: { color?: string; initials?: string; name?: string }; size?: 'sm' | 'xs' }) {
  const sz = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-5 w-5 text-[9px]'
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded font-semibold text-white', sz)}
      style={{ backgroundColor: ws.color || '#6366f1' }}
    >
      {ws.initials || ws.name?.slice(0, 2).toUpperCase() || '??'}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'h-6 w-6 rounded-full transition-transform hover:scale-110',
            value === c && 'ring-2 ring-offset-2 ring-offset-background scale-110'
          )}
          style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
        />
      ))}
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ─── Create Workspace dialog ───────────────────────────────────────────────────

function CreateWorkspaceDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (id: string) => void
}) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  const reset = () => { setName(''); setColor(PRESET_COLORS[0]); setErrors({}); setServerError(null) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = wsSchema.safeParse({ name })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe)
      return
    }
    setSaving(true)
    setServerError(null)
    try {
      const ref = await addDoc(collection(db, 'workspaces'), {
        name: result.data.name,
        color,
        initials: initials || result.data.name.slice(0, 2).toUpperCase(),
        ownerId: user?.uid ?? '',
        members: user?.uid ? [user.uid] : [],
        memberRoles: user?.uid ? {
          [user.uid]: {
            name: user.displayName ?? user.email ?? 'Owner',
            email: user.email ?? '',
            role: 'OWNER',
            joinedAt: new Date().toISOString(),
            photoURL: user.photoURL ?? null,
          },
        } : {},
        projectTree: [],
        isActive: true,
        suspended: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      reset()
      onOpenChange(false)
      onCreated(ref.id)
      toast.success('Workspace created successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create workspace'
      setServerError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { reset(); onOpenChange(v) } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>Set up a new workspace for your team.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="mb-5 flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {initials || '?'}
            </div>
            <p className="truncate font-semibold text-sm">{name || <span className="text-muted-foreground">Workspace name</span>}</p>
          </div>
          <Field label="Name" error={errors.name}>
            <Input
              placeholder="e.g. Acme Corp"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })) }}
              autoFocus
            />
          </Field>
          <Field label="Color">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          {serverError && <p className="mb-3 text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create workspace'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Workspace switcher ────────────────────────────────────────────────────────

export function WorkspaceSwitcher() {
  const { wsId: selectedWsId } = useParams<{ wsId: string }>()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const { data: rawWorkspaces, hasMore: wsHasMore, loadMore: wsLoadMore, loading: wsLoading } = useFirestoreCollection<Workspace>({
    collectionName: 'workspaces',
    filters: [{ field: 'members', op: 'array-contains', value: user?.uid ?? '' }],
    pageSize: 10,
    realtime: true,
    enabled: !!user?.uid,
  })
  const workspaces = [...rawWorkspaces].sort((a, b) => a.name.localeCompare(b.name))


  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Auto-navigate to first workspace if none selected (only on workspace routes)
  useEffect(() => {
    if (!selectedWsId && workspaces.length > 0 && pathname.startsWith('/workspaces')) {
      navigate(`/workspaces/${workspaces[0].id}`, { replace: true })
    }
  }, [workspaces, selectedWsId, pathname, navigate])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = workspaces.find((w) => w.id === selectedWsId)

  return (
    <>
      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => { navigate(`/workspaces/${id}`); setOpen(false) }}
      />

      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted transition-colors max-w-[140px] sm:max-w-[200px]"
        >
          {selected ? (
            <>
              <WsAvatar ws={selected} />
              <span className="text-sm font-medium truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Select workspace</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border bg-popover shadow-md py-1 text-sm">
            <div className="max-h-60 overflow-y-auto px-2 pb-1">
              {workspaces.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">No workspaces yet</p>
              ) : (
                <>
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => { navigate(`/workspaces/${ws.id}`); setOpen(false) }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-muted transition-colors"
                    >
                      <WsAvatar ws={ws} size="xs" />
                      <span className="flex-1 truncate text-left">{ws.name}</span>
                      {ws.id === selectedWsId && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>
                  ))}
                  {wsHasMore && <ScrollSentinel onInView={wsLoadMore} loading={wsLoading} />}
                </>
              )}
            </div>
            <div className="border-t px-2 pt-1">
              <button
                onClick={() => { setOpen(false); setCreateOpen(true) }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New workspace
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
