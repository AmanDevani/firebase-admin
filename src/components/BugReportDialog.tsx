import { useState } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import type { BugSeverity } from '@/types/firestore'

const bugSchema = z.object({
  title: z.string().min(1, 'Title is required').max(120, 'Max 120 characters'),
  description: z.string().min(10, 'Please provide at least 10 characters').max(2000, 'Max 2000 characters'),
  steps: z.string().max(2000, 'Max 2000 characters'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
})

const SEVERITY_OPTIONS: { value: BugSeverity; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-50 text-yellow-700 border-yellow-300' },
  { value: 'high', label: 'High', color: 'bg-orange-50 text-orange-700 border-orange-300' },
  { value: 'critical', label: 'Critical', color: 'bg-red-50 text-red-700 border-red-300' },
]

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function BugReportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState('')
  const [severity, setSeverity] = useState<BugSeverity>('medium')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  function reset() {
    setTitle('')
    setDescription('')
    setSteps('')
    setSeverity('medium')
    setErrors({})
    setServerError(null)
    setSubmitted(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = bugSchema.safeParse({ title, description, steps, severity })
    if (!result.success) {
      const fe: Record<string, string> = {}
      for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message
      setErrors(fe)
      return
    }
    setSaving(true)
    setServerError(null)
    try {
      await addDoc(collection(db, 'bugReports'), {
        title: result.data.title,
        description: result.data.description,
        steps: result.data.steps,
        severity: result.data.severity,
        status: 'open',
        pageUrl: window.location.href,
        submittedBy: user?.uid ?? '',
        submittedByName: user?.displayName ?? user?.email ?? 'Unknown',
        submittedByEmail: user?.email ?? '',
        notes: '',
        createdAt: serverTimestamp(),
        resolvedAt: null,
        resolvedBy: null,
      })
      setSubmitted(true)
      toast.success('Bug report submitted successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit bug report'
      setServerError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { reset(); onOpenChange(v) } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a Bug</DialogTitle>
          <DialogDescription>
            Describe the issue you encountered. Our team will review it shortly.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold">Report submitted!</p>
            <p className="text-sm text-muted-foreground">
              Thank you for your feedback. We'll look into it soon.
            </p>
            <Button onClick={() => { reset(); onOpenChange(false) }} className="mt-2">Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <Field label="Title" error={errors.title}>
              <Input
                placeholder="e.g. Environment panel doesn't load"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setErrors((p) => ({ ...p, title: '' })) }}
                autoFocus
              />
            </Field>

            <Field label="Description" error={errors.description}>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[100px] resize-y"
                placeholder="Describe what happened and what you expected to happen..."
                value={description}
                onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: '' })) }}
              />
            </Field>

            <Field label="Steps to reproduce (optional)" error={errors.steps}>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-y"
                placeholder="1. Go to...&#10;2. Click on...&#10;3. See error"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
              />
            </Field>

            <Field label="Severity" error={errors.severity}>
              <div className="flex gap-2 flex-wrap">
                {SEVERITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSeverity(opt.value)}
                    className={`px-3 py-1 rounded-md border text-xs font-medium transition-all ${opt.color} ${
                      severity === opt.value ? 'ring-2 ring-offset-1 ring-offset-background ring-current' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>

            {serverError && <p className="mb-3 text-sm text-destructive">{serverError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Submitting…' : 'Submit report'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
