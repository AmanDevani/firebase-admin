import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'

/**
 * Universal Firebase email-action handler.
 * Set this page as the custom Action URL in Firebase Console:
 *   Authentication → Templates → (any template) → Edit → Customize action URL
 *   → https://your-domain.com/auth/action
 *
 * Firebase appends ?mode=verifyEmail|resetPassword|recoverEmail&oobCode=...
 * This page immediately redirects to the appropriate in-app handler.
 */
export function AuthAction() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const mode = searchParams.get('mode')
    const qs = searchParams.toString()

    if (mode === 'verifyEmail') {
      navigate(`/verify-email?${qs}`, { replace: true })
    } else if (mode === 'resetPassword') {
      navigate(`/reset-password?${qs}`, { replace: true })
    } else {
      // Unknown mode — fall back to login
      navigate('/login', { replace: true })
    }
  }, [searchParams, navigate])

  return (
    <div className="flex h-screen items-center justify-center bg-muted/40">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary animate-pulse">
          <Shield className="h-6 w-6 text-primary-foreground" />
        </div>
        <p className="text-sm">Loading…</p>
      </div>
    </div>
  )
}
