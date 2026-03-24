import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Loader2 } from 'lucide-react'

// Inline Google icon SVG to avoid extra deps
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

const forgotSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
})

// ─── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, error, children, extra }: { label: string; error?: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        {extra}
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { loginWithEmail, loginWithGoogle, forgotPassword, sendVerificationEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Shown when redirected back here because email isn't verified
  const unverifiedSession = (location.state as { unverified?: boolean } | null)?.unverified ?? false
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent] = useState(false)

  // Forgot password state
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [resetEmail, setResetEmail] = useState('')
  const [resetErrors, setResetErrors] = useState<Record<string, string>>({})
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const result = loginSchema.safeParse({ email, password })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      await loginWithEmail(email, password)
    } catch (err: unknown) {
      toast.error(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    try {
      await loginWithGoogle()
    } catch (err: unknown) {
      toast.error(friendlyError(err))
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    const result = forgotSchema.safeParse({ email: resetEmail })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setResetErrors(fe)
      return
    }
    setResetErrors({})
    setResetLoading(true)
    try {
      await forgotPassword(resetEmail)
      setResetSent(true)
    } catch (err: unknown) {
      toast.error(friendlyResetError(err))
    } finally {
      setResetLoading(false)
    }
  }

  function backToLogin() {
    setMode('login')
    setResetEmail('')
    setResetSent(false)
    setResetErrors({})
  }

  async function handleResendVerification() {
    setResendLoading(true)
    try {
      await sendVerificationEmail()
      setResendSent(true)
    } catch {
      // silently ignore — user may have already signed out
    } finally {
      setResendLoading(false)
    }
  }

  if (mode === 'forgot') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Reset password</CardTitle>
            <CardDescription>
              {resetSent
                ? 'Check your inbox for a reset link.'
                : "Enter your email and we'll send you a reset link."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {resetSent ? (
              <p className="text-center text-sm text-muted-foreground">
                Didn&apos;t receive it?{' '}
                <button
                  type="button"
                  onClick={() => { setResetSent(false); setResetEmail('') }}
                  className="font-medium text-primary hover:underline"
                >
                  Try again
                </button>
              </p>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <Field label="Email" error={resetErrors.email}>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(e) => { setResetEmail(e.target.value); setResetErrors((p) => ({ ...p, email: '' })) }}
                    autoFocus
                  />
                </Field>
                <Button type="submit" className="w-full" disabled={resetLoading}>
                  {resetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter className="justify-center">
            <button
              type="button"
              onClick={backToLogin}
              className="text-sm font-medium text-primary hover:underline"
            >
              Back to sign in
            </button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Admin Portal</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Unverified email banner */}
          {unverifiedSession && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 space-y-1">
              <p className="font-medium">Email not verified</p>
              <p className="text-yellow-700 text-xs">
                Please verify your email before signing in.{' '}
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendLoading || resendSent}
                  className="underline font-medium disabled:opacity-60"
                >
                  {resendSent ? 'Sent!' : resendLoading ? 'Sending…' : 'Resend verification email'}
                </button>
              </p>
            </div>
          )}

          {/* Google */}
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={handleGoogle}
            disabled={googleLoading || loading}
          >
            {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs text-muted-foreground">
              <span className="bg-card px-2">or continue with email</span>
            </div>
          </div>

          {/* Email / Password */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Email" error={errors.email}>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })) }}
              />
            </Field>
            <Field
              label="Password"
              error={errors.password}
              extra={
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setResetEmail(email) }}
                  className="text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  Forgot password?
                </button>
              }
            >
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })) }}
              />
            </Field>

            <Button type="submit" className="w-full" disabled={loading || googleLoading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/signup')}
              className="font-medium text-primary hover:underline"
            >
              Sign up
            </button>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

function friendlyError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code
    if (code === 'auth/email-not-verified')
      return 'Please verify your email before signing in. Check your inbox for a verification link.'
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found')
      return 'Invalid email or password.'
    if (code === 'auth/too-many-requests')
      return 'Too many attempts. Please try again later.'
    if (code === 'auth/popup-closed-by-user')
      return 'Google sign-in was cancelled.'
  }
  return 'Something went wrong. Please try again.'
}

function friendlyResetError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code
    if (code === 'auth/user-not-found' || code === 'auth/invalid-email')
      return 'No account found with that email.'
    if (code === 'auth/too-many-requests')
      return 'Too many attempts. Please try again later.'
  }
  return 'Something went wrong. Please try again.'
}
