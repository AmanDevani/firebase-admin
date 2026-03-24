import { useState } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ArrowLeft, Check, Pencil, X, MailCheck } from 'lucide-react'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const displayNameSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(100, 'Max 100 characters'),
})

const changePasswordSchema = z.object({
  current: z.string().min(1, 'Current password is required'),
  next: z.string().min(6, 'New password must be at least 6 characters'),
  confirm: z.string().min(1, 'Please confirm your new password'),
}).refine((d) => d.next === d.confirm, {
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

// ─── Display name section ─────────────────────────────────────────────────────

function DisplayNameSection() {
  const { user, updateDisplayName } = useAuth()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(user?.displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    const result = displayNameSchema.safeParse({ name: value })
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid name')
      return
    }
    setSaving(true)
    setError('')
    try {
      await updateDisplayName(result.data.name.trim())
      setEditing(false)
      setSaved(true)
      toast.success('Display name updated')
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      const msg = friendlyError(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setValue(user?.displayName ?? '')
    setError('')
    setEditing(false)
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Display name</label>
      {editing ? (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              value={value}
              onChange={(e) => { setValue(e.target.value); setError('') }}
              autoFocus
              className={cn(error && 'border-destructive')}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
            />
            <Button size="icon" variant="ghost" onClick={handleSave} disabled={saving} className="shrink-0">
              <Check className="h-4 w-4 text-emerald-600" />
            </Button>
            <Button size="icon" variant="ghost" onClick={handleCancel} disabled={saving} className="shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
          <span className="text-sm">{user?.displayName || <span className="text-muted-foreground italic">Not set</span>}</span>
          <button
            onClick={() => { setValue(user?.displayName ?? ''); setEditing(true) }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {saved ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Pencil className="h-3.5 w-3.5" />}
            {saved ? 'Saved' : 'Edit'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Email verification section ───────────────────────────────────────────────

function VerifyEmailRow() {
  const { user, sendVerificationEmail } = useAuth()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSend = async () => {
    setSending(true)
    try {
      await sendVerificationEmail()
      setSent(true)
      toast.success('Verification email sent. Check your inbox.')
      setTimeout(() => setSent(false), 5000)
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Email</label>
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5 gap-2">
        <span className="text-sm truncate">{user?.email}</span>
        <div className="flex items-center gap-2 shrink-0">
          {user?.emailVerified ? (
            <span className="text-xs rounded-full px-2 py-0.5 bg-emerald-500/10 text-emerald-600">Verified</span>
          ) : (
            <>
              <span className="text-xs rounded-full px-2 py-0.5 bg-yellow-500/10 text-yellow-600">Unverified</span>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || sent}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary disabled:opacity-60 transition-colors"
              >
                {sent ? (
                  <><Check className="h-3.5 w-3.5 text-emerald-600" /> Sent</>
                ) : (
                  <><MailCheck className="h-3.5 w-3.5" /> {sending ? 'Sending…' : 'Verify'}</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Change password section ──────────────────────────────────────────────────

function ChangePasswordSection() {
  const { changePassword } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const clearError = (field: string) => setErrors((p) => ({ ...p, [field]: '' }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = changePasswordSchema.safeParse({ current, next, confirm })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe)
      return
    }
    setErrors({})
    setSaving(true)
    try {
      await changePassword(result.data.current, result.data.next)
      setCurrent(''); setNext(''); setConfirm('')
      toast.success('Password updated successfully')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label="Current password" error={errors.current}>
        <Input
          type="password"
          placeholder="Current password"
          value={current}
          onChange={(e) => { setCurrent(e.target.value); clearError('current') }}
        />
      </Field>
      <Field label="New password" error={errors.next}>
        <Input
          type="password"
          placeholder="Min. 6 characters"
          value={next}
          onChange={(e) => { setNext(e.target.value); clearError('next') }}
        />
      </Field>
      <Field label="Confirm new password" error={errors.confirm}>
        <Input
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); clearError('confirm') }}
        />
      </Field>
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  )
}

// ─── Profile page ─────────────────────────────────────────────────────────────

export function Profile() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isEmailProvider = user?.providerData?.[0]?.providerId === 'password'

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="flex flex-1 h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-lg px-4 py-10 space-y-6">

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/workspaces')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Button>

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-3 text-center">
          <Avatar className="h-20 w-20">
            <AvatarImage src={user?.photoURL ?? ''} referrerPolicy="no-referrer" />
            <AvatarFallback className="text-xl bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-semibold">{user?.displayName ?? '—'}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        {/* Editable fields */}
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <h2 className="text-sm font-semibold">Profile</h2>
          <DisplayNameSection />
          <VerifyEmailRow />
        </div>

        {/* Change password — only for email/password accounts */}
        {isEmailProvider && (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold">Change password</h2>
            <ChangePasswordSection />
          </div>
        )}

        {/* Read-only account info */}
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <h2 className="text-sm font-semibold">Account info</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between rounded-lg bg-muted/50 px-4 py-2.5">
              <span className="text-muted-foreground">UID</span>
              <span className="font-mono text-xs truncate max-w-[200px]">{user?.uid}</span>
            </div>
            <div className="flex justify-between rounded-lg bg-muted/50 px-4 py-2.5">
              <span className="text-muted-foreground">Provider</span>
              <span>{user?.providerData?.[0]?.providerId ?? '—'}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('wrong-password') || msg.includes('invalid-credential')) return 'Current password is incorrect'
  if (msg.includes('weak-password')) return 'New password must be at least 6 characters'
  if (msg.includes('requires-recent-login')) return 'Please sign out and sign in again before changing your password'
  return msg
}
