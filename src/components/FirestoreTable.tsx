import { type ReactNode } from 'react'
import { Database } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollSentinel } from '@/components/ui/ScrollSentinel'
import { useFirestoreCollection, type UseFirestoreCollectionOptions } from '@/hooks/useFirestoreCollection'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: string
  width?: string
  render: (row: T) => ReactNode
}

interface FirestoreTableProps<T extends { id: string }> extends UseFirestoreCollectionOptions {
  columns: Column<T>[]
  emptyMessage?: string
  className?: string
  onRowClick?: (row: T) => void
  selectedId?: string
  compact?: boolean
  actions?: ReactNode
}

export function FirestoreTable<T extends { id: string }>({
  columns,
  emptyMessage = 'No records found.',
  className,
  onRowClick,
  selectedId,
  compact = false,
  actions,
  ...queryOptions
}: FirestoreTableProps<T>) {
  const { data, loading, error, hasMore, loadMore } = useFirestoreCollection<T>(queryOptions)

  if (error) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-destructive">
        <p className="font-medium">Failed to load data</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    )
  }

  const cellPad = compact ? 'px-3 py-2' : 'px-4 py-3'

  return (
    <div className={cn('flex flex-col', className)}>
      {actions && (
        <div className="flex items-center justify-between border-b px-4 py-2">{actions}</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    cellPad,
                    'text-left text-xs font-medium uppercase tracking-wide text-muted-foreground'
                  )}
                  style={col.width ? { width: col.width } : {}}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && data.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} className={cellPad}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                    <Database className="h-7 w-7 opacity-25" />
                    <p className="text-sm">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer',
                    selectedId === row.id
                      ? 'bg-primary/5 border-l-2 border-l-primary'
                      : onRowClick && 'hover:bg-muted/40'
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cellPad}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {hasMore && <ScrollSentinel onInView={loadMore} loading={loading} />}
    </div>
  )
}
