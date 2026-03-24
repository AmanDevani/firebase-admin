import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption {
  label: string
  value: string
  icon?: ReactNode
  count?: number
}

interface SegmentedProps {
  options: (string | SegmentedOption)[]
  value: string
  onChange: (value: string) => void
  className?: string
  size?: 'sm' | 'md'
}

export function Segmented({ options, value, onChange, className, size = 'md' }: SegmentedProps) {
  const items = options.map((o) =>
    typeof o === 'string' ? ({ label: o, value: o } as SegmentedOption) : o
  )

  return (
    <div className={cn('inline-flex items-center gap-0.5 rounded-lg bg-muted p-1', className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md font-medium transition-all duration-150',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === item.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
          )}
        >
          {item.icon && <span className="shrink-0">{item.icon}</span>}
          {item.label}
          {item.count !== undefined && (
            <span
              className={cn(
                'inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
                value === item.value
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted-foreground/20 text-muted-foreground'
              )}
            >
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
