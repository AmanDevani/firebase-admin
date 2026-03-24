import { useState } from 'react'
import {
  Activity, Users2, Pencil, Trash2, Shield,
} from 'lucide-react'
import {
  writeBatch, collection, doc, runTransaction, getDocs, getCountFromServer, query, where, serverTimestamp,
} from 'firebase/firestore'
import type { CollectionReference, DocumentData, DocumentReference, Query } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { useAuth } from '@/context/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useFirestoreDoc } from '@/hooks/useFirestoreDoc'
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection'
import type { Workspace, ProjectStub, JoinRequest } from '@/types/firestore'
import { cn } from '@/lib/utils'
import { WsAvatar, EmptyList, ConfirmDialog, logAudit } from '@/components/workspace/shared'
import { EditWorkspaceDialog } from '@/components/workspace/EditWorkspaceDialog'
import { ProjectTree } from '@/components/workspace/ProjectTree'
import {
  EnvironmentPanel,
  CreateProjectDialog,
  CreateEnvironmentDialog,
  EditProjectDialog,
  EditEnvironmentDialog,
} from '@/components/workspace/EnvironmentPanel'
import { AuditLogPanel } from '@/components/workspace/AuditLogPanel'

export function WorkspaceDetail({ wsId, onDeleted, onNavigateMembers }: { wsId: string; onDeleted?: () => void; onNavigateMembers?: () => void }) {
  const { user } = useAuth()
  const { data: ws, loading } = useFirestoreDoc<Workspace>('workspaces', wsId)

  const isOwnerEarly = !!ws && ws.ownerId === user?.uid
  const { data: pendingJoinRequests } = useFirestoreCollection<JoinRequest>({
    collectionName: 'joinRequests',
    filters: [
      { field: 'wsId', op: '==', value: wsId },
      { field: 'status', op: '==', value: 'PENDING' },
    ],
    realtime: true,
    enabled: isOwnerEarly,
  })

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null)
  const [createProjOpen, setCreateProjOpen] = useState(false)
  const [createEnvFor, setCreateEnvFor] = useState<{ projId: string; projName: string } | null>(null)
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null)
  const [deleteEnvId, setDeleteEnvId] = useState<string | null>(null)
  const [confirmDeleteWs, setConfirmDeleteWs] = useState(false)
  const [editWsOpen, setEditWsOpen] = useState(false)
  const [editProjectId, setEditProjectId] = useState<string | null>(null)
  const [editEnvId, setEditEnvId] = useState<string | null>(null)
  const [showActivity, setShowActivity] = useState(false)

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
    )
  }
  if (!ws) return <EmptyList label="Workspace not found" />

  if (ws.isActive === false) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <Shield className="h-6 w-6 text-destructive" />
        </div>
        <p className="font-semibold text-foreground">Workspace Deactivated</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          This workspace has been deactivated by a platform administrator. Contact support for assistance.
        </p>
      </div>
    )
  }

  const isOwner = ws.ownerId === user?.uid
  const memberRole = ws.memberRoles?.[user?.uid ?? '']?.role
  const canEdit = isOwner || memberRole === 'ADMIN' || memberRole === 'EDITOR'
  const actorRole = isOwner ? 'OWNER' : (memberRole ?? 'VIEWER')
  const actor = {
    uid: user?.uid ?? '',
    name: user?.displayName ?? user?.email ?? 'Unknown',
    role: actorRole,
  }

  const handleDeleteProject = async () => {
    if (!deleteProjectId) return
    const proj = ws.projectTree?.find((p) => p.id === deleteProjectId)
    const projName = proj?.name ?? ''
    await runTransaction(db, async (tx) => {
      const wsRef = doc(db, 'workspaces', wsId)
      const wsSnap = await tx.get(wsRef)
      const tree: ProjectStub[] = (wsSnap.data()?.projectTree as ProjectStub[]) ?? []
      const treeProj = tree.find((p) => p.id === deleteProjectId)
      const envIds = treeProj?.environments.map((e) => e.id) ?? []
      tx.update(wsRef, {
        projectTree: tree.filter((p) => p.id !== deleteProjectId),
        updatedAt: serverTimestamp(),
      })
      tx.delete(doc(db, 'projects', deleteProjectId))
      for (const eId of envIds) tx.delete(doc(db, 'environments', eId))
    })
    void logAudit({
      wsId, eventType: 'project.deleted',
      actorUid: actor.uid, actorName: actor.name, actorRole: actor.role,
      targetType: 'project', targetId: deleteProjectId, targetName: projName,
      targetPath: `workspaces/${wsId}`,
    })
    if (selectedEnvId) {
      const deletedProj = ws.projectTree?.find((p) => p.id === deleteProjectId)
      if (deletedProj?.environments.some((e) => e.id === selectedEnvId)) setSelectedEnvId(null)
    }
  }

  const handleDeleteEnvById = async () => {
    if (!deleteEnvId) return
    const envStub = ws.projectTree?.flatMap((p) => p.environments).find((e) => e.id === deleteEnvId)
    const envName = envStub?.name ?? ''
    const projId = ws.projectTree?.find((p) => p.environments.some((e) => e.id === deleteEnvId))?.id
    if (!projId) return
    await runTransaction(db, async (tx) => {
      const wsRef = doc(db, 'workspaces', wsId)
      const wsSnap = await tx.get(wsRef)
      const tree: ProjectStub[] = (wsSnap.data()?.projectTree as ProjectStub[]) ?? []
      const newTree = tree.map((p) =>
        p.id === projId ? { ...p, environments: p.environments.filter((e) => e.id !== deleteEnvId) } : p
      )
      tx.update(wsRef, { projectTree: newTree, updatedAt: serverTimestamp() })
      tx.delete(doc(db, 'environments', deleteEnvId))
    })
    void logAudit({
      wsId, eventType: 'environment.deleted',
      actorUid: actor.uid, actorName: actor.name, actorRole: actor.role,
      targetType: 'environment', targetId: deleteEnvId, targetName: envName,
      targetPath: `workspaces/${wsId}/projects/${projId}`,
    })
    if (selectedEnvId === deleteEnvId) setSelectedEnvId(null)
  }

  const handleDeleteWorkspace = async () => {
    const allRefs: DocumentReference<DocumentData, DocumentData>[] = []

    // Only fetch docs when the collection is non-empty (saves reads on empty subcollections)
    async function collectRefs(col: CollectionReference<DocumentData, DocumentData> | Query<DocumentData, DocumentData>) {
      const { data } = await getCountFromServer(col)
      if (data().count === 0) return
      const snap = await getDocs(col)
      snap.docs.forEach((d) => allRefs.push(d.ref))
    }

    const envIds = (ws.projectTree ?? []).flatMap((p) => p.environments.map((e) => e.id))

    await Promise.all(
      envIds.map(async (envId) => {
        await Promise.all([
          collectRefs(collection(db, 'environments', envId, 'urls')),
          collectRefs(collection(db, 'environments', envId, 'servers')),
          collectRefs(collection(db, 'environments', envId, 'vars')),
        ])
        allRefs.push(doc(db, 'environments', envId))
      })
    )

    await Promise.all([
      collectRefs(query(collection(db, 'auditLogs'), where('wsId', '==', wsId))),
      collectRefs(query(collection(db, 'invitations'), where('wsId', '==', wsId))),
    ])

    for (const proj of ws.projectTree ?? []) {
      allRefs.push(doc(db, 'projects', proj.id))
    }

    allRefs.push(doc(db, 'workspaces', wsId))

    const CHUNK = 499
    for (let i = 0; i < allRefs.length; i += CHUNK) {
      const batch = writeBatch(db)
      allRefs.slice(i, i + CHUNK).forEach((ref) => batch.delete(ref))
      await batch.commit()
    }

    void logAudit({
      wsId, eventType: 'workspace.deleted',
      actorUid: actor.uid, actorName: actor.name, actorRole: actor.role,
      targetType: 'workspace', targetId: wsId, targetName: ws.name,
      targetPath: `workspaces/${wsId}`,
    })
    onDeleted?.()
  }

  const deleteProjectName = ws.projectTree?.find((p) => p.id === deleteProjectId)?.name ?? ''
  const deleteEnvName = ws.projectTree?.flatMap((p) => p.environments).find((e) => e.id === deleteEnvId)?.name ?? ''

  return (
    <>
      <ConfirmDialog
        open={confirmDeleteWs}
        onOpenChange={setConfirmDeleteWs}
        title="Delete Workspace"
        description={`Delete "${ws.name}" and all its projects and environments? This cannot be undone.`}
        onConfirm={handleDeleteWorkspace}
      />
      <ConfirmDialog
        open={!!deleteProjectId}
        onOpenChange={(v) => { if (!v) setDeleteProjectId(null) }}
        title="Delete Project"
        description={`Delete "${deleteProjectName}" and all its environments? This cannot be undone.`}
        onConfirm={handleDeleteProject}
      />
      <ConfirmDialog
        open={!!deleteEnvId}
        onOpenChange={(v) => { if (!v) setDeleteEnvId(null) }}
        title="Delete Environment"
        description={`Delete "${deleteEnvName}"? This cannot be undone.`}
        onConfirm={handleDeleteEnvById}
      />
      {createProjOpen && (
        <CreateProjectDialog
          open={createProjOpen}
          onOpenChange={setCreateProjOpen}
          wsId={wsId}
          wsName={ws.name}
          actorRole={actorRole}
        />
      )}
      {createEnvFor && (
        <CreateEnvironmentDialog
          open={!!createEnvFor}
          onOpenChange={(v) => { if (!v) setCreateEnvFor(null) }}
          wsId={wsId}
          wsName={ws.name}
          projId={createEnvFor.projId}
          projName={createEnvFor.projName}
          actorRole={actorRole}
        />
      )}
      {isOwner && <EditWorkspaceDialog open={editWsOpen} onOpenChange={setEditWsOpen} ws={ws} actor={actor} />}
      {editProjectId && (() => {
        const proj = ws.projectTree?.find((p) => p.id === editProjectId)
        return proj ? (
          <EditProjectDialog
            open={!!editProjectId}
            onOpenChange={(v) => { if (!v) setEditProjectId(null) }}
            wsId={wsId}
            projId={editProjectId}
            projName={proj.name}
            actorRole={actorRole}
          />
        ) : null
      })()}
      {editEnvId && (() => {
        const envStub = ws.projectTree?.flatMap((p) => p.environments).find((e) => e.id === editEnvId)
        return envStub ? (
          <EditEnvironmentDialog
            open={!!editEnvId}
            onOpenChange={(v) => { if (!v) setEditEnvId(null) }}
            envId={editEnvId}
            envName={envStub.name}
            envIsProd={envStub.isProd}
            envColor={envStub.color}
            wsId={wsId}
            actorRole={actorRole}
          />
        ) : null
      })()}

      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 border-b px-4 sm:px-6 py-3 sm:py-4">
          <WsAvatar ws={ws} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h2 className="font-bold text-base sm:text-lg leading-none truncate">{ws.name}</h2>
              {ws.suspended && <Badge variant="destructive" className="text-xs px-2 py-0.5">Suspended</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowActivity(true)}
              title="Activity log"
              className="flex items-center gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm"
            >
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Activity</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateMembers?.()}
              title="Members"
              className="relative flex items-center gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm"
            >
              <Users2 className="h-4 w-4" />
              <span className="hidden sm:inline">Members</span>
              {isOwner && pendingJoinRequests.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {pendingJoinRequests.length}
                </span>
              )}
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={() => setEditWsOpen(true)}
                title="Edit workspace"
                className="flex h-8 sm:h-9 w-8 sm:w-9 items-center justify-center rounded-xl border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {isOwner && (
              <button
                type="button"
                onClick={() => setConfirmDeleteWs(true)}
                title="Delete workspace"
                className="flex h-8 sm:h-9 w-8 sm:w-9 items-center justify-center rounded-xl border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {showActivity ? (
          <div className="flex-1 overflow-hidden">
            <AuditLogPanel wsId={wsId} onClose={() => setShowActivity(false)} />
          </div>
        ) : (
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            {/* ProjectTree: full width on mobile (hidden when env selected), fixed sidebar on desktop */}
            <div className={cn(
              'shrink-0 overflow-y-auto border-b md:border-b-0 md:border-r w-full md:w-80',
              selectedEnvId ? 'hidden md:block' : 'block'
            )}>
              <ProjectTree
                projects={ws.projectTree ?? []}
                selectedEnvId={selectedEnvId}
                onSelectEnv={setSelectedEnvId}
                onNewProject={() => setCreateProjOpen(true)}
                onNewEnv={(projId, projName) => setCreateEnvFor({ projId, projName })}
                isOwner={isOwner}
                canEdit={canEdit}
                onDeleteProject={setDeleteProjectId}
                onDeleteEnv={(_projId, envId) => setDeleteEnvId(envId)}
                onEditProject={setEditProjectId}
                onEditEnv={setEditEnvId}
              />
            </div>
            {/* EnvironmentPanel: hidden on mobile when no env selected */}
            <div className={cn(
              'flex-1 overflow-hidden',
              !selectedEnvId && 'hidden md:flex md:items-center md:justify-center'
            )}>
              {selectedEnvId ? (
                <EnvironmentPanel
                  envId={selectedEnvId}
                  wsId={wsId}
                  isOwner={isOwner}
                  canEdit={canEdit}
                  actorRole={actorRole}
                  onEnvDeleted={() => setSelectedEnvId(null)}
                  onBack={() => setSelectedEnvId(null)}
                />
              ) : (
                <EmptyList label="Select an environment" />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
