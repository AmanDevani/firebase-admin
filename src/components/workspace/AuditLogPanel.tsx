import { ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection'
import { ScrollSentinel } from '@/components/ui/ScrollSentinel'
import type { AuditLog } from '@/types/firestore'
import { cn } from '@/lib/utils'

function eventDotColor(eventType: string): string {
  if (eventType.endsWith('.deleted') || eventType === 'member.rejected' || eventType === 'member.removed') return 'bg-destructive/70'
  if (eventType.endsWith('.created') || eventType === 'member.approved') return 'bg-emerald-500/70'
  return 'bg-primary/70'
}

const EVENT_LABEL: Record<string, string> = {
  'url.created': 'added URL', 'url.updated': 'updated URL', 'url.deleted': 'deleted URL',
  'url.label_updated': 'label', 'url.url_updated': 'address',
  'url.status_updated': 'status', 'url.credentials_updated': 'credentials',
  'server.created': 'added server', 'server.updated': 'updated server', 'server.deleted': 'deleted server',
  'server.name_updated': 'name', 'server.host_updated': 'host',
  'server.credentials_updated': 'credentials', 'server.introspection_updated': 'introspection',
  'var.created': 'added variable', 'var.updated': 'updated variable', 'var.deleted': 'deleted variable',
  'project.created': 'created project', 'project.updated': 'updated project', 'project.deleted': 'deleted project',
  'environment.created': 'created environment', 'environment.updated': 'updated environment', 'environment.deleted': 'deleted environment',
  'workspace.updated': 'updated workspace', 'workspace.deleted': 'deleted workspace',
  'member.approved': 'approved member', 'member.rejected': 'rejected member request',
  'member.role_changed': 'changed role', 'member.removed': 'removed member',
  'ownership.transferred': 'transferred ownership',
}

export function AuditLogPanel({ wsId, onClose }: { wsId: string; onClose: () => void }) {
  const { data: logs, loading, hasMore, loadMore } = useFirestoreCollection<AuditLog>({
    collectionName: 'auditLogs',
    filters: [{ field: 'wsId', op: '==', value: wsId }],
    orderByField: { field: 'timestamp', direction: 'desc' },
    pageSize: 10,
    realtime: true,
  })

  function formatAuditTs(ts: AuditLog['timestamp']): string {
    if (!ts) return '—'
    return ts.toDate().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 border-b px-6 py-4 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
        <h2 className="font-semibold text-base">Activity log</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2 p-6">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">No activity yet</div>
        ) : (
          <div className="divide-y">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-6 py-3 hover:bg-muted/30 transition-colors">
                <span className={cn('h-2 w-2 rounded-full mt-2.5 shrink-0', eventDotColor(log.eventType))} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{log.actorName}</span>
                    {' '}
                    <span className="text-muted-foreground">{EVENT_LABEL[log.eventType] ?? log.eventType}</span>
                    {' '}
                    <span className="font-medium">{log.targetName}</span>
                  </p>
                  {Array.isArray(log.metadata?.changes) && (log.metadata.changes as Array<Record<string, unknown>>).map((ch, i) => (
                    <p key={i} className="text-xs text-muted-foreground mt-0.5 truncate">
                      <span className="font-medium text-foreground/70">{EVENT_LABEL[ch.eventType as string] ?? String(ch.eventType)}</span>
                      {ch.from != null && ch.to != null && (
                        <> — <span className="line-through opacity-50">{String(ch.from)}</span>{' → '}<span>{String(ch.to)}</span></>
                      )}
                    </p>
                  ))}
                  <p className="text-xs text-muted-foreground mt-0.5">{formatAuditTs(log.timestamp)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {log.actorRole}
                </span>
              </div>
            ))}
            {hasMore && <ScrollSentinel onInView={loadMore} loading={loading} />}
          </div>
        )}
      </div>
    </div>
  )
}
