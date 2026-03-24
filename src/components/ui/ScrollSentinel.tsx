import { useEffect, useRef } from 'react'

interface ScrollSentinelProps {
  onInView: () => void
  loading: boolean
}

/**
 * Invisible sentinel div placed at the bottom of a list.
 * Fires `onInView` once when it enters the viewport using IntersectionObserver.
 */
export function ScrollSentinel({ onInView, loading }: ScrollSentinelProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loading) onInView()
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onInView, loading])

  return (
    <div ref={ref} className="flex justify-center py-3">
      {loading && (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      )}
    </div>
  )
}
