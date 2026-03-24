import { useState, useEffect } from 'react'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Loader2, CheckCircle2 } from 'lucide-react'

// ─── Schema ────────────────────────────────────────────────────────────────────

const resetSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm: z.string().min(1, 'Please confirm your password'),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})

// ─── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { resetPassword } = useAuth()

  const oobCode = searchParams.get('oobCode') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [success, setSuccess] = useState(false)

  const clearError = (field: string) => setErrors((p) => ({ ...p, [field]: '' }))

  // If no oobCode in URL, show error immediately
  useEffect(() => {
    if (!oobCode) setLinkError('Invalid reset link. Please request a new password reset.')
  }, [oobCode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = resetSchema.safeParse({ password, confirm })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      await resetPassword(oobCode, result.data.password)
      setSuccess(true)
      toast.success('Password updated successfully. You can now sign in.')
    } catch (err: unknown) {
      toast.error(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Set new password</CardTitle>
          <CardDescription>
            {success ? 'Your password has been updated.' : 'Choose a new password for your account.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {success ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-sm text-muted-foreground">You can now sign in with your new password.</p>
            </div>
          ) : linkError ? (
            <p className="text-sm text-destructive text-center">{linkError}</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <Field label="New password" error={errors.password}>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError('password') }}
                  autoFocus
                />
              </Field>
              <Field label="Confirm password" error={errors.confirm}>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); clearError('confirm') }}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="justify-center">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-sm font-medium text-primary hover:underline"
          >
            Back to sign in
          </button>
        </CardFooter>
      </Card>
    </div>
  )
}

function friendlyError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code
    if (code === 'auth/expired-action-code') return 'This reset link has expired. Please request a new one.'
    if (code === 'auth/invalid-action-code') return 'This reset link is invalid or already used.'
    if (code === 'auth/weak-password') return 'Password must be at least 6 characters.'
    if (code === 'auth/user-not-found') return 'No account found for this reset link.'
  }
  return 'Something went wrong. Please try again.'
}
