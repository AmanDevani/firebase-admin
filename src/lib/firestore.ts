import { initializeFirestore, memoryLocalCache } from 'firebase/firestore'
import { app } from './firebase'

export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  experimentalForceLongPolling: true,
})
