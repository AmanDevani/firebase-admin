import { Routes, Route, Navigate, Outlet, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { AppProvider } from '@/providers/AppProvider'
import { Header } from '@/components/layout/Header'
import { WorkspaceDetail } from '@/pages/Workspaces'
import { Members } from '@/pages/Members'
import { Profile } from '@/pages/Profile'
import { Login } from '@/pages/Login'
import { Signup } from '@/pages/Signup'
import { ResetPassword } from '@/pages/ResetPassword'
import { VerifyEmail } from '@/pages/VerifyEmail'
import { AuthAction } from '@/pages/AuthAction'
import { JoinWorkspace } from '@/pages/JoinWorkspace'
import { SuperAdmin } from '@/pages/SuperAdmin'
import { Shield } from 'lucide-react'
import './index.css'

function LoadingScreen() {
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

// Redirects logged-in users away from /login and /signup
function AuthRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  const isUnverifiedEmail = user?.providerData?.[0]?.providerId === 'password' && !user.emailVerified
  if (user && !isUnverifiedEmail) return <Navigate to="/workspaces" replace />
  return <Outlet />
}

// Wraps all protected pages — redirects to /login if not authenticated or not verified
function ProtectedLayout() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  // Block email/password users who haven't verified their email
  const isEmailProvider = user.providerData?.[0]?.providerId === 'password'
  if (isEmailProvider && !user.emailVerified) return <Navigate to="/login" state={{ unverified: true }} replace />
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Header />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}

// Wraps /admin — redirects non-superadmins away
function SuperAdminLayout() {
  const { isSuperAdmin, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!isSuperAdmin) return <Navigate to="/workspaces" replace />
  return <Outlet />
}

function WorkspaceDetailRoute() {
  const { wsId } = useParams<{ wsId: string }>()
  const navigate = useNavigate()
  return (
    <WorkspaceDetail
      key={wsId}
      wsId={wsId!}
      onDeleted={() => navigate('/workspaces', { replace: true })}
      onNavigateMembers={() => navigate(`/workspaces/${wsId}/members`)}
    />
  )
}

function MembersRoute() {
  const { wsId } = useParams<{ wsId: string }>()
  return <Members wsId={wsId ?? null} />
}

export default function App() {
  return (
    <AppProvider>
      <Routes>
          {/* Public routes — accessible without auth */}
          <Route path="/auth/action" element={<AuthAction />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route element={<AuthRedirect />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
          </Route>
          <Route element={<ProtectedLayout />}>
            <Route index element={<Navigate to="/workspaces" replace />} />
            <Route path="/join/:token" element={<JoinWorkspace />} />
            <Route
              path="/workspaces"
              element={
                <div className="flex flex-1 h-full items-center justify-center text-sm text-muted-foreground">
                  Select a workspace to view projects
                </div>
              }
            />
            <Route path="/workspaces/:wsId" element={<WorkspaceDetailRoute />} />
            <Route path="/workspaces/:wsId/members" element={<MembersRoute />} />
            <Route path="/profile" element={<Profile />} />

            {/* Superadmin-only section */}
            <Route element={<SuperAdminLayout />}>
              <Route path="/admin" element={<SuperAdmin />} />
            </Route>

            <Route path="*" element={<Navigate to="/workspaces" replace />} />
          </Route>
      </Routes>
    </AppProvider>
  )
}
