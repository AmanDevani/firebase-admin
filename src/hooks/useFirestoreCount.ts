import { useState, useEffect } from 'react'
import { collection, query, where, getCountFromServer } from 'firebase/firestore'
import { db } from '@/lib/firestore'

interface CountFilter {
  field: string
  op: '==' | '!=' | '<' | '<=' | '>' | '>='
  value: unknown
}

/**
 * Returns the count of documents in a collection matching optional filters.
 * Uses getCountFromServer() — reads NO documents, counts only.
 */
export function useFirestoreCount(
  collectionPath: string,
  filters: CountFilter[] = [],
  enabled = true
) {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    if (!enabled || !collectionPath) {
      setCount(null)
      return
    }
    setLoading(true)
    setError(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = query(collection(db, collectionPath)) as any
    for (const f of filters) {
      q = query(q, where(f.field, f.op, f.value))
    }

    getCountFromServer(q)
      .then((snap) => {
        setCount(snap.data().count)
        setLoading(false)
      })
      .catch((e: Error) => {
        setError(e.message)
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionPath, filtersKey, enabled])

  return { count, loading, error }
}
