import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  confirmPasswordReset,
  verifyPasswordResetCode,
  type User,
} from 'firebase/auth'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, googleProvider } from '@/lib/firebase'
import { db } from '@/lib/firestore'

interface AuthContextValue {
  user: User | null
  isSuperAdmin: boolean
  loading: boolean
  loginWithEmail: (email: string, password: string) => Promise<void>
  signupWithEmail: (name: string, email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  updateDisplayName: (name: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  forgotPassword: (email: string) => Promise<void>
  sendVerificationEmail: () => Promise<void>
  resetPassword: (oobCode: string, newPassword: string) => Promise<string>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (!u) {
        setIsSuperAdmin(false)
        setLoading(false)
      }
    })
    return unsub
  }, [])

  // Keep isSuperAdmin in sync via real-time listener on the user doc
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setIsSuperAdmin(snap.data()?.isSuperAdmin === true)
      setLoading(false)
    })
    return unsub
  }, [user])

  async function upsertUserDoc(u: User) {
    await setDoc(
      doc(db, 'users', u.uid),
      {
        email: u.email ?? '',
        displayName: u.displayName ?? null,
        photoURL: u.photoURL ?? null,
        lastActiveAt: serverTimestamp(),
      },
      { merge: true }   // never overwrites isSuperAdmin or other fields
    )
  }

  async function loginWithEmail(email: string, password: string) {
    const { user } = await signInWithEmailAndPassword(auth, email, password)
    if (!user.emailVerified) {
      await signOut(auth)
      const err = new Error('Email not verified')
      ;(err as unknown as { code: string }).code = 'auth/email-not-verified'
      throw err
    }
    await upsertUserDoc(user)
  }

  async function signupWithEmail(name: string, email: string, password: string) {
    const { user } = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(user, { displayName: name })
    // Create the initial doc with isSuperAdmin explicitly so it always exists.
    // upsertUserDoc uses merge:true and would skip fields not present — so we
    // write the full initial document here instead.
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email ?? '',
      displayName: name,
      photoURL: user.photoURL ?? null,
      isSuperAdmin: false,
      lastActiveAt: serverTimestamp(),
    })
    // Send verification email silently — failure doesn't block signup.
    sendEmailVerification(user, {
      url: `${window.location.origin}/auth/action`,
      handleCodeInApp: true,
    }).catch(() => {})
    // Sign out immediately so the unverified user isn't auto-redirected
    // into the app (ProtectedLayout → AuthRedirect loop).
    await signOut(auth)
  }

  async function loginWithGoogle() {
    const { user } = await signInWithPopup(auth, googleProvider)
    await upsertUserDoc(user)
  }

  async function logout() {
    await signOut(auth)
  }

  async function updateDisplayName(name: string) {
    if (!auth.currentUser) throw new Error('Not signed in')
    await updateProfile(auth.currentUser, { displayName: name })
    setUser((u) => u ? { ...u, displayName: name } as User : u)
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    if (!auth.currentUser?.email) throw new Error('Not signed in')
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword)
    await reauthenticateWithCredential(auth.currentUser, credential)
    await updatePassword(auth.currentUser, newPassword)
  }

  async function forgotPassword(email: string) {
    await sendPasswordResetEmail(auth, email, {
      // Redirect directly to our own reset-password page instead of Firebase's hosted UI.
      // Firebase appends ?mode=resetPassword&oobCode=...&apiKey=... to this URL.
      url: `${window.location.origin}/auth/action`,
      handleCodeInApp: true,
    })
  }

  async function sendVerificationEmail() {
    if (!auth.currentUser) throw new Error('Not signed in')
    await sendEmailVerification(auth.currentUser)
  }

  // Validates the oobCode, resets the password, and returns the email address
  async function resetPassword(oobCode: string, newPassword: string): Promise<string> {
    const email = await verifyPasswordResetCode(auth, oobCode)
    await confirmPasswordReset(auth, oobCode, newPassword)
    return email
  }

  return (
    <AuthContext.Provider value={{ user, isSuperAdmin, loading, loginWithEmail, signupWithEmail, loginWithGoogle, logout, updateDisplayName, changePassword, forgotPassword, sendVerificationEmail, resetPassword }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
