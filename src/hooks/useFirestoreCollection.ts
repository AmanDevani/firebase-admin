import { useState, useEffect, useCallback, useRef } from 'react'
import {
  collection,
  query,
  where,
  orderBy as fsOrderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
  type QueryConstraint,
  type DocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firestore'

export type FilterOp =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'array-contains'
  | 'in'
  | 'array-contains-any'
  | 'not-in'

export interface CollectionFilter {
  field: string
  op: FilterOp
  value: unknown
}

export interface CollectionOrder {
  field: string
  direction?: 'asc' | 'desc'
}

export interface UseFirestoreCollectionOptions {
  collectionName: string
  filters?: CollectionFilter[]
  orderByField?: CollectionOrder
  pageSize?: number
  realtime?: boolean
  enabled?: boolean
}

export interface UseFirestoreCollectionResult<T> {
  data: T[]
  loading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  refresh: () => void
}

export function useFirestoreCollection<T extends { id: string }>(
  options: UseFirestoreCollectionOptions
): UseFirestoreCollectionResult<T> {
  const {
    collectionName,
    filters = [],
    orderByField,
    pageSize = 10,
    realtime = false,
    enabled = true,
  } = options

  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [fetchKey, setFetchKey] = useState(0)

  const lastDocRef = useRef<DocumentSnapshot | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  // Keep latest options accessible in callbacks without stale closure
  const optionsRef = useRef(options)
  useEffect(() => { optionsRef.current = options })

  // Stable serialized key — causes effect to re-run when query changes
  const optKey = JSON.stringify({ collectionName, filters, orderByField, pageSize })

  const buildConstraints = useCallback(
    (cursor?: DocumentSnapshot): QueryConstraint[] => {
      const c: QueryConstraint[] = []
      for (const f of filters) c.push(where(f.field, f.op as Parameters<typeof where>[1], f.value))
      if (orderByField) c.push(fsOrderBy(orderByField.field, orderByField.direction ?? 'asc'))
      if (cursor) c.push(startAfter(cursor))
      c.push(limit(pageSize + 1))
      return c
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optKey]
  )

  useEffect(() => {
    if (!enabled) return

    unsubRef.current?.()
    unsubRef.current = null
    lastDocRef.current = null
    setData([])
    setHasMore(false)
    setError(null)

    const col = collection(db, collectionName)

    if (realtime) {
      setLoading(true)
      const q = query(col, ...buildConstraints())
      const unsub = onSnapshot(
        q,
        (snap) => {
          const docs = snap.docs.slice(0, pageSize).map((d) => ({ id: d.id, ...d.data() } as T))
          lastDocRef.current = snap.docs[pageSize - 1] ?? null
          setHasMore(snap.docs.length > pageSize)
          setData(docs)
          setLoading(false)
        },
        (e) => {
          setError(e.message)
          setLoading(false)
        }
      )
      unsubRef.current = unsub
      return () => unsub()
    } else {
      setLoading(true)
      const q = query(col, ...buildConstraints())
      getDocs(q)
        .then((snap) => {
          const docs = snap.docs.slice(0, pageSize).map((d) => ({ id: d.id, ...d.data() } as T))
          lastDocRef.current = snap.docs[pageSize - 1] ?? null
          setHasMore(snap.docs.length > pageSize)
          setData(docs)
          setLoading(false)
        })
        .catch((e: Error) => {
          setError(e.message)
          setLoading(false)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optKey, fetchKey, enabled, realtime])

  const loadMore = useCallback(() => {
    if (!lastDocRef.current || loading) return
    const { collectionName: cn, filters: f = [], orderByField: ob, pageSize: ps = 10 } = optionsRef.current
    const constraints: QueryConstraint[] = []
    for (const fi of f) constraints.push(where(fi.field, fi.op as Parameters<typeof where>[1], fi.value))
    if (ob) constraints.push(fsOrderBy(ob.field, ob.direction ?? 'asc'))
    constraints.push(startAfter(lastDocRef.current))
    constraints.push(limit(ps + 1))

    setLoading(true)
    getDocs(query(collection(db, cn), ...constraints))
      .then((snap) => {
        const docs = snap.docs.slice(0, ps).map((d) => ({ id: d.id, ...d.data() } as T))
        lastDocRef.current = snap.docs[ps - 1] ?? null
        setHasMore(snap.docs.length > ps)
        setData((prev) => [...prev, ...docs])
        setLoading(false)
      })
      .catch((e: Error) => {
        setError(e.message)
        setLoading(false)
      })
  }, [loading])

  const refresh = useCallback(() => {
    setFetchKey((k) => k + 1)
  }, [])

  return { data, loading, error, hasMore, loadMore, refresh }
}
