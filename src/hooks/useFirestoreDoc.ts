import { useReducer, useEffect } from 'react'
import { doc, onSnapshot, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firestore'

type State<T> = { data: T | null; loading: boolean; error: string | null }

function init<T>(): State<T> {
  return { data: null, loading: false, error: null }
}

export function useFirestoreDoc<T extends { id: string }>(
  collectionName: string,
  docId: string | null | undefined,
  realtime = true
) {
  const [state, setState] = useReducer(
    (prev: State<T>, next: Partial<State<T>>) => ({ ...prev, ...next }),
    undefined,
    init<T>
  )

  useEffect(() => {
    if (!docId) {
      setState({ data: null, loading: false, error: null })
      return
    }

    setState({ loading: true, error: null })
    const ref = doc(db, collectionName, docId)

    if (realtime) {
      const unsub = onSnapshot(
        ref,
        (snap) => {
          setState({
            data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null,
            loading: false,
          })
        },
        (e) => setState({ error: e.message, loading: false })
      )
      return unsub
    } else {
      let cancelled = false
      getDoc(ref)
        .then((snap) => {
          if (cancelled) return
          setState({
            data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null,
            loading: false,
          })
        })
        .catch((e: Error) => {
          if (cancelled) return
          setState({ error: e.message, loading: false })
        })
      return () => { cancelled = true }
    }
  }, [collectionName, docId, realtime])

  return state
}
