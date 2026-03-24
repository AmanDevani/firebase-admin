import { useState, useCallback } from 'react'
import {
  ChevronDown, ChevronRight, FolderPlus, FolderOpen, Folder, Plus, Pencil, Trash2,
} from 'lucide-react'
import type { ProjectStub, EnvironmentStub } from '@/types/firestore'
import { cn } from '@/lib/utils'
import { ScrollSentinel } from '@/components/ui/ScrollSentinel'

const PAGE_SIZE = 8

export interface ProjectTreeProps {
  projects: ProjectStub[]
  selectedEnvId: string | null
  onSelectEnv: (envId: string) => void
  onNewProject: () => void
  onNewEnv: (projId: string, projName: string) => void
  isOwner: boolean
  canEdit: boolean
  onDeleteProject: (projId: string) => void
  onDeleteEnv: (projId: string, envId: string) => void
  onEditProject: (projId: string) => void
  onEditEnv: (envId: string) => void
}

export function ProjectTree({ projects, selectedEnvId, onSelectEnv, onNewProject, onNewEnv, isOwner, canEdit, onDeleteProject, onDeleteEnv, onEditProject, onEditEnv }: ProjectTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(projects.map((p) => [p.id, true]))
  )
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))

  const sorted = [...projects].sort((a, b) => a.order - b.order)
  const visible = sorted.slice(0, visibleCount)
  const hasMore = visibleCount < sorted.length
  const loadMore = useCallback(() => setVisibleCount((c) => c + PAGE_SIZE), [])

  return (
    <nav className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b shrink-0">
        <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Projects</span>
        {canEdit && (
          <button
            type="button"
            onClick={onNewProject}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <FolderPlus className="h-4 w-4" />
            New
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-3">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <FolderPlus className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-base font-semibold">No projects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">{canEdit ? 'Create your first project to get started' : 'No projects have been created yet'}</p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={onNewProject}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <FolderPlus className="h-4 w-4" />
                New project
              </button>
            )}
          </div>
        ) : (
          <>
          {visible.map((proj) => (
            <div key={proj.id} className="mb-1.5">
              {/* Project row */}
              <div className="group flex items-center mx-2 rounded-lg hover:bg-muted/60 transition-colors">
                <button
                  type="button"
                  onClick={() => toggle(proj.id)}
                  className="flex flex-1 items-center gap-2.5 px-3 py-2.5 min-w-0"
                >
                  <span className="text-muted-foreground shrink-0">
                    {expanded[proj.id]
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />}
                  </span>
                  {expanded[proj.id]
                    ? <FolderOpen className="h-5 w-5 text-amber-500 shrink-0" />
                    : <Folder className="h-5 w-5 text-amber-500 shrink-0" />}
                  <span className="text-sm font-semibold truncate">{proj.name}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                    {proj.environments.length}
                  </span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onNewEnv(proj.id, proj.name)}
                    className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-primary/10 text-primary transition-all"
                    title="New environment"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEditProject(proj.id) }}
                    className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                    title="Edit project"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => onDeleteProject(proj.id)}
                    className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-destructive transition-all"
                    title="Delete project"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Environment rows */}
              {expanded[proj.id] && (
                <div className="mt-1 mb-1">
                  {proj.environments.length === 0 ? (
                    <p className="pl-12 pr-4 py-2 text-sm text-muted-foreground italic">No environments</p>
                  ) : (
                    proj.environments.map((env: EnvironmentStub) => (
                      <div key={env.id} className="group/env flex items-center mx-2" style={{ width: 'calc(100% - 1rem)' }}>
                        <button
                          type="button"
                          onClick={() => onSelectEnv(env.id)}
                          className={cn(
                            'flex flex-1 items-center gap-3 pl-11 pr-3 py-2.5 text-sm transition-colors rounded-lg min-w-0',
                            selectedEnvId === env.id
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-foreground/70 hover:text-foreground hover:bg-muted/50'
                          )}
                        >
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: env.color || '#94a3b8' }}
                          />
                          <span className="flex-1 truncate text-left">{env.name}</span>
                          {env.isProd && (
                            <span className="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400">
                              PROD
                            </span>
                          )}
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onEditEnv(env.id) }}
                            className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 group-hover/env:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                            title="Edit environment"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => onDeleteEnv(proj.id, env.id)}
                            className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 group-hover/env:opacity-100 hover:bg-destructive/10 text-destructive transition-all"
                            title="Delete environment"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
          {hasMore && <ScrollSentinel onInView={loadMore} loading={false} />}
          </>
        )}
      </div>
    </nav>
  )
}
