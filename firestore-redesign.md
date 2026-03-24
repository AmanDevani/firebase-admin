# Firestore Architecture Redesign -- Read-Optimized

> Production-ready schema, read analysis, listener strategy, caching layer,
> indexes, security rules, and migration plan.

---

## Table of Contents

1. [Optimized Data Model](#1-optimized-data-model)
2. [Read Pattern Analysis](#2-read-pattern-analysis)
3. [Real-time Listener Strategy](#3-real-time-listener-strategy)
4. [Caching Strategy](#4-caching-strategy)
5. [Firestore Indexes](#5-firestore-indexes)
6. [Security Rules Skeleton](#6-security-rules-skeleton)
7. [Migration Path](#7-migration-path)

---

## 1. Optimized Data Model

### 1.1 Collection Overview (New)

| # | Collection Path | Purpose | Doc ID Strategy |
|---|----------------|---------|-----------------|
| 1 | `workspaces/{wsId}` | Workspace metadata, members, project tree | Auto-generated |
| 2 | `environments/{envId}` | Environment with **embedded** urls, servers, vars | Auto-generated |
| 3 | `inviteLinks/{token}` | Flat top-level; **token IS the document ID** | `crypto.randomUUID()` |
| 4 | `joinRequests/{autoId}` | Flat top-level with wsId field | Auto-generated |
| 5 | `auditLogs/{autoId}` | Flat with wsId field (unchanged) | Auto-generated |
| 6 | `tasks/{autoId}` | Flat with wsId field (unchanged) | Auto-generated |
| 7 | `users/{uid}` | User profile, prefs, superAdmin flag | Firebase Auth UID |
| 8 | `platformConfig/main` | Single doc with plan definitions | Fixed: `"main"` |

**Eliminated collections:**
- `environments/{envId}/urls` -- embedded in environment doc
- `environments/{envId}/servers` -- embedded in environment doc
- `environments/{envId}/vars` -- embedded in environment doc
- `workspaces/{wsId}/inviteLinks` -- moved to flat `inviteLinks`
- `workspaces/{wsId}/joinRequests` -- moved to flat `joinRequests`

---

### 1.2 Document Schemas

#### 1.2.1 `workspaces/{wsId}`

```typescript
interface Workspace {
  // Identity
  name: string                          // "Acme Corp"
  color: string                         // "#6366f1"
  initials: string                      // "AC"

  // Ownership
  ownerId: string                       // Firebase UID of creator

  // Members (array for array-contains queries)
  members: string[]                     // ["uid1", "uid2", ...]  max 100

  // Role map (keyed by UID)
  memberRoles: {
    [uid: string]: {
      name: string
      email: string
      role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'
      joinedAt: string                  // ISO 8601
      photoURL: string | null
    }
  }

  // Project tree (denormalized navigation structure)
  projectTree: Array<{
    id: string
    name: string
    order: number
    environments: Array<{
      id: string
      name: string
      isProd: boolean
      color: string
    }>
  }>

  // Aggregate counts (maintained via increment())
  counts: {
    members: number
    projects: number
    environments: number
    servers: number
    vars: number
    urls: number
    activeTasks: number
    auditEntries: number
  }

  // Plan & billing
  plan: 'free' | 'starter' | 'team' | 'business'
  limits: {
    maxMembers: number
    maxProjects: number
    maxEnvironments: number
    auditLogDays: number
    maxActiveTasks: number
    allowExport: boolean
    allowSlack: boolean
  }

  // Admin controls
  suspended: boolean
  adminNotes: string[]
  activeBanner: string | null

  // Stripe
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null

  // Timestamps
  createdAt: Timestamp
  updatedAt: Timestamp
  lastActiveAt: Timestamp
}
```

**Estimated size:** ~2-8 KB per workspace (100 members with roles ~ 5 KB for memberRoles, projectTree ~ 1-2 KB). Well within 1 MB.

**Indexes needed:**
- `members` (array-contains) + `name` (asc) -- for WorkspaceSwitcher query

---

#### 1.2.2 `environments/{envId}` -- Lightweight Doc + Subcollections

```typescript
interface Environment {
  // Parent references
  wsId: string
  projId: string
  wsName: string
  projName: string

  // Identity
  name: string
  isProd: boolean
  color: string

  // Metadata
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp

  // NO embedded arrays — urls/servers/vars stay as subcollections
  // NO counts — use getCountFromServer() aggregate queries instead
}
```

**Subcollections:**
- `environments/{envId}/urls`
- `environments/{envId}/servers`
- `environments/{envId}/vars`

**Why subcollections (not embedded):**
- Embedded arrays force a full download of all items on every read, even when showing only 20
- Subcollections allow cursor-based pagination (`limit(20)` + `startAfter()`) — only fetch what's visible
- `getCountFromServer()` returns counts as a cheap aggregate query with zero document reads
- Lazy load: only fetch the active tab's subcollection; other tabs load on demand

**Read pattern on panel open:**
1. `getDoc(environments/{envId})` — 1 doc read (metadata only)
2. `getCountFromServer(urls)` + `getCountFromServer(servers)` + `getCountFromServer(vars)` — 3 aggregate queries (no doc reads)
3. `getDocs(urls, limit(20))` — only when URLs tab is active

**Indexes needed:**
- `wsId` (asc) + `createdAt` (desc) — for listing environments in a workspace
- Each subcollection needs `createdAt` (asc) for pagination ordering

---

#### 1.2.3 `inviteLinks/{token}` -- Token as Document ID

```typescript
// Document ID = the invite token (crypto.randomUUID())
interface InviteLink {
  // Workspace reference
  wsId: string
  wsName: string
  wsColor: string
  wsInitials: string

  // Link config
  role: 'EDITOR' | 'VIEWER'
  createdBy: string                     // UID
  createdByName: string
  expiresAt: Timestamp | null
  active: boolean
  usageCount: number

  // Timestamps
  createdAt: Timestamp
}
```

**Estimated size:** ~500 bytes per link.

**Why token-as-doc-ID:** Looking up an invite link by token becomes `getDoc(doc(db, 'inviteLinks', token))` -- a single document read with zero query overhead. The current collectionGroup query scans indexes across all workspaces.

**Indexes needed:**
- `wsId` (asc) + `active` (asc) + `createdAt` (desc) -- for listing active links on the Members page

---

#### 1.2.4 `joinRequests/{autoId}` -- Flat Top-Level

```typescript
interface JoinRequest {
  // Workspace reference
  wsId: string
  wsName: string
  wsColor: string
  wsInitials: string

  // Link reference
  linkId: string                        // the token (inviteLinks doc ID)
  token: string                         // same value, for display

  // Requester
  userId: string
  userName: string
  userEmail: string
  userPhotoURL: string | null

  // Request details
  requestedRole: 'EDITOR' | 'VIEWER'
  status: 'pending' | 'approved' | 'rejected'

  // Resolution
  requestedAt: Timestamp
  resolvedAt: Timestamp | null
  resolvedBy: string | null
}
```

**Estimated size:** ~600 bytes per request.

**Indexes needed:**
- `wsId` (asc) + `status` (asc) -- for owner's pending request query
- `userId` (asc) + `wsId` (asc) + `status` (asc) -- for checking existing pending requests on join page

---

#### 1.2.5 `users/{uid}` -- Unchanged

```typescript
interface UserDoc {
  isSuperAdmin: boolean                 // true for platform superadmins
  suspended: boolean
  suspendedAt: Timestamp | null
  suspendedBy: string | null
  plan: 'free' | 'starter' | 'team' | 'business'
  createdAt: Timestamp
  lastActiveAt: Timestamp
  prefs: {
    defaultWorkspaceId: string | null
    theme: 'dark' | 'light'
    notificationsRead: string[]
  }
}
```

**Estimated size:** ~300 bytes.

---

#### 1.2.6 `platformConfig/main` -- Unchanged

```typescript
interface PlatformConfig {
  plans: {
    [planKey: string]: {
      maxMembers: number
      maxProjects: number
      maxEnvironments: number
      auditLogDays: number
      maxActiveTasks: number
      allowExport: boolean
      allowSlack: boolean
      price: number
    }
  }
  maintenanceMode: boolean
  featureFlags: Record<string, boolean>
  updatedAt: Timestamp
}
```

**Estimated size:** ~1-2 KB.

---

#### 1.2.7 `auditLogs/{autoId}` -- Unchanged

```typescript
interface AuditLog {
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
  timestamp: Timestamp
  deleteAt: Timestamp                   // for TTL policy
}
```

**Indexes needed:**
- `wsId` (asc) + `timestamp` (desc) -- for paginated audit log view

---

#### 1.2.8 `tasks/{autoId}` -- Unchanged

Remains flat with `wsId` field. Comments stay embedded as array.

---

## 2. Read Pattern Analysis

### 2.1 Per-Operation Breakdown

#### Load Workspace Sidebar (WorkspaceSwitcher)

| | Before | After |
|---|--------|-------|
| Operation | `onSnapshot` query: `workspaces where members array-contains uid, orderBy name` | Same query, **but shared via cache/context** so it fires once per session, not once per component mount |
| Reads | N workspaces (1 read each) -- typically 1-5 | Same N workspaces on initial load; **0 on subsequent page navigations** because the listener is shared |
| **Savings** | | **~66% fewer listener setups** (Header, WorkspaceSwitcher, and WorkspacePage all shared) |

#### Open Environment Panel (EnvironmentPanel)

| | Before | After |
|---|--------|-------|
| Step 1 | `onSnapshot` environment doc | `getDoc` environment doc (single fetch, not realtime) |
| Step 2 | `onSnapshot` `environments/{id}/urls` collection | **Eliminated** -- urls embedded in env doc |
| Step 3 | `onSnapshot` `environments/{id}/servers` collection | **Eliminated** -- servers embedded in env doc |
| Step 4 | `onSnapshot` `environments/{id}/vars` collection | **Eliminated** -- vars embedded in env doc |
| **Total reads** | 1 + N_urls + N_servers + N_vars (min 4 reads, realistically 10-50+) | **1 read** |
| **Active listeners** | 4 concurrent onSnapshot listeners | **0** (uses getDoc, not onSnapshot) |
| **Savings** | | **75-98% read reduction per environment view** |

**Example:** Environment with 10 urls, 5 servers, 20 vars:
- Before: 1 + 10 + 5 + 20 = **36 reads + 4 active listeners**
- After: **1 read + 0 listeners**

#### View Members Page

| | Before | After |
|---|--------|-------|
| Workspace doc | `onSnapshot` on workspace doc (separate from Header's listener) | Shared workspace listener (already active from sidebar) -- **0 additional reads** |
| Invite links | `onSnapshot` on `workspaces/{wsId}/inviteLinks where active==true` | `getDocs` on `inviteLinks where wsId==x and active==true` -- one-time fetch |
| Join requests (owner) | `onSnapshot` on `workspaces/{wsId}/joinRequests where status==pending` | `onSnapshot` on `joinRequests where wsId==x and status==pending` (kept realtime for owner notifications) |
| **Total reads** | 1 (ws) + L (links) + R (requests) + duplicate ws from Header | L (links, one-time) + R (requests, realtime) |
| **Savings** | | **~50% fewer reads** (eliminated duplicate ws read, links are one-time) |

#### View Header with Notifications

| | Before | After |
|---|--------|-------|
| Workspace doc | `useFirestoreDoc('workspaces', wsId)` -- **separate** onSnapshot from WorkspaceSwitcher and WorkspaceDetail | Shared workspace context -- **0 additional reads** |
| Join requests badge | `onSnapshot` on `workspaces/{wsId}/joinRequests where status==pending` | `onSnapshot` on `joinRequests where wsId==x and status==pending` (same listener as Members page if both mounted) |
| **Total reads** | 1 (ws, duplicate) + R (requests) | R (requests only, ws is shared) |
| **Savings** | | **Eliminates 1 duplicate ws read per page load** |

#### Click an Invite Link (JoinWorkspace page)

| | Before | After |
|---|--------|-------|
| Find invite link | `collectionGroup('inviteLinks').where('token', ==, token)` -- scans all subcollections, **requires composite index across all workspaces** | `getDoc(doc(db, 'inviteLinks', token))` -- **single document read by ID** |
| Check membership | `getDoc` on workspace doc | `getDoc` on workspace doc (unchanged) |
| Check existing request | `getDocs` on `workspaces/{wsId}/joinRequests where userId==uid and status==pending` | `getDocs` on `joinRequests where userId==uid and wsId==x and status==pending` |
| **Total reads** | 1 (collectionGroup, expensive) + 1 (ws) + 0-1 (request check) = 2-3 | 1 (direct getDoc) + 1 (ws) + 0-1 (request check) = 2-3 |
| **Savings** | | **Same count but collectionGroup query eliminated** -- faster, cheaper, no cross-workspace index needed |

#### Accept/Reject Join Request (Owner Only)

| | Before | After |
|---|--------|-------|
| Update join request | `updateDoc` on `workspaces/{wsId}/joinRequests/{reqId}` | `updateDoc` on `joinRequests/{reqId}` |
| Update workspace members (on approve) | `updateDoc` on `workspaces/{wsId}` | Same |
| **Reads** | 0 (writes only) | 0 (writes only) |
| **Savings** | | Path is simpler; no subcollection traversal in security rules |

#### Delete Workspace

| | Before | After |
|---|--------|-------|
| Step 1 | Read ALL urls, servers, vars subcollection docs across ALL environments (`getDocs` x 3 per env) | **0 subcollection reads** -- resources are embedded in env docs |
| Step 2 | Read all audit logs by wsId | Read all audit logs by wsId (unchanged) |
| Step 3 | Read all invitations by wsId | Read all inviteLinks by wsId (flat collection) |
| Step 4 | Read all joinRequests by wsId | Read all joinRequests by wsId (flat collection) |
| Step 5 | Delete all collected refs in batches | Delete env docs, audit logs, links, requests, projects, ws doc |
| **Reads** | For ws with 5 envs, each with 10 urls + 5 servers + 20 vars: 5*3 getDocs = **15 collection reads + 175 doc reads** + audit + invites | **5 env doc deletes** (no reads needed for embedded data) + audit + links + requests |
| **Savings** | | **~90% fewer reads on deletion** -- no subcollection enumeration needed |

#### SuperAdmin Dashboard

| | Before | After |
|---|--------|-------|
| All workspaces | Collection query on `workspaces` | Same |
| All users | Collection query on `users` | Same |
| Platform config | `getDoc` on `platformConfig/main` | Same, **with localStorage cache** |
| **Savings** | | Caching of platformConfig saves repeated reads |

---

### 2.2 Summary Table

| Operation | Before (reads) | After (reads) | Reduction |
|-----------|---------------|---------------|-----------|
| Load sidebar | N workspaces | N (first load), 0 (cached) | ~66% |
| Open environment (10u/5s/20v) | 36 | 1 | **97%** |
| Open environment (min) | 4 | 1 | **75%** |
| View members page | 1 + L + R + 1(dup) | L + R | ~33% |
| Header notifications | 1(dup) + R | R | ~50% |
| Click invite link | 2-3 (collectionGroup) | 2-3 (direct read) | same count, vastly cheaper |
| Delete workspace (5 envs, 35 resources each) | ~190 | ~10 | **95%** |

---

## 3. Real-time Listener Strategy

### 3.1 Listener Matrix

| Data | Method | Realtime? | Justification |
|------|--------|-----------|---------------|
| Workspace list (sidebar) | `onSnapshot` query, **shared context** | YES | User needs to see new workspaces appear. Single shared listener eliminates 3x duplication. |
| Active workspace doc | Shared from workspace list listener | YES | Already covered by the list listener -- no additional subscription. |
| Environment doc | `getDoc` (one-time) | NO | Environment data (urls, servers, vars) changes infrequently. User triggers refresh after edits. Use stale-while-revalidate pattern. |
| Invite links (Members page) | `getDocs` (one-time) | NO | Links list changes rarely. Refresh after create/deactivate. |
| Join requests (owner) | `onSnapshot` query | YES | Owner must see new requests immediately for the notification bell badge. |
| Audit logs | `getDocs` with pagination | NO | Historical data. No need for realtime. |
| Tasks | `getDocs` with pagination | NO | Task list changes infrequently. Refresh on demand. |
| User doc | `onSnapshot` | YES | Suspension status, prefs must be reactive. |
| Platform config | `getDoc` with localStorage cache | NO | Changes extremely rarely. 24-hour TTL cache. |

### 3.2 Shared Workspace Context

The single largest read waste in the current codebase is that `WorkspaceSwitcher`, `Header`, and `WorkspaceDetail` each independently subscribe to the workspace doc via `useFirestoreDoc`. This means every page with a workspace context creates 2-3 redundant `onSnapshot` listeners on the same document.

**Solution:** Create a `WorkspaceProvider` React context that:
1. Maintains ONE `onSnapshot` listener on the workspaces query (`where members array-contains uid`)
2. Exposes `workspaces[]`, `activeWorkspace`, `loading`, `error` to all consumers
3. All three components (`WorkspaceSwitcher`, `Header`, `WorkspaceDetail`) consume from this context instead of creating their own listeners

```typescript
// src/context/WorkspaceContext.tsx (conceptual)

interface WorkspaceContextValue {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  loading: boolean
  error: string | null
}

// Single onSnapshot listener, shared across all consumers
// Eliminates 2-3 duplicate listeners per page load
```

### 3.3 Environment Refresh Pattern

Since environment docs are now fetched with `getDoc` instead of `onSnapshot`, the UI needs a way to show fresh data after mutations.

**Pattern: Optimistic update + manual refetch**

```typescript
// After adding a URL to environment:
// 1. Optimistically append to local state
// 2. Write to Firestore
// 3. On success: refetch env doc to confirm
// 4. On failure: rollback local state

async function addUrl(envId: string, urlData: UrlInput) {
  // Optimistic: update local state immediately
  setEnv(prev => ({
    ...prev,
    urls: [...prev.urls, { id: newId, ...urlData }]
  }))

  try {
    await updateDoc(doc(db, 'environments', envId), {
      urls: arrayUnion({ id: newId, ...urlData }),
      'counts.urls': increment(1),
      updatedAt: serverTimestamp()
    })
  } catch {
    // Rollback on failure
    refreshEnv()
  }
}
```

---

## 4. Caching Strategy

### 4.1 Cache Layer Design

```typescript
// src/lib/cache.ts

interface CacheEntry<T> {
  data: T
  timestamp: number      // Date.now() when cached
  version: number        // monotonic version for invalidation
}

const CACHE_CONFIG = {
  workspace:      { prefix: 'ws',    ttl: 5 * 60 * 1000  },  // 5 minutes
  environment:    { prefix: 'env',   ttl: 2 * 60 * 1000  },  // 2 minutes
  platformConfig: { prefix: 'pconf', ttl: 24 * 60 * 60 * 1000 },  // 24 hours
  userDoc:        { prefix: 'user',  ttl: 10 * 60 * 1000 },  // 10 minutes
} as const
```

### 4.2 Cache Key Format

| Data Type | Key Format | Example |
|-----------|-----------|---------|
| Workspace doc | `ws:{wsId}` | `ws:abc123def456` |
| Workspace list for user | `ws:list:{uid}` | `ws:list:user789` |
| Environment doc | `env:{envId}` | `env:env456` |
| Platform config | `pconf:main` | `pconf:main` |
| User doc | `user:{uid}` | `user:user789` |

### 4.3 TTL Per Data Type

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Workspace doc | 5 minutes | Members and roles change occasionally. The realtime listener updates the in-memory state anyway; cache serves as warm start on page reload. |
| Environment doc | 2 minutes | Resources (urls, servers, vars) change during active editing. Short TTL balances freshness vs. reads. |
| Platform config | 24 hours | Plan definitions change extremely rarely. Manual cache bust on deploy. |
| User doc | 10 minutes | Prefs and suspension status. Realtime listener keeps it current; cache is for initial load speed. |

### 4.4 Cache Invalidation Triggers

| Trigger | Cache Keys Invalidated |
|---------|----------------------|
| User adds/edits/deletes a url, server, or var | `env:{envId}` |
| User creates/deletes environment | `env:{envId}`, `ws:{wsId}` (projectTree changed) |
| User creates/deletes project | `ws:{wsId}` |
| Member added/removed/role changed | `ws:{wsId}` |
| User updates workspace settings | `ws:{wsId}` |
| Workspace plan upgraded | `ws:{wsId}` |
| SuperAdmin updates platform config | `pconf:main` |
| User updates profile prefs | `user:{uid}` |
| Logout | Clear all cache entries |

### 4.5 Implementation

```typescript
// Read-through cache for getDoc calls
async function getCachedDoc<T>(
  collectionName: string,
  docId: string,
  cacheConfig: { prefix: string; ttl: number }
): Promise<T> {
  const cacheKey = `${cacheConfig.prefix}:${docId}`
  const cached = localStorage.getItem(cacheKey)

  if (cached) {
    const entry: CacheEntry<T> = JSON.parse(cached)
    if (Date.now() - entry.timestamp < cacheConfig.ttl) {
      return entry.data  // cache hit
    }
  }

  // Cache miss or expired: fetch from Firestore
  const snap = await getDoc(doc(db, collectionName, docId))
  const data = { id: snap.id, ...snap.data() } as T

  localStorage.setItem(cacheKey, JSON.stringify({
    data,
    timestamp: Date.now(),
    version: 1
  }))

  return data
}

// Invalidation helper
function invalidateCache(prefix: string, id: string) {
  localStorage.removeItem(`${prefix}:${id}`)
}
```

---

## 5. Firestore Indexes

### 5.1 `firestore.indexes.json`

```json
{
  "indexes": [
    {
      "collectionGroup": "workspaces",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "members", "arrayConfig": "CONTAINS" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "environments",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "wsId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "inviteLinks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "wsId", "order": "ASCENDING" },
        { "fieldPath": "active", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "joinRequests",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "wsId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "joinRequests",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "wsId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "auditLogs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "wsId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "tasks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "wsId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

### 5.2 Index Justification

| Index | Used By | Query |
|-------|---------|-------|
| workspaces: members + name | WorkspaceSwitcher | `where('members', 'array-contains', uid) orderBy('name')` |
| environments: wsId + createdAt | Environment listing (if needed) | `where('wsId', '==', x) orderBy('createdAt', 'desc')` |
| inviteLinks: wsId + active + createdAt | Members page invite list | `where('wsId', '==', x).where('active', '==', true) orderBy('createdAt', 'desc')` |
| joinRequests: wsId + status | Owner notification bell + Members page | `where('wsId', '==', x).where('status', '==', 'pending')` |
| joinRequests: userId + wsId + status | JoinWorkspace duplicate check | `where('userId', '==', uid).where('wsId', '==', x).where('status', '==', 'pending')` |
| auditLogs: wsId + timestamp | Audit log page (paginated) | `where('wsId', '==', x) orderBy('timestamp', 'desc')` |
| tasks: wsId + createdAt | Tasks page (paginated) | `where('wsId', '==', x) orderBy('createdAt', 'desc')` |

**Removed indexes:**
- No more `collectionGroup` index on `inviteLinks.token` -- token is now the document ID, so lookup is a direct `getDoc`.

---

## 6. Security Rules Skeleton

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ─── Helper Functions ─────────────────────────────────────────────

    // Check if user is a platform superadmin (costs 1 read, cached per request)
    function isSuperAdmin() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isSuperAdmin == true;
    }

    // Get workspace doc (costs 1 read, cached per request for same path)
    function getWorkspace(wsId) {
      return get(/databases/$(database)/documents/workspaces/$(wsId)).data;
    }

    // Check if user is a member of workspace
    function isMember(wsId) {
      return request.auth.uid in getWorkspace(wsId).members;
    }

    // Get user's role in workspace
    function getRole(wsId) {
      return getWorkspace(wsId).memberRoles[request.auth.uid].role;
    }

    // Check if user is the workspace owner
    function isOwner(wsId) {
      return getWorkspace(wsId).ownerId == request.auth.uid;
    }

    // Check if user can edit (OWNER, ADMIN, or EDITOR)
    function canEdit(wsId) {
      let role = getRole(wsId);
      return role == 'OWNER' || role == 'ADMIN' || role == 'EDITOR';
    }

    // Check if user can manage (OWNER or ADMIN)
    function canManage(wsId) {
      let role = getRole(wsId);
      return role == 'OWNER' || role == 'ADMIN';
    }

    // ─── Users ────────────────────────────────────────────────────────

    match /users/{uid} {
      allow read: if request.auth.uid == uid || isSuperAdmin();
      allow create: if request.auth.uid == uid;
      allow update: if request.auth.uid == uid || isSuperAdmin();
      // Users cannot delete their own user doc
      allow delete: if isSuperAdmin();
    }

    // ─── Platform Config ──────────────────────────────────────────────

    match /platformConfig/{docId} {
      allow read: if request.auth != null;
      allow write: if isSuperAdmin();
    }

    // ─── Workspaces ───────────────────────────────────────────────────

    match /workspaces/{wsId} {
      // Any authenticated member can read their workspace
      allow read: if request.auth != null
                  && (request.auth.uid in resource.data.members || isSuperAdmin());

      // Any authenticated user can create a workspace (they become OWNER)
      allow create: if request.auth != null
                    && request.resource.data.ownerId == request.auth.uid
                    && request.auth.uid in request.resource.data.members;

      // OWNER and ADMIN can update workspace
      // Only OWNER can modify ownerId, or delete
      allow update: if request.auth != null
                    && (canManage(wsId) || isSuperAdmin())
                    // Prevent non-owners from changing ownership
                    && (isOwner(wsId) || isSuperAdmin()
                        || request.resource.data.ownerId == resource.data.ownerId);

      allow delete: if request.auth != null
                    && (isOwner(wsId) || isSuperAdmin());
    }

    // ─── Environments ─────────────────────────────────────────────────

    match /environments/{envId} {
      // Members can read environments in their workspace
      allow read: if request.auth != null
                  && (isMember(resource.data.wsId) || isSuperAdmin());

      // Editors+ can create environments
      allow create: if request.auth != null
                    && (canEdit(request.resource.data.wsId) || isSuperAdmin());

      // Editors+ can update environments (includes adding/editing urls, servers, vars)
      allow update: if request.auth != null
                    && (canEdit(resource.data.wsId) || isSuperAdmin());

      // Only OWNER or ADMIN can delete environments
      allow delete: if request.auth != null
                    && (canManage(resource.data.wsId) || isSuperAdmin());
    }

    // ─── Invite Links (flat, token = doc ID) ──────────────────────────

    match /inviteLinks/{token} {
      // Anyone authenticated can read an invite link (needed for join page)
      allow read: if request.auth != null;

      // Only OWNER can create invite links
      // (Current code: owners only create links; admins cannot)
      allow create: if request.auth != null
                    && isOwner(request.resource.data.wsId);

      // Only OWNER can deactivate links
      allow update: if request.auth != null
                    && (isOwner(resource.data.wsId) || isSuperAdmin());

      // Only OWNER can delete links
      allow delete: if request.auth != null
                    && (isOwner(resource.data.wsId) || isSuperAdmin());
    }

    // ─── Join Requests (flat) ─────────────────────────────────────────

    match /joinRequests/{reqId} {
      // Workspace owner can read join requests for their workspace
      // The requester can read their own request
      allow read: if request.auth != null
                  && (isOwner(resource.data.wsId)
                      || resource.data.userId == request.auth.uid
                      || isSuperAdmin());

      // Any authenticated user can create a join request
      allow create: if request.auth != null
                    && request.resource.data.userId == request.auth.uid
                    && request.resource.data.status == 'pending';

      // Only OWNER can approve/reject (NOT admins)
      allow update: if request.auth != null
                    && (isOwner(resource.data.wsId) || isSuperAdmin());

      // Only OWNER or superadmin can delete
      allow delete: if request.auth != null
                    && (isOwner(resource.data.wsId) || isSuperAdmin());
    }

    // ─── Audit Logs ───────────────────────────────────────────────────

    match /auditLogs/{logId} {
      // Members can read audit logs for their workspace
      allow read: if request.auth != null
                  && (isMember(resource.data.wsId) || isSuperAdmin());

      // Only system (admin SDK) or superadmin should create audit logs
      // Client-side writes allowed for ADMIN+ to support client-generated logs
      allow create: if request.auth != null
                    && (canManage(request.resource.data.wsId) || isSuperAdmin());

      allow update: if false;  // Audit logs are immutable
      allow delete: if isSuperAdmin();
    }

    // ─── Tasks ────────────────────────────────────────────────────────

    match /tasks/{taskId} {
      allow read: if request.auth != null
                  && (isMember(resource.data.wsId) || isSuperAdmin());

      allow create: if request.auth != null
                    && (canEdit(request.resource.data.wsId) || isSuperAdmin());

      allow update: if request.auth != null
                    && (canEdit(resource.data.wsId) || isSuperAdmin());

      allow delete: if request.auth != null
                    && (canManage(resource.data.wsId) || isSuperAdmin());
    }
  }
}
```

### 6.1 Security Rules Read Cost Notes

- `isSuperAdmin()` costs 1 read per evaluation per request. Firestore caches `get()` calls within the same request, so multiple calls to `isSuperAdmin()` in the same rule evaluation cost only 1 read.
- `getWorkspace(wsId)` costs 1 read per unique wsId per request. The functions `isMember()`, `getRole()`, `isOwner()`, `canEdit()`, and `canManage()` all call `getWorkspace()` with the same wsId, so they share the cached result.
- Total security-rule reads per operation: typically **1 read** (workspace doc) for member operations, or **2 reads** (user doc + workspace doc) for superAdmin fallback paths.

---

## 7. Migration Path

### 7.1 Phase 1: Deploy New Collections (Non-Breaking)

No existing data is modified. New code can coexist with old code.

1. **Create `inviteLinks` flat collection** by copying data from all `workspaces/{wsId}/inviteLinks` subcollections.
   - For each existing invite link, write to `inviteLinks/{token}` using the token value as the new document ID.
   - Copy all fields as-is.
   - This is additive -- the old subcollection still exists.

2. **Create `joinRequests` flat collection** by copying data from all `workspaces/{wsId}/joinRequests` subcollections.
   - Write to `joinRequests/{autoId}` with all existing fields (wsId is already present).
   - This is additive.

3. **Deploy new Firestore indexes** (`firestore.indexes.json`).
   - Indexes build asynchronously. Deploy them before switching code to use new queries.

4. **Deploy new security rules** (with rules that allow both old and new paths during migration).

### 7.2 Phase 2: Embed Resources into Environment Docs (Non-Breaking)

1. **Migration script** (run via Admin SDK or Cloud Function):
   - For each `environments/{envId}` doc:
     - Read all docs from `environments/{envId}/urls`
     - Read all docs from `environments/{envId}/servers`
     - Read all docs from `environments/{envId}/vars`
     - Write embedded arrays (`urls`, `servers`, `vars`) into the environment doc
   - This is additive -- subcollections still exist.

2. **Deploy code that reads from embedded arrays** instead of subcollections.
   - The `EnvironmentPanel` component switches from 4 queries to 1 `getDoc`.
   - Write operations update the embedded array in the environment doc.

### 7.3 Phase 3: Switch Client Code (Breaking for old clients)

1. **Deploy `WorkspaceProvider` context** to share the workspace listener.
   - Remove individual `useFirestoreDoc('workspaces', wsId)` calls from Header, WorkspaceSwitcher.
   - All components consume from shared context.

2. **Switch JoinWorkspace page** to use `getDoc(doc(db, 'inviteLinks', token))` instead of `collectionGroup` query.

3. **Switch Members page** invite links to query flat `inviteLinks` collection.

4. **Switch Header notification bell** to query flat `joinRequests` collection.

5. **Switch all create/update/delete operations** for invite links and join requests to use new flat collection paths.

6. **Deploy caching layer** (`src/lib/cache.ts`).

7. **Switch EnvironmentPanel** to use `getDoc` instead of `onSnapshot` for environment data.

### 7.4 Phase 4: Cleanup (Non-Breaking)

1. **Delete old subcollection data** (can be deferred):
   - `environments/{envId}/urls/*`
   - `environments/{envId}/servers/*`
   - `environments/{envId}/vars/*`
   - `workspaces/{wsId}/inviteLinks/*`
   - `workspaces/{wsId}/joinRequests/*`

2. **Remove old collectionGroup index** on `inviteLinks.token`.

3. **Remove old security rules** for subcollection paths.

4. **Remove old code paths** that read from subcollections.

### 7.5 Rollback Plan

- Phases 1 and 2 are fully non-breaking. If issues arise, simply revert the client code and the old paths still work.
- Phase 3 is breaking for the client but not for data. Rolling back the client deploy restores the old behavior since subcollection data still exists until Phase 4.
- Phase 4 is the point of no return. Only proceed after confirming Phase 3 is stable for at least 1 week.

### 7.6 Migration Script Pseudocode

```typescript
// Run via Firebase Admin SDK (Node.js script or Cloud Function)

async function migrateEnvironmentResources() {
  const envSnap = await admin.firestore().collection('environments').get()

  for (const envDoc of envSnap.docs) {
    const envId = envDoc.id

    // Read subcollections
    const [urlsSnap, serversSnap, varsSnap] = await Promise.all([
      admin.firestore().collection(`environments/${envId}/urls`).get(),
      admin.firestore().collection(`environments/${envId}/servers`).get(),
      admin.firestore().collection(`environments/${envId}/vars`).get(),
    ])

    const urls = urlsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const servers = serversSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const vars = varsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    // Write embedded arrays
    await admin.firestore().doc(`environments/${envId}`).update({
      urls,
      servers,
      vars,
    })

    console.log(`Migrated ${envId}: ${urls.length} urls, ${servers.length} servers, ${vars.length} vars`)
  }
}

async function migrateInviteLinks() {
  const wsSnap = await admin.firestore().collection('workspaces').get()

  for (const wsDoc of wsSnap.docs) {
    const linksSnap = await admin.firestore()
      .collection(`workspaces/${wsDoc.id}/inviteLinks`).get()

    for (const linkDoc of linksSnap.docs) {
      const data = linkDoc.data()
      const token = data.token

      // Write to flat collection with token as doc ID
      await admin.firestore().doc(`inviteLinks/${token}`).set(data)
    }
  }
}

async function migrateJoinRequests() {
  const wsSnap = await admin.firestore().collection('workspaces').get()

  for (const wsDoc of wsSnap.docs) {
    const reqSnap = await admin.firestore()
      .collection(`workspaces/${wsDoc.id}/joinRequests`).get()

    for (const reqDoc of reqSnap.docs) {
      // Write to flat collection, preserving original auto-ID
      await admin.firestore().doc(`joinRequests/${reqDoc.id}`).set(reqDoc.data())
    }
  }
}
```

---

## Appendix: Quick Reference Card

### Reads Per Operation (New Architecture)

| Operation | Firestore Reads | Active Listeners |
|-----------|----------------|-----------------|
| App init (login + sidebar load) | N workspaces + 1 user doc | 2 (ws query + user doc) |
| Navigate to workspace | 0 (from shared context) | 0 new |
| Open environment panel | 1 (env doc getDoc) | 0 |
| Switch environment tab | 0 (data already in env doc) | 0 |
| Add/edit/delete resource | 0 reads, 1 write | 0 |
| Open members page | L links (getDocs) | 0 new (join requests listener already active for owner) |
| Click invite link | 1 (getDoc by token) + 1 (ws membership check) | 0 |
| Delete workspace | E env docs + A audit + L links + R requests (getDocs for deletion) | 0 |
| Load platform config | 0 (cached) or 1 (cache miss) | 0 |
