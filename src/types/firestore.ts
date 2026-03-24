import type { Timestamp } from 'firebase/firestore'

export type WorkspacePlan = 'free' | 'starter' | 'team' | 'business'
export type MemberRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'

export interface MemberRoleData {
  name: string
  email: string
  role: MemberRole
  joinedAt: string
  photoURL: string | null
}

export interface EnvironmentStub {
  id: string
  name: string
  isProd: boolean
  color: string
}

export interface ProjectStub {
  id: string
  name: string
  order: number
  environments: EnvironmentStub[]
}

export interface Workspace {
  id: string
  name: string
  color: string
  initials: string
  ownerId: string
  members: string[]
  memberRoles: Record<string, MemberRoleData>
  projectTree: ProjectStub[]
  isActive?: boolean
  suspended: boolean
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

export interface UrlItem {
  id: string
  label: string
  url: string
  status: 'ACTIVE' | 'INACTIVE'
  username?: string
  password?: string
  createdBy: string
  createdAt: string
}

export interface ServerItem {
  id: string
  name: string
  host: string
  username: string
  password: string
  introspection: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface VarItem {
  id: string
  key: string
  value: string
  secret: boolean
  createdBy: string
  createdAt: string
}

export interface Environment {
  id: string
  wsId: string
  projId: string
  wsName: string
  projName: string
  name: string
  isProd: boolean
  color: string
  createdBy: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

export interface AuditLog {
  id: string
  wsId: string
  eventType: string
  actorUid: string
  actorName: string
  actorRole: MemberRole
  targetType: string
  targetId: string
  targetName: string
  targetPath: string
  metadata: Record<string, unknown>
  timestamp: Timestamp | null
  deleteAt: Timestamp | null
}

export interface Invitation {
  id: string
  wsId: string
  wsName: string
  email: string
  role: 'EDITOR' | 'VIEWER'
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED'
  invitedBy: string
  invitedByName: string
  invitedAt: Timestamp | null
  updatedAt: Timestamp | null
}

export interface InviteLink {
  id: string
  wsId: string
  wsName: string
  wsColor: string
  wsInitials: string
  token: string
  role: 'EDITOR' | 'VIEWER'
  createdBy: string
  createdByName: string
  expiresAt: Timestamp | null
  active: boolean
  usageCount: number
  createdAt: Timestamp | null
}

export interface JoinRequest {
  id: string
  wsId: string
  wsName: string
  wsColor: string
  wsInitials: string
  linkId: string
  token: string
  userId: string
  userName: string
  userEmail: string
  userPhotoURL: string | null
  requestedRole: 'EDITOR' | 'VIEWER'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  requestedAt: Timestamp | null
  resolvedAt: Timestamp | null
  resolvedBy: string | null
}

export type BugSeverity = 'low' | 'medium' | 'high' | 'critical'
export type BugStatus = 'open' | 'in_progress' | 'resolved'

export interface BugReport {
  id: string
  title: string
  description: string
  steps: string
  severity: BugSeverity
  status: BugStatus
  pageUrl: string
  submittedBy: string
  submittedByName: string
  submittedByEmail: string
  notes: string
  createdAt: Timestamp | null
  resolvedAt: Timestamp | null
  resolvedBy: string | null
}

export interface UserDoc {
  id: string
  email: string
  displayName: string | null
  photoURL: string | null
  isSuperAdmin: boolean
  suspended: boolean
  suspendedAt: Timestamp | null
  suspendedBy: string | null
  plan: WorkspacePlan
  createdAt: Timestamp | null
  lastActiveAt: Timestamp | null
  prefs: {
    defaultWorkspaceId: string | null
    theme: 'dark' | 'light'
    notificationsRead: string[]
  }
}
