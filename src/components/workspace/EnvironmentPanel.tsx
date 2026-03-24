import { useState, useEffect } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { Globe, Server, Key, Plus, Pencil, Trash2, Layers, ArrowLeft } from 'lucide-react'
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useFirestoreDoc } from '@/hooks/useFirestoreDoc'
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection'
import type { Environment, ProjectStub, EnvironmentStub, UrlItem, ServerItem, VarItem } from '@/types/firestore'
import { cn } from '@/lib/utils'
import { logAudit, ENV_COLORS, ColorPicker, Field, ConfirmDialog, EmptyList } from './shared'
import { UrlsCards, AddUrlDialog } from './UrlManagement'
import { ServersCards, AddServerDialog } from './ServerManagement'
import { VarsCards, AddVarDialog } from './VarManagement'

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const projectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80, 'Max 80 characters'),
})

const envSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80, 'Max 80 characters'),
  isProd: z.boolean(),
  color: z.string().min(1),
})

// ─── Environment panel ────────────────────────────────────────────────────────

type EnvTab = 'urls' | 'servers' | 'vars'

export function EnvironmentPanel({ envId, wsId, isOwner, canEdit, actorRole, onEnvDeleted, onBack }: {
  envId: string; wsId: string; isOwner: boolean; canEdit: boolean; actorRole: string; onEnvDeleted: () => void; onBack?: () => void
}) {
  const { user } = useAuth()
  const { data: env, loading: envLoading } = useFirestoreDoc<Environment>('environments', envId)
  const { data: urls, loading: urlsLoading, hasMore: urlsHasMore, loadMore: urlsLoadMore, refresh: refreshUrls } = useFirestoreCollection<UrlItem>({
    collectionName: `environments/${envId}/urls`,
    orderByField: { field: 'createdAt', direction: 'asc' },
    realtime: false,
    pageSize: 10,
  })
  const { data: servers, loading: serversLoading, hasMore: serversHasMore, loadMore: serversLoadMore, refresh: refreshServers } = useFirestoreCollection<ServerItem>({
    collectionName: `environments/${envId}/servers`,
    orderByField: { field: 'createdAt', direction: 'asc' },
    realtime: false,
    pageSize: 10,
  })
  const { data: vars, loading: varsLoading, hasMore: varsHasMore, loadMore: varsLoadMore, refresh: refreshVars } = useFirestoreCollection<VarItem>({
    collectionName: `environments/${envId}/vars`,
    orderByField: { field: 'createdAt', direction: 'asc' },
    realtime: false,
    pageSize: 10,
  })

  const [tab, setTab] = useState<EnvTab>('urls')
  const [addOpen, setAddOpen] = useState(false)
  const [confirmDeleteEnv, setConfirmDeleteEnv] = useState(false)
  const [editEnvOpen, setEditEnvOpen] = useState(false)

  if (envLoading) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (!env) return <EmptyList label="Environment not found" />

  const handleDeleteEnv = async () => {
    await runTransaction(db, async (tx) => {
      const wsRef = doc(db, 'workspaces', wsId)
      const wsSnap = await tx.get(wsRef)
      const tree: ProjectStub[] = (wsSnap.data()?.projectTree as ProjectStub[]) ?? []
      const newTree = tree.map((p) =>
        p.id === env.projId ? { ...p, environments: p.environments.filter((e) => e.id !== envId) } : p
      )
      tx.update(wsRef, { projectTree: newTree, updatedAt: serverTimestamp() })
      tx.delete(doc(db, 'environments', envId))
    })
    void logAudit({
      wsId, eventType: 'environment.deleted',
      actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
      targetType: 'environment', targetId: envId, targetName: env.name,
      targetPath: `workspaces/${wsId}/projects/${env.projId}`,
    })
    onEnvDeleted()
  }

  const tabOptions = [
    { label: 'URLs', value: 'urls', icon: <Globe className="h-3.5 w-3.5" />, count: urls.length, loading: urlsLoading },
    { label: 'Servers', value: 'servers', icon: <Server className="h-3.5 w-3.5" />, count: servers.length, loading: serversLoading },
    { label: 'Variables', value: 'vars', icon: <Key className="h-3.5 w-3.5" />, count: vars.length, loading: varsLoading },
  ]

  const addLabel = tab === 'urls' ? 'Add URL' : tab === 'servers' ? 'Add Server' : 'Add Variable'

  return (
    <>
      <ConfirmDialog
        open={confirmDeleteEnv}
        onOpenChange={setConfirmDeleteEnv}
        title="Delete Environment"
        description={`Delete "${env.name}" and all its URLs, servers, and variables? This cannot be undone.`}
        onConfirm={handleDeleteEnv}
      />
      {tab === 'urls' && <AddUrlDialog open={addOpen} onOpenChange={setAddOpen} envId={envId} wsId={wsId} actorRole={actorRole} onSuccess={refreshUrls} />}
      {tab === 'servers' && <AddServerDialog open={addOpen} onOpenChange={setAddOpen} envId={envId} wsId={wsId} actorRole={actorRole} onSuccess={refreshServers} />}
      {tab === 'vars' && <AddVarDialog open={addOpen} onOpenChange={setAddOpen} envId={envId} wsId={wsId} actorRole={actorRole} onSuccess={refreshVars} />}
      {canEdit && env && <EditEnvironmentDialog open={editEnvOpen} onOpenChange={setEditEnvOpen} envId={envId} envName={env.name} envIsProd={env.isProd} envColor={env.color} wsId={wsId} actorRole={actorRole} />}

      <div className="flex flex-col h-full">
        {/* Mobile back button */}
        {onBack && (
          <div className="flex items-center gap-2 px-4 pt-3 md:hidden">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to projects
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 pt-4 sm:pt-5 pb-0">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: env.color || '#94a3b8' }} />
          <h3 className="font-bold text-base leading-none">{env.name}</h3>
          {env.isProd && (
            <span className="rounded-md px-2 py-0.5 text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400">PROD</span>
          )}
          <span className="text-muted-foreground/40 text-sm hidden sm:inline">·</span>
          <span className="text-sm text-muted-foreground hidden sm:inline">{env.projName}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
            {isOwner && (
              <Button size="sm" variant="outline" onClick={() => setConfirmDeleteEnv(true)} className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive h-8">
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            )}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setEditEnvOpen(true)} className="gap-1.5 h-8">
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 h-8">
                <Plus className="h-4 w-4" />
                <span className="hidden xs:inline">{addLabel}</span>
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-end gap-0 px-4 sm:px-6 mt-4 border-b">
          {tabOptions.map(({ label, value: v, icon, count }) => (
            <button
              key={v}
              type="button"
              onClick={() => { setTab(v as EnvTab); setAddOpen(false) }}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors select-none',
                tab === v ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className={cn('shrink-0 transition-colors', tab === v ? 'text-primary' : '')}>{icon}</span>
              {label}
              <span className={cn(
                'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums transition-colors',
                tab === v ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {count}
              </span>
              {tab === v && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-primary" />
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'urls' && <UrlsCards urls={urls} envId={envId} wsId={wsId} canDelete={canEdit} canEdit={canEdit} hasMore={urlsHasMore} loadMore={urlsLoadMore} loading={urlsLoading} actorRole={actorRole} onSuccess={refreshUrls} />}
          {tab === 'servers' && <ServersCards servers={servers} envId={envId} wsId={wsId} canDelete={canEdit} canEdit={canEdit} hasMore={serversHasMore} loadMore={serversLoadMore} loading={serversLoading} actorRole={actorRole} onSuccess={refreshServers} />}
          {tab === 'vars' && <VarsCards vars={vars} envId={envId} wsId={wsId} canDelete={canEdit} canEdit={canEdit} hasMore={varsHasMore} loadMore={varsLoadMore} loading={varsLoading} actorRole={actorRole} onSuccess={refreshVars} />}
        </div>
      </div>
    </>
  )
}

// ─── Create Project dialog ────────────────────────────────────────────────────

export function CreateProjectDialog({ open, onOpenChange, wsId, wsName, actorRole }: {
  open: boolean; onOpenChange: (open: boolean) => void; wsId: string; wsName: string; actorRole: string
}) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const reset = () => { setName(''); setErrors({}); setServerError(null) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = projectSchema.safeParse({ name })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe); return
    }
    setSaving(true); setServerError(null)
    try {
      const projRef = doc(collection(db, 'projects'))
      const projId = projRef.id
      const projStub = { id: projId, name: result.data.name, order: Date.now(), environments: [] }
      await runTransaction(db, async (tx) => {
        const wsRef = doc(db, 'workspaces', wsId)
        const wsSnap = await tx.get(wsRef)
        const currentTree: ProjectStub[] = (wsSnap.data()?.projectTree as ProjectStub[]) ?? []
        tx.update(wsRef, { projectTree: [...currentTree, projStub], updatedAt: serverTimestamp() })
        tx.set(projRef, {
          wsId, wsName, name: result.data.name, order: projStub.order, environments: [],
          createdBy: user?.uid ?? '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
      })
      void logAudit({
        wsId, eventType: 'project.created',
        actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
        targetType: 'project', targetId: projId, targetName: result.data.name,
        targetPath: `workspaces/${wsId}`,
      })
      reset(); onOpenChange(false)
      toast.success('Project created successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create project'
      setServerError(msg)
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { reset(); onOpenChange(v) } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Add a project to <span className="font-medium text-foreground">{wsName}</span>.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Field label="Project name" required error={errors.name}>
            <Input placeholder="e.g. Backend API" value={name} onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })) }} autoFocus />
          </Field>
          {serverError && <p className="mb-3 text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create project'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Create Environment dialog ────────────────────────────────────────────────

export function CreateEnvironmentDialog({ open, onOpenChange, wsId, wsName, projId, projName, actorRole }: {
  open: boolean; onOpenChange: (open: boolean) => void; wsId: string; wsName: string; projId: string; projName: string; actorRole: string
}) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [isProd, setIsProd] = useState(false)
  const [color, setColor] = useState(ENV_COLORS[0])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const reset = () => { setName(''); setIsProd(false); setColor(ENV_COLORS[0]); setErrors({}); setServerError(null) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = envSchema.safeParse({ name, isProd, color })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe); return
    }
    setSaving(true); setServerError(null)
    try {
      const envRef = doc(collection(db, 'environments'))
      const envId = envRef.id
      const envStub: EnvironmentStub = { id: envId, name: result.data.name, isProd: result.data.isProd, color: result.data.color }
      await runTransaction(db, async (tx) => {
        const wsRef = doc(db, 'workspaces', wsId)
        const wsSnap = await tx.get(wsRef)
        const currentTree: ProjectStub[] = (wsSnap.data()?.projectTree as ProjectStub[]) ?? []
        const newTree = currentTree.map((p) =>
          p.id === projId ? { ...p, environments: [...p.environments, envStub] } : p
        )
        tx.update(wsRef, { projectTree: newTree, updatedAt: serverTimestamp() })
        tx.set(envRef, {
          wsId, projId, wsName, projName,
          name: result.data.name, isProd: result.data.isProd, color: result.data.color,
          createdBy: user?.uid ?? '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
      })
      void logAudit({
        wsId, eventType: 'environment.created',
        actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
        targetType: 'environment', targetId: envId, targetName: result.data.name,
        targetPath: `workspaces/${wsId}/projects/${projId}`,
      })
      reset(); onOpenChange(false)
      toast.success('Environment created successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create environment'
      setServerError(msg)
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { reset(); onOpenChange(v) } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New environment</DialogTitle>
          <DialogDescription>Add an environment to <span className="font-medium text-foreground">{projName}</span>.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="mb-4 flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: isProd ? '#ef4444' : color }}
            >
              <Layers className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">{name || <span className="text-muted-foreground">Env name</span>}</p>
              {isProd && (
                <span className="rounded-md px-1.5 py-0.5 text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400">PROD</span>
              )}
            </div>
          </div>

          <Field label="Environment name" required error={errors.name}>
            <Input placeholder="e.g. Production" value={name} onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })) }} autoFocus />
          </Field>

          <div className="mb-4 flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Mark as Production</p>
              <p className="text-xs text-muted-foreground">Flags this environment with a PROD badge</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isProd}
              onClick={() => setIsProd((v) => !v)}
              className={cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none', isProd ? 'bg-red-500' : 'bg-input')}
            >
              <span className={cn('pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform', isProd ? 'translate-x-4' : 'translate-x-0')} />
            </button>
          </div>

          <Field label="Color">
            <ColorPicker colors={ENV_COLORS} value={color} onChange={setColor} />
          </Field>

          {serverError && <p className="mb-3 text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create environment'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Project dialog ──────────────────────────────────────────────────────

export function EditProjectDialog({ open, onOpenChange, wsId, projId, projName, actorRole }: {
  open: boolean; onOpenChange: (v: boolean) => void; wsId: string; projId: string; projName: string; actorRole: string
}) {
  const { user } = useAuth()
  const [name, setName] = useState(projName)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setName(projName); setErrors({}); setServerError(null) }
  }, [open, projName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = projectSchema.safeParse({ name })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe); return
    }
    setSaving(true); setServerError(null)
    try {
      await runTransaction(db, async (tx) => {
        const wsRef = doc(db, 'workspaces', wsId)
        const wsSnap = await tx.get(wsRef)
        const tree: ProjectStub[] = (wsSnap.data()?.projectTree as ProjectStub[]) ?? []
        tx.update(wsRef, { projectTree: tree.map((p) => p.id === projId ? { ...p, name: result.data.name } : p), updatedAt: serverTimestamp() })
        tx.update(doc(db, 'projects', projId), { name: result.data.name, updatedAt: serverTimestamp() })
      })
      void logAudit({
        wsId, eventType: 'project.updated',
        actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
        targetType: 'project', targetId: projId, targetName: result.data.name,
        targetPath: `workspaces/${wsId}`,
      })
      onOpenChange(false)
      toast.success('Project renamed successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update project'
      setServerError(msg)
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>Rename this project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Field label="Project name" required error={errors.name}>
            <Input placeholder="e.g. Backend API" value={name} onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })) }} autoFocus />
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

// ─── Edit Environment dialog ──────────────────────────────────────────────────

export function EditEnvironmentDialog({ open, onOpenChange, envId, envName, envIsProd, envColor, wsId, actorRole }: {
  open: boolean; onOpenChange: (v: boolean) => void
  envId: string; envName: string; envIsProd: boolean; envColor: string; wsId: string; actorRole: string
}) {
  const { user } = useAuth()
  const [name, setName] = useState(envName)
  const [isProd, setIsProd] = useState(envIsProd)
  const [color, setColor] = useState(envColor || ENV_COLORS[0])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setName(envName); setIsProd(envIsProd); setColor(envColor || ENV_COLORS[0]); setErrors({}); setServerError(null) }
  }, [open, envName, envIsProd, envColor])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = envSchema.safeParse({ name, isProd, color })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe); return
    }
    setSaving(true); setServerError(null)
    try {
      await runTransaction(db, async (tx) => {
        const wsRef = doc(db, 'workspaces', wsId)
        const wsSnap = await tx.get(wsRef)
        const tree: ProjectStub[] = (wsSnap.data()?.projectTree as ProjectStub[]) ?? []
        const newTree = tree.map((p) => ({
          ...p,
          environments: p.environments.map((e) =>
            e.id === envId ? { ...e, name: result.data.name, isProd: result.data.isProd, color: result.data.color } : e
          ),
        }))
        tx.update(wsRef, { projectTree: newTree, updatedAt: serverTimestamp() })
        tx.update(doc(db, 'environments', envId), { name: result.data.name, isProd: result.data.isProd, color: result.data.color, updatedAt: serverTimestamp() })
      })
      void logAudit({
        wsId, eventType: 'environment.updated',
        actorUid: user?.uid ?? '', actorName: user?.displayName ?? user?.email ?? 'Unknown', actorRole,
        targetType: 'environment', targetId: envId, targetName: result.data.name,
        targetPath: `workspaces/${wsId}`,
      })
      onOpenChange(false)
      toast.success('Environment updated successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update environment'
      setServerError(msg)
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit environment</DialogTitle>
          <DialogDescription>Update environment settings.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: isProd ? '#ef4444' : color }}>
              <Layers className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">{name || <span className="text-muted-foreground">Env name</span>}</p>
              {isProd && <span className="rounded-md px-1.5 py-0.5 text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400">PROD</span>}
            </div>
          </div>
          <Field label="Environment name" required error={errors.name}>
            <Input placeholder="e.g. Production" value={name} onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })) }} autoFocus />
          </Field>
          <div className="mb-4 flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Mark as Production</p>
              <p className="text-xs text-muted-foreground">Flags this environment with a PROD badge</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isProd}
              onClick={() => setIsProd((v) => !v)}
              className={cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none', isProd ? 'bg-red-500' : 'bg-input')}
            >
              <span className={cn('pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform', isProd ? 'translate-x-4' : 'translate-x-0')} />
            </button>
          </div>
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
