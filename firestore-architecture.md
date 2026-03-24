# EnvVault — Optimized Firestore Architecture

> High Performance · Low Queries · Minimal Storage

---

## Table of Contents

1. [Core Optimization Principles](#1-core-optimization-principles)
2. [Optimized Collection Structure](#2-optimized-collection-structure)
3. [Document Schemas](#3-document-schemas)
   - [3.1 Workspace Document](#31-workspace-document)
   - [3.2 Environment Document](#32-environment-document)
   - [3.3 Audit Log Document](#33-audit-log-document)
   - [3.4 Task Document](#34-task-document)
   - [3.5 Invite Document](#35-invite-document)
   - [3.6 User Document](#36-user-document)
   - [3.7 Platform Config Document](#37-platform-config-document)
4. [Read Pattern Optimization](#4-read-pattern-optimization)
5. [Write Pattern Optimization](#5-write-pattern-optimization)
6. [Caching Strategy](#6-caching-strategy)
7. [Firestore Indexes Required](#7-firestore-indexes-required)
8. [Optimized Security Rules](#8-optimized-security-rules)
9. [Storage Estimate](#9-storage-estimate)
10. [Daily Read Estimate](#10-daily-read-estimate)
11. [Complete Collection Overview](#11-complete-collection-overview)

---

## 1. Core Optimization Principles

### The Problem with the Original Structure

The original hierarchy was **5 levels deep**:

```
workspaces → projects → environments → servers/vars/urls
```

To load one environment panel the app made:

| Step | Operation | Reads |
|---|---|---|
| 1 | Workspace doc (membership check) | 1 |
| 2 | Project doc | 1 |
| 3 | Environment doc | 1 |
| 4 | All servers in environment | N |
| 5 | All vars in environment | N |
| 6 | All URLs in environment | N |
| + | Firestore rules `get()` on workspace for every subcollection read | N |

**Total: easily 50–200 reads just to open one environment.**

### The Optimized Solution

```
2 reads to open any environment, ever
  → 1 read: workspace doc (cached, never re-fetched)
  → 1 read: environment bundle doc (contains everything)
```

### 5 Principles Applied Throughout

#### Principle 1 — Denormalize Aggressively
Store data where it is **read**, not where it logically belongs. Duplicate small fields rather than doing join-style reads.

#### Principle 2 — Bundle Related Data into Single Documents
One environment document contains all its URLs, servers, and vars as arrays. **One read loads everything.**

#### Principle 3 — Cache Everything in localStorage
- First load reads from Firestore
- Every subsequent load reads from localStorage instantly
- Firestore `onSnapshot` updates cache in background

#### Principle 4 — Use Maps Instead of Arrays for Lookups
`memberRoles` as `{ uid: roleObject }` map instead of array. **O(1) lookup** vs O(n) array scan.

#### Principle 5 — Count Fields Instead of Collection Counts
Store `projectCount`, `memberCount` on workspace doc. Read the number directly — **never enumerate to count**.

---

## 2. Optimized Collection Structure

### Before (Original — 7 Collections, 5 Levels Deep)

```
workspaces/{wsId}
  projects/{projId}
    environments/{envId}
      urls/{urlId}           ← separate collection
      servers/{serverId}     ← separate collection
      vars/{varId}           ← separate collection
```

| Metric | Value |
|---|---|
| Reads to render one environment | 3–6 minimum |
| Firestore rules | `get()` called on workspace for every read |
| Total reads per page load | 50–200 |

### After (Optimized — 5 Flat Collections, 2 Levels Max)

```
workspaces/{wsId}            ← membership, plan, counts
environments/{envId}         ← urls + servers + vars bundled inside
auditLog/{entryId}           ← flat, workspace-scoped
tasks/{taskId}               ← flat, workspace-scoped
taskComments/{commentId}     ← flat, task-scoped
```

| Metric | Value |
|---|---|
| Reads to render one environment | **2 total** (workspace cached) |
| Firestore rules | Simple membership check only |
| Total reads per page load | **2–5** |

---

## 3. Document Schemas

### 3.1 Workspace Document

**Collection:** `workspaces`  
**Document ID:** auto-generated

```json
{
  "name": "Acme Corp",
  "color": "#2563EB",
  "initials": "AC",

  "ownerId": "uid_abc123",

  "members": ["uid_abc123", "uid_xyz789"],

  "memberRoles": {
    "uid_abc123": {
      "name": "John Doe",
      "email": "john@acme.com",
      "role": "OWNER",
      "joinedAt": "2026-01-01T00:00:00.000Z",
      "photoURL": "https://..."
    },
    "uid_xyz789": {
      "name": "Jane Smith",
      "email": "jane@acme.com",
      "role": "MEMBER",
      "joinedAt": "2026-01-15T00:00:00.000Z",
      "photoURL": null
    }
  },

  "projectTree": [
    {
      "id": "proj_001",
      "name": "Backend API",
      "order": 0,
      "environments": [
        { "id": "env_001", "name": "Development", "tag": "dev",  "color": "#3B82F6" },
        { "id": "env_002", "name": "Staging",     "tag": "stg",  "color": "#F59E0B" },
        { "id": "env_003", "name": "Production",  "tag": "prod", "color": "#EF4444" }
      ]
    },
    {
      "id": "proj_002",
      "name": "Frontend",
      "order": 1,
      "environments": [
        { "id": "env_004", "name": "Development", "tag": "dev",  "color": "#3B82F6" },
        { "id": "env_005", "name": "Production",  "tag": "prod", "color": "#EF4444" }
      ]
    }
  ],

  "counts": {
    "members": 2,
    "projects": 2,
    "environments": 5,
    "servers": 14,
    "vars": 42,
    "urls": 8,
    "activeTasks": 3,
    "auditEntries": 127
  },

  "plan": "starter",
  "limits": {
    "maxMembers": 10,
    "maxProjects": 20,
    "maxEnvironments": 999,
    "auditLogDays": 30,
    "maxActiveTasks": 999,
    "allowExport": false,
    "allowSlack": false
  },

  "customLimits": null,

  "stripeCustomerId": "cus_abc123",
  "stripeSubscriptionId": "sub_xyz789",
  "planStartedAt": "2026-01-01T00:00:00.000Z",
  "planExpiresAt": null,

  "suspended": false,
  "adminNotes": [],
  "activeBanner": null,

  "createdAt": "timestamp",
  "updatedAt": "timestamp",
  "lastActiveAt": "timestamp"
}
```

> **`members[]`** — Flat string array used **only** by Firestore security rules for `array-contains` queries. Never use for anything else.

> **`memberRoles{}`** — Map keyed by UID for O(1) role lookup. Use `memberRoles[uid].role` instead of `array.find()`.

> **`projectTree[]`** — Entire sidebar tree in **one field of one document**. Sidebar renders instantly — zero extra reads.

> **`limits{}`** — Stored directly on workspace. One read knows all limits. No extra `platformConfig` read needed.

#### Storage Estimate

| Component | Size |
|---|---|
| Base fields | ~300 bytes |
| memberRoles map | ~150 bytes per member |
| projectTree | ~100 bytes per project + ~60 bytes per env |
| counts object | ~80 bytes |
| limits object | ~120 bytes |

**Example** (2 projects, 5 envs, 5 members):
```
300 + (5×150) + (2×100) + (5×60) + 80 + 120 = ~1,550 bytes
```

vs original (same data, **8 separate reads** required):
```
workspace doc: ~300 bytes
+ 2 project docs: ~400 bytes
+ 5 env docs: ~750 bytes
= ~1,450 bytes total BUT 8 reads vs 1
```

---

### 3.2 Environment Document

**Collection:** `environments`  
**Document ID:** same as `envId` stored in `workspace.projectTree`

> **Key Design Decision:** All URLs, servers, and vars live **inside** the environment document as arrays. Loading an environment = **1 read, always**. The 1MB Firestore document limit is not a concern at your scale. (10 servers × 500 bytes + 50 vars × 200 bytes = ~15KB per env)

```json
{
  "id": "env_001",
  "wsId": "ws_abc",
  "projId": "proj_001",
  "wsName": "Acme Corp",
  "projName": "Backend API",
  "name": "Production",
  "tag": "prod",
  "color": "#EF4444",

  "urls": [
    {
      "id": "url_001",
      "label": "Admin Portal",
      "url": "https://admin.acme.com",
      "status": "active",
      "createdBy": "uid_abc123",
      "createdAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "id": "url_002",
      "label": "API Base",
      "url": "https://api.acme.com",
      "status": "active",
      "createdBy": "uid_abc123",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],

  "servers": [
    {
      "id": "srv_001",
      "name": "Primary Database",
      "host": "db.acme.com",
      "username": "admin",
      "password": "iv:base64ciphertext==",
      "introspection": "iv:base64ciphertext==",
      "createdBy": "uid_abc123",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],

  "vars": [
    {
      "id": "var_001",
      "key": "DATABASE_URL",
      "value": "iv:base64ciphertext==",
      "secret": true,
      "createdBy": "uid_abc123",
      "createdAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "id": "var_002",
      "key": "APP_ENV",
      "value": "production",
      "secret": false,
      "createdBy": "uid_abc123",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],

  "counts": {
    "urls": 2,
    "servers": 1,
    "vars": 2
  },

  "createdBy": "uid_abc123",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

#### Why Arrays Instead of Subcollections

| Approach | Reads | Notes |
|---|---|---|
| Subcollections | 1 read per document + 1 per collection | Many reads |
| Arrays in doc | **1 read loads everything** | Always |

At your scale (7 servers + 10 vars + 2 urls = **19 items per environment**):
- Document size: ~5–8 KB per environment
- Far under 1MB Firestore limit
- **Single read instead of 19+ reads**

Arrays become a problem **only** when:
- > 100 items in a single array
- > 100KB total document size
- You need to query individual items by field

---

### 3.3 Audit Log Document

**Collection:** `auditLog`  
**Document ID:** auto-generated

> **Optimization:** Flat collection (not subcollection of workspace). Flat collection with `wsId` field + Firestore index is faster and uses fewer rule evaluation reads.

```json
{
  "wsId": "ws_abc",
  "eventType": "secret.revealed",
  "actorUid": "uid_abc123",
  "actorName": "John Doe",
  "actorRole": "MEMBER",
  "targetType": "server",
  "targetId": "srv_001",
  "targetName": "Primary Database",
  "targetPath": "Acme Corp → Backend API → Production",
  "metadata": { "fieldName": "password" },
  "timestamp": "timestamp",
  "deleteAt": "timestamp"
}
```

#### TTL Auto-Deletion

Set `deleteAt` based on plan:

| Plan | Retention |
|---|---|
| Free | now + 7 days |
| Starter | now + 30 days |
| Team | now + 90 days |
| Business | now + 365 days |

**Enable TTL in Firebase Console:**
```
Firestore → Indexes → Single field → auditLog → deleteAt
Toggle: Enable TTL policy
```

> Firebase automatically deletes old entries. No Cloud Function needed. No manual cleanup. **Free.**

---

### 3.4 Task Document

**Collection:** `tasks`  
**Document ID:** auto-generated

> **Optimization:** Flat collection with `wsId` field. Comments embedded as array (not subcollection) for tasks with fewer than 20 comments.

```json
{
  "wsId": "ws_abc",
  "title": "Rotate production DB password",
  "description": "Due for Q1 security review",
  "status": "todo",
  "priority": "high",
  "assigneeUid": "uid_xyz789",
  "assigneeName": "Jane Smith",
  "createdBy": "uid_abc123",
  "createdByName": "John Doe",

  "linkedResource": {
    "type": "server",
    "id": "srv_001",
    "name": "Primary Database",
    "path": "Backend API → Production"
  },

  "tags": ["rotation", "security"],
  "dueDate": "timestamp",
  "completedAt": null,
  "completedBy": null,

  "comments": [
    {
      "id": "cmt_001",
      "authorUid": "uid_abc123",
      "authorName": "John",
      "authorRole": "OWNER",
      "body": "Assigned to Jane for this sprint",
      "createdAt": "2026-01-10T00:00:00.000Z"
    }
  ],
  "commentCount": 1,

  "deleteAt": "timestamp",

  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

> **`deleteAt`** — TTL field. Auto-deletes completed tasks after 90 days.

---

### 3.5 Invite Document

**Collection:** `invites`  
**Document ID:** auto-generated

```json
{
  "wsId": "ws_abc",
  "wsName": "Acme Corp",
  "wsColor": "#2563EB",
  "wsInitials": "AC",
  "role": "MEMBER",
  "createdBy": "uid_abc123",
  "createdByName": "John Doe",
  "email": null,
  "token": "Ax7kP2mQnRbVcDeFgH3jKL",
  "status": "pending",
  "expiresAt": "timestamp",
  "createdAt": "timestamp",
  "acceptedBy": null,
  "acceptedAt": null,
  "deleteAt": "timestamp"
}
```

> **`deleteAt`** — TTL field. Auto-deletes expired invites after 8 days (`expiresAt + 1 day`).

---

### 3.6 User Document

**Collection:** `users`  
**Document ID:** Firebase Auth UID

```json
{
  "isSuperAdmin": false,
  "suspended": false,
  "suspendedAt": null,
  "suspendedBy": null,
  "plan": "free",
  "createdAt": "timestamp",
  "lastActiveAt": "timestamp",

  "prefs": {
    "defaultWorkspaceId": "ws_abc",
    "theme": "dark",
    "notificationsRead": ["notif_001", "notif_002"]
  }
}
```

---

### 3.7 Platform Config Document

**Collection:** `platformConfig`  
**Document ID:** `plans` (single document, not a collection)

> **Optimization:** All plan configs in **one document**. App reads this once on load. Never needs to be re-read unless plan config changes.

```json
{
  "free": {
    "maxMembers": 3,
    "maxWorkspaces": 1,
    "maxProjects": 5,
    "maxEnvironments": 2,
    "auditLogDays": 7,
    "maxActiveTasks": 10,
    "allowExport": false,
    "allowSlack": false,
    "allowCLI": false,
    "allowSSO": false,
    "allowWebhooks": false
  },
  "starter": {
    "maxMembers": 10,
    "maxWorkspaces": 3,
    "maxProjects": 20,
    "maxEnvironments": 999,
    "auditLogDays": 30,
    "maxActiveTasks": 999,
    "allowExport": false,
    "allowSlack": false,
    "allowCLI": false,
    "allowSSO": false,
    "allowWebhooks": false
  },
  "team": {
    "maxMembers": 25,
    "maxWorkspaces": 10,
    "maxProjects": 999,
    "maxEnvironments": 999,
    "auditLogDays": 90,
    "maxActiveTasks": 999,
    "allowExport": true,
    "allowSlack": true,
    "allowCLI": false,
    "allowSSO": false,
    "allowWebhooks": true
  },
  "business": {
    "maxMembers": 999,
    "maxWorkspaces": 999,
    "maxProjects": 999,
    "maxEnvironments": 999,
    "auditLogDays": 365,
    "maxActiveTasks": 999,
    "allowExport": true,
    "allowSlack": true,
    "allowCLI": true,
    "allowSSO": true,
    "allowWebhooks": true
  },
  "updatedAt": "timestamp",
  "updatedBy": "uid_admin"
}
```

---

## 4. Read Pattern Optimization

### 4.1 App Startup Sequence

#### Step 1 — Instant render from localStorage (0 reads)
```js
const cached = localStorage.getItem(`envvault_ws_${uid}`)
if (cached) renderSidebar(JSON.parse(cached))
// User sees sidebar instantly — before any network call
```

#### Step 2 — Single workspace read (1 read)
```js
const ws = await getDoc(doc(db, "workspaces", activeWsId))
// Contains: memberRoles, projectTree, counts, plan, limits
// Entire sidebar renders from this one document
localStorage.setItem(`envvault_ws_${uid}`, JSON.stringify(ws))
```

#### Step 3 — Subscribe to workspace changes (0 additional reads)
```js
onSnapshot(doc(db, "workspaces", wsId), (snap) => {
  updateLocalCache(snap.data())
  rerenderSidebar()
})
// Real-time updates from now on — no polling needed
```

#### Step 4 — Load active environment on demand (1 read)
```js
// Only when user clicks an environment
const env = await getDoc(doc(db, "environments", envId))
// Contains all URLs, servers, vars — everything renders
localStorage.setItem(`envvault_env_${envId}`, JSON.stringify(env))
```

| Metric | Value |
|---|---|
| Total reads on startup | **2 reads** (1 workspace + 1 environment) |
| Total reads on repeat visit | **0 reads** (served from localStorage) |

### 4.2 Read Count Comparison

| Action | Before | After | Savings |
|---|---|---|---|
| App startup | 50–200 | **2** | 99% |
| Open environment | 15–30 | **1** | 97% |
| Render sidebar | 8 | **0\*** | 100%\* |
| Check member role | 1 | **0\*** | 100%\* |
| Check plan limits | 1 | **0\*** | 100%\* |
| View audit log (page 1) | 20 | 20 | 0% |
| Open task board | 10–30 | **1** | 97% |
| Repeat visit (any page) | 50–200 | **0\*** | 100%\* |

> \* served from localStorage cache

---

## 5. Write Pattern Optimization

### 5.1 All Writes Use Atomic Batches

**Before** — 3 separate network round trips:
```js
addDoc(srvColl)             // 1 write
updateDoc(wsDoc, count++)   // 1 write
addDoc(auditLog)            // 1 write
// Total: 3 writes, 3 network round trips
```

**After** — 1 network round trip:
```js
const batch = writeBatch(db)

batch.update(envDoc, {
  servers: arrayUnion(newServer),
  "counts.servers": increment(1)
})
batch.update(wsDoc, {
  "counts.servers": increment(1),
  updatedAt: serverTimestamp()
})
batch.set(auditRef, auditEntry)

await batch.commit()
// Total: 3 writes, 1 network round trip
```

### 5.2 Update Arrays with arrayUnion / arrayRemove

```js
// Add URL to environment
await updateDoc(envRef, {
  urls: arrayUnion({
    id: newId(), label, url, status: "active",
    createdBy: uid, createdAt: new Date().toISOString()
  }),
  "counts.urls": increment(1),
  updatedAt: serverTimestamp()
})

// Remove URL from environment
await updateDoc(envRef, {
  urls: arrayRemove(existingUrlObject),
  "counts.urls": increment(-1),
  updatedAt: serverTimestamp()
})

// Update a URL (replace in array)
const batch = writeBatch(db)
batch.update(envRef, { urls: arrayRemove(oldUrl) })
batch.update(envRef, { urls: arrayUnion(updatedUrl) })
await batch.commit()
```

### 5.3 Update Member Roles with Map Dot Notation

```js
// Add member
await updateDoc(wsRef, {
  members: arrayUnion(uid),
  [`memberRoles.${uid}`]: {
    name, email, role, joinedAt: new Date().toISOString()
  },
  "counts.members": increment(1)
})

// Change role — single field update, does not rewrite full map
await updateDoc(wsRef, {
  [`memberRoles.${uid}.role`]: "OWNER"
})

// Remove member
await updateDoc(wsRef, {
  members:                arrayRemove(uid),
  [`memberRoles.${uid}`]: deleteField(),
  "counts.members":       increment(-1)
})
```

### 5.4 Update projectTree for Sidebar

```js
// Add project
await updateDoc(wsRef, {
  projectTree: arrayUnion({
    id: newProjId, name, order: projectTree.length,
    environments: []
  }),
  "counts.projects": increment(1)
})

// Add environment to project
const ws = await getDoc(wsRef)
const tree = ws.data().projectTree
const proj = tree.find(p => p.id === projId)
proj.environments.push({ id: newEnvId, name, tag, color })

await updateDoc(wsRef, {
  projectTree: tree,
  "counts.environments": increment(1)
})

// Also create the environment document
await setDoc(doc(db, "environments", newEnvId), newEnvDoc)
```

---

## 6. Caching Strategy

### Cache Keys and TTL

| Key | TTL | Content |
|---|---|---|
| `ev_user_{uid}` | session | user doc + isSuperAdmin |
| `ev_ws_{wsId}` | 1 hour | workspace doc (tree + members) |
| `ev_env_{envId}` | 30 min | environment doc (all resources) |
| `ev_tasks_{wsId}` | 15 min | task list for workspace |
| `ev_audit_{wsId}_{page}` | 5 min | audit log page |
| `ev_platform_plans` | 24 hours | plan config from platformConfig |
| `ev_active_ws_{uid}` | session | last active workspace ID |
| `ev_active_env_{uid}` | session | last active environment ID |

### Cache Helper

```js
const cache = {
  set: (key, data, ttlMinutes) => {
    localStorage.setItem(key, JSON.stringify({
      data,
      expiresAt: Date.now() + ttlMinutes * 60 * 1000
    }))
  },

  get: (key) => {
    const item = localStorage.getItem(key)
    if (!item) return null
    const { data, expiresAt } = JSON.parse(item)
    if (Date.now() > expiresAt) {
      localStorage.removeItem(key)
      return null
    }
    return data
  },

  invalidate: (key) => localStorage.removeItem(key),

  invalidatePattern: (prefix) => {
    Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .forEach(k => localStorage.removeItem(k))
  }
}
```

### Cache Invalidation Rules

| Trigger | Invalidate |
|---|---|
| Workspace updates | `ev_ws_{wsId}` |
| Environment updates | `ev_env_{envId}` |
| Member added/removed | `ev_ws_{wsId}` |
| Plan changes | `ev_ws_{wsId}` |
| Task updates | `ev_tasks_{wsId}` |
| Logout | All `ev_*` keys for user |

---

## 7. Firestore Indexes Required

Create these in **Firebase Console → Firestore → Indexes:**

| Collection | Fields | Order |
|---|---|---|
| `workspaces` | `members` (Array), `updatedAt` | Descending |
| `auditLog` | `wsId` (Asc), `timestamp` | Descending |
| `auditLog` | `wsId` (Asc), `actorUid`, `timestamp` | Descending |
| `auditLog` | `wsId` (Asc), `eventType`, `timestamp` | Descending |
| `auditLog` | `wsId` (Asc), `deleteAt` | Ascending (TTL) |
| `tasks` | `wsId` (Asc), `status`, `updatedAt` | Descending |
| `tasks` | `wsId` (Asc), `assigneeUid`, `status` | Ascending |
| `tasks` | `wsId` (Asc), `dueDate` | Ascending |
| `tasks` | `wsId` (Asc), `deleteAt` | Ascending (TTL) |
| `invites` | `token` (Asc), `status` | Ascending |
| `invites` | `wsId` (Asc), `status` | Ascending |
| `invites` | `deleteAt` | Ascending (TTL) |

### TTL Indexes

Go to **Firestore → Single Field Indexes** for each TTL field and enable the TTL policy. Firebase will auto-delete documents when `deleteAt` passes.

---

## 8. Optimized Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function getWs(wsId) {
      return get(/databases/$(database)/documents/workspaces/$(wsId)).data;
    }

    function isMember(wsId) {
      return isSignedIn()
        && request.auth.uid in getWs(wsId).members;
    }

    function isOwner(wsId) {
      return isSignedIn()
        && getWs(wsId).ownerId == request.auth.uid;
    }

    function isSuperAdmin() {
      return isSignedIn()
        && get(/databases/$(database)/documents/users/$(request.auth.uid))
             .data.isSuperAdmin == true;
    }

    // ── Workspaces ──────────────────────────────────────────────────
    match /workspaces/{wsId} {
      allow read:   if isSignedIn()
                    && request.auth.uid in resource.data.members
                    || isSuperAdmin();
      allow create: if isSignedIn()
                    && request.auth.uid == request.resource.data.ownerId
                    && request.auth.uid in request.resource.data.members;
      allow update: if isMember(wsId) || isSuperAdmin();
      allow delete: if isOwner(wsId)  || isSuperAdmin();
    }

    // ── Environments (flat collection) ──────────────────────────────
    match /environments/{envId} {
      allow read:   if isMember(resource.data.wsId) || isSuperAdmin();
      allow create: if isMember(request.resource.data.wsId);
      allow update: if isMember(resource.data.wsId);
      allow delete: if isMember(resource.data.wsId) || isSuperAdmin();
    }

    // ── Audit Log (flat collection, immutable) ──────────────────────
    match /auditLog/{entryId} {
      allow read:   if isMember(resource.data.wsId) || isSuperAdmin();
      allow create: if isMember(request.resource.data.wsId);
      allow update: if false;
      allow delete: if false;
    }

    // ── Tasks (flat collection) ─────────────────────────────────────
    match /tasks/{taskId} {
      allow read:   if isMember(resource.data.wsId) || isSuperAdmin();
      allow create: if isMember(request.resource.data.wsId);
      allow update: if isMember(resource.data.wsId);
      allow delete: if isMember(resource.data.wsId) || isSuperAdmin();
    }

    // ── Invites ─────────────────────────────────────────────────────
    match /invites/{inviteId} {
      allow read:   if isSignedIn();
      allow create: if isSignedIn()
                    && request.auth.uid == request.resource.data.createdBy
                    && isMember(request.resource.data.wsId);
      allow update: if isSignedIn() && (
                      isMember(resource.data.wsId)
                      || request.auth.uid == request.resource.data.acceptedBy
                    );
      allow delete: if isMember(resource.data.wsId) || isSuperAdmin();
    }

    // ── Users ───────────────────────────────────────────────────────
    match /users/{uid} {
      allow read:   if request.auth.uid == uid || isSuperAdmin();
      allow create: if isSignedIn() && request.auth.uid == uid;
      allow update: if isSuperAdmin();
      allow delete: if isSuperAdmin();
    }

    // ── Platform Config ─────────────────────────────────────────────
    match /platformConfig/{docId} {
      allow read:  if isSignedIn();
      allow write: if isSuperAdmin();
    }

    // ── Platform Audit Log (immutable) ──────────────────────────────
    match /platformAuditLog/{entryId} {
      allow read:   if isSuperAdmin();
      allow create: if isSuperAdmin();
      allow update: if false;
      allow delete: if false;
    }

    // ── Coupons ─────────────────────────────────────────────────────
    match /coupons/{couponId} {
      allow read:  if isSignedIn();
      allow write: if isSuperAdmin();
    }
  }
}
```

---

## 9. Storage Estimate

At your scale (2 workspaces, 15 users, 20 projects, 2 envs each):

| Collection | Docs | Size Each | Total |
|---|---|---|---|
| `workspaces` | 2 | ~3 KB | ~6 KB |
| `environments` | 40 | ~8 KB | ~320 KB |
| `auditLog` | ~500 | ~400 bytes | ~200 KB |
| `tasks` | ~50 | ~800 bytes | ~40 KB |
| `invites` | ~20 | ~300 bytes | ~6 KB |
| `users` | 15 | ~200 bytes | ~3 KB |
| `platformConfig` | 1 | ~500 bytes | ~0.5 KB |
| **TOTAL** | | | **~576 KB** |

| Metric | Value |
|---|---|
| Firebase free limit | 1,073,741 KB (1 GB) |
| Your usage | **0.054%** |
| Growth headroom | **1,850×** before hitting storage limits |

---

## 10. Daily Read Estimate

15 users, each opening the app once per day:

| Action | Reads | Frequency | Daily Total |
|---|---|---|---|
| App startup (cold) | 2 | once/user | 30 |
| Open environment | 1 | 3×/user | 45 |
| Real-time workspace sync | 0\* | always | 0 |
| Real-time env sync | 0\* | per open | 0 |
| Audit log page | 20 | 2×/day total | 40 |
| Task board | 1 | 3×/day total | 3 |
| Cache hits (repeat loads) | 0 | most loads | 0 |
| **TOTAL DAILY READS** | | | **~118** |

| Metric | Value |
|---|---|
| Firebase free limit | 50,000 / day |
| Your usage | **0.24%** |
| Activity headroom | **400×** more before hitting limits |

> \* `onSnapshot` fires on changes only. If nothing changes, **no reads are billed**. Reads are only billed when data is actually sent to the client.

---

## 11. Complete Collection Overview

| Collection | Purpose | TTL |
|---|---|---|
| `workspaces` | Core workspace data | Never |
| `environments` | Resources (urls + servers + vars) | Never |
| `auditLog` | Workspace activity log | Plan-based |
| `tasks` | Task board items | 90d after done |
| `invites` | Pending workspace invites | 8 days |
| `users` | Auth profile + admin flags | Never |
| `platformConfig` | Plan limits config | Never |
| `platformAuditLog` | Admin action log | Never |
| `coupons` | Discount codes | Never |

**Total: 9 collections**

- All flat — no subcollections
- Every read is O(1) — no collection group queries needed
- Was 7 nested collections before, now 9 flat collections with dramatically fewer reads

---

*EnvVault Firestore Architecture — v1.0 · 2026*
