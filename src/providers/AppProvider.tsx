import { useEffect, type ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/context/AuthContext'

function VersionLogger() {
  useEffect(() => {
    console.log(`Admin Portal v${__APP_VERSION__}`)
  }, [])
  return null
}

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <AuthProvider>
        <VersionLogger />
        <Toaster position="top-right" richColors />
        {children}
      </AuthProvider>
    </BrowserRouter>
  )
}
