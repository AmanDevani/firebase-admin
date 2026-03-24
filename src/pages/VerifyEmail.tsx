import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { applyActionCode } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Shield, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const oobCode = searchParams.get('oobCode')
    if (!oobCode) {
      setErrorMsg('Invalid verification link.')
      setStatus('error')
      return
    }
    applyActionCode(auth, oobCode)
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        const code = (err as { code?: string })?.code
        if (code === 'auth/expired-action-code')
          setErrorMsg('This verification link has expired. Please sign in and request a new one.')
        else if (code === 'auth/invalid-action-code')
          setErrorMsg('This link is invalid or has already been used.')
        else
          setErrorMsg('Email verification failed. Please try again.')
        setStatus('error')
      })
  }, [searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Email Verification</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col items-center gap-4 text-center pb-6">
          {status === 'loading' && (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <CardDescription>Verifying your email address…</CardDescription>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <div className="space-y-1">
                <p className="font-semibold">Email verified!</p>
                <p className="text-sm text-muted-foreground">
                  Your email has been confirmed. You can now sign in.
                </p>
              </div>
              <Button className="w-full mt-2" onClick={() => navigate('/login')}>
                Go to Sign In
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="h-10 w-10 text-destructive" />
              <div className="space-y-1">
                <p className="font-semibold">Verification failed</p>
                <p className="text-sm text-muted-foreground">{errorMsg}</p>
              </div>
              <Button className="w-full mt-2" onClick={() => navigate('/login')}>
                Go to Sign In
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
