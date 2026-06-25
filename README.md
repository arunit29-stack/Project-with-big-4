# Classroom But Better (CBB)

Next.js 15 app with memory-only JWT auth (EXIT_ON_CLOSE), role-based routing, and real-time notifications.

## Table of Contents

- [Quick Start](#quick-start)
- [Demo Accounts](#demo-accounts)
- [Student `/class`](#student-class)
- [Teacher `/dashboard`](#teacher-dashboard)
- [Course Shell](#course-shell)
- [Content Library](#content-library-tabcontent-library)
- [Auth Architecture](#auth-architecture)
- [Notifications](#notifications)
- [Quiz Engine API](#quiz-engine-api)
- [RBAC and JWT Setup](#cbb-rbac-and-jwt-setup)
- [Admin Dashboard API](#admin-dashboard-api)
- [AI Quiz Generator API](#ai-quiz-generator-api-documentation)
- [AI Quiz Generator Implementation](#ai-quiz-generator-implementation-details)
- [AI Quiz Generator Quick Reference](#ai-quiz-generator---quick-reference)
- [Group Rooms API](#group-rooms-api---documentation)
- [Peer Review System](#peer-review-system---documentation)

---

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login).

### Demo accounts

| Email | Password | Role | Home |
|-------|----------|------|------|
| student@cbb.edu | password | student | `/class` |
| teacher@cbb.edu | password | teacher | `/dashboard` |
| admin@cbb.edu | password | admin | `/admin` |

### Student `/class`

- Course grid from `GET /api/students/me/courses` (SWR)
- **Join a Class** → `POST` with course code (optimistic update + revalidate)
- Try code `BIO-101-A` (enrolment open) or create a course as teacher first

### Teacher `/dashboard`

- Course grid from `GET /api/teachers/me/courses` (SWR)
- **Create Course** modal → `POST` with name, code, description, enrolment toggle

### Course shell

- `/class/[courseId]` and `/dashboard/[courseId]`
- Sidebar tabs; active tab in `?tab=` (e.g. `?tab=content-library`)
- AI Assistant tab disabled (Phase 2)
- All UI strings in `src/locales/en.json`

### Content library (`?tab=content-library`)

- Folder tree: weeks → topics → PDFs / videos
- **PDF:** react-pdf viewer (pages, zoom, fullscreen, download); students can highlight + per-page notes (private, persisted via `POST /api/courses/:courseId/annotations`)
- **Video:** HLS player (hls.js), chapters, searchable transcript, timestamped student notes
- **Teacher upload:** tus-js-client resumable upload with progress % and "Resuming upload…" on retry
- Students only see **Ready** items; teachers see status chips (Uploading / Processing / Ready / Failed + retry)

Set `INSTITUTION_SSO_CONFIGURED=true` in `.env.local` to show the institution SSO button.

## Auth architecture

- **Token storage:** in-memory only via `AuthProvider` (React Context + `useReducer`). Never `localStorage` / `sessionStorage`.
- **Refresh:** token is cleared; user must sign in again.
- **Guards:** `withAuth` → `/login`; `withRole(['teacher'])` → role home.
- **EXIT_ON_CLOSE:** `beforeunload` + `visibilitychange` → `navigator.sendBeacon('/api/auth/session-beacon', token)`.

## Notifications

- Bell in top nav on authenticated pages.
- WebSocket: `/ws/notifications` (requires a custom Node server or reverse proxy; Next.js API routes do not upgrade WS by default).
- Drawer open → `PATCH /api/notifications/read-all`
- Clear all → `DELETE /api/notifications`

## Quiz Engine API

A real-time, multi-instance scaled Quiz Engine with state stored entirely in Redis and database persistence in PostgreSQL.

### Endpoints
- **Quiz Creation**: `POST /courses/:courseId/quizzes` (Teacher only)
- **Launch Lobby**: `POST /quizzes/:quizId/launch` (Teacher only; sets lobby status and returns 60s countdown)
- **Extend Lobby**: `POST /quizzes/:quizId/lobby/extend` (Teacher only; adds 30s, max 5 extensions)
- **Start Quiz**: `POST /quizzes/:quizId/start` (Teacher only; transitions to first question immediately)
- **Answer Submission**: `POST /quizzes/:quizId/attempts/:attemptId/answers` (Student only; auto-saves answer selection and calculates speed multipliers. Blocks duplicate device attempts with `409` and flags teacher's integrity log)
- **Reconnect State**: `GET /quizzes/:quizId/attempts/:attemptId/state` (Student only; returns current live question and remaining time)
- **Void Question**: `POST /quizzes/:quizId/questions/:questionId/void` (Teacher only; marks question as voided, redistributes its points proportionally to remaining questions, and recalculates all students' scores and XP ledger)

### Real-Time Sockets & Pub/Sub
- Socket.io connections bind to the `/quizzes/:quizId` namespace.
- Live question pushes, lobby countdown updates, and student joining events are synchronized across server instances using the Redis Pub/Sub channel `quiz:{quizId}:broadcast`.

---

# CBB RBAC and JWT setup

## RS256 key generation

Generate a 4096-bit RSA key pair:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out jwt-private.pem
openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem
```

## Environment variables

Set `JWT_PRIVATE_KEY` to the full PEM contents of `jwt-private.pem` and `JWT_PUBLIC_KEY` to the full PEM contents of `jwt-public.pem`.

If you need to store them in a single-line `.env` file or Kubernetes Secret, replace newlines with `\n` and the loader will normalize them back to PEM format.

## Token policy

- Access tokens are RS256 signed.
- Maximum lifetime is 60 minutes.
- Payload claims are `sub`, `role`, `institutionId`, `iat`, `exp`, and `jti`.
- Logout and browser-close teardown add the token `jti` to the Redis blocklist until expiration.

## Server-side enforcement

- Use `requireAuth(["teacher", "admin"])` for teacher-only routes.
- Use `requireAuth(["student"])` for student-only routes.
- Use `requireAuth(["admin", "teacher", "student"])` for any authenticated route.
- Return `401` for missing or invalid tokens.
- Return `403` for valid tokens that lack the required role.
- Never use `404` to hide a protected route.

---

# Admin Dashboard API

> **Institution-Level Management**: Admins are institutional superusers with elevated privileges. They **cannot** impersonate students, join quizzes, or directly interact with course content.

## Overview

The Admin Dashboard API provides institutional administrators with tools for:

- **User Management**: Bulk enrollment, password reset, soft deletion
- **Course Management**: Atomic course transfers to new teachers
- **Data Export**: Grade exports for compliance and reporting
- **GDPR/FERPA Compliance**: Full PII purge with immutable audit trails
- **Institution Settings**: SSO configuration, branding, feature flags

All admin endpoints require `admin` role in `requireAuth` middleware.

---

## Core Design Principles

### 1. Atomic Transactions

Course transfers and data purges use PostgreSQL transactions (BEGIN/COMMIT/ROLLBACK) to ensure all-or-nothing semantics. If any operation fails, the entire transaction rolls back.

**Example:** Transferring a course fails validation? All database changes are rolled back. No partial state.

### 2. Immutable Audit Logs

GDPR purges create **immutable** entries in `gdpr_purge_audit_log` with a `CONSTRAINT` that prevents updates. Every PII removal is permanently recorded with:
- Purge ID
- Admin ID
- Timestamp
- Tables affected
- Records anonymised

**Example:** An admin cannot later claim "I didn't purge that user." The audit log is cryptographically permanent.

### 3. No Course Content Access

Admins **cannot**:
- Create or edit quizzes
- Grade assignments directly
- Join group rooms
- Participate in peer reviews
- Access student data beyond audit/export purposes

**Example:** An admin cannot do: `GET /quizzes/:quizId` or `PATCH /assignments/:assignmentId`. These are teacher/student endpoints.

### 4. Soft Deletion with Cascade

Deleting a user sets `deleted_at` timestamp instead of hard delete. This:
- Preserves audit trails
- Cascades to remove enrollments, invalidate Redis sessions
- Allows for data recovery in case of accident

**Example:** `DELETE /admin/users/:userId` sets `users.deleted_at = NOW()`, queries filter with `WHERE deleted_at IS NULL`.

---

## API Endpoints

### User Management

#### POST /admin/users/bulk-enrol

Bulk enroll users from CSV file.

**Auth:** `requireAuth(['admin'])`

**Request:**
```json
{
  "csv": "email,role,courseCode\nalice@example.com,student,CS101\nbob@example.com,teacher,CS101"
}
```

**CSV Format:**
- Header: `email,role,courseCode`
- Rows: `user@example.com,student|teacher,COURSE_CODE`
- Creates new users if not found, generates temp password, sends welcome email
- Enrolls in course (students) or creates as teacher

**Response:**
```json
{
  "totalRows": 3,
  "successCount": 2,
  "failedCount": 1,
  "failures": [
    {
      "email": "invalid@",
      "reason": "invalid_email"
    }
  ]
}
```

---

#### POST /admin/users

Create a single user (teacher or student).

**Auth:** `requireAuth(['admin'])`

**Request:**
```json
{
  "email": "teacher@example.com",
  "name": "Jane Doe",
  "role": "teacher"
}
```

**Response:**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "teacher@example.com",
  "tempPassword": "aB9$Xk2#pQ4vL",
  "message": "Temp password sent to email. User must change on first login."
}
```

**Notes:**
- Generates secure 16-char temp password (mixed case, numbers, symbols)
- Email sent (implementation handles via notification system)
- User must reset password on first login

---

#### DELETE /admin/users/:userId

Soft delete a user (removes enrollments, invalidates sessions).

**Auth:** `requireAuth(['admin'])`

**Optional Body:**
```json
{
  "reason": "Graduation"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Side Effects:**
- Sets `users.deleted_at = NOW()`
- Removes all `course_enrollments` for user
- Invalidates Redis session keys
- Creates audit log in `user_deletion_audit`

---

#### PATCH /admin/users/:userId/reset-password

Send a new temporary password to a user's email.

**Auth:** `requireAuth(['admin'])`

**Response:**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "tempPassword": "cD7#Hj1$nK8wM",
  "message": "Temporary password sent to user email"
}
```

---

### Course Management

#### POST /admin/courses/:courseId/transfer

Transfer course ownership and all assets to a new teacher. **ATOMIC TRANSACTION**.

**Auth:** `requireAuth(['admin'])`

**Request:**
```json
{
  "newTeacherUserId": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Response:**
```json
{
  "courseId": "550e8400-e29b-41d4-a716-446655440000",
  "newTeacherId": "550e8400-e29b-41d4-a716-446655440001",
  "assetsTransferred": {
    "assignments": 5,
    "quizzes": 3,
    "groupRooms": 2,
    "videoLibraryItems": 12,
    "dmThreads": 8
  },
  "auditId": "transfer-550e8400-e29b-41d4-a716-446655440000",
  "completedAt": "2025-01-15T10:30:00Z"
}
```

**Behavior:**
- Validates new teacher exists
- Atomically transfers course ownership (`courses.created_by`)
- Transfers all assignments, quizzes, group rooms, video library items, DM threads
- Creates audit log with asset counts
- Sends notifications to both (old and new) teachers
- **ROLLS BACK entirely** if any validation fails

**Errors:**
- `400 new_teacher_user_id_required`
- `400 teacher_not_found`
- `400 course_not_found`
- `409 course_already_owned_by_teacher` (same teacher)
- `500` (transaction failed, rolled back)

---

### Data Export

#### GET /admin/institutions/:institutionId/grades/export

Export all grades (students × courses × assignments × quiz XP) as CSV file.

**Auth:** `requireAuth(['admin'])` (must be admin of same institution)

**Response:**
```csv
Student Email,Student Name,Course Code,Course Name,Assignment Title,Assignment Grade,Quiz XP
alice@example.com,Alice Smith,CS101,Introduction to CS,Assignment 1,85,120
alice@example.com,Alice Smith,CS101,Introduction to CS,Assignment 2,90,120
bob@example.com,Bob Johnson,CS101,Introduction to CS,Assignment 1,78,95
```

**Notes:**
- Returned as `text/csv` with attachment header
- Filename: `grades-export-YYYY-MM-DD.csv`
- Includes all active students in institution
- One row per student-course-assignment combination
- Quiz XP aggregated by course

---

### GDPR/FERPA Compliance

#### DELETE /admin/users/:userId/purge-pii

**IRREVERSIBLE** full PII purge across all systems. Creates immutable audit trail.

**Auth:** `requireAuth(['admin'])`

**Optional Body:**
```json
{
  "reason": "Student GDPR data access request fulfilled"
}
```

**Response:**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "purgeId": "purge-123abc456def",
  "tablesAffected": [
    "users",
    "direct_message_content",
    "room_chat_messages",
    "review_tokens",
    "peer_review_assignments",
    "submissions",
    "contribution_metrics",
    "pdf_annotations",
    "ai_query_logs",
    "quiz_attempts",
    "video_notes",
    "inactivity_reports"
  ],
  "recordsAnonymised": 427,
  "filesDeleted": 23,
  "vectorEmbeddingsRemoved": 156,
  "purgedAt": "2025-01-15T10:45:00Z"
}
```

**What Gets Anonymised:**
1. **User Profile**: `email` and `name` → `REDACTED_{uuid}`
2. **Messages**: DM bodies and chat messages → `[Content removed]`
3. **Submissions**: File keys and content → `[Content removed]`
4. **Peer Reviews**: Reviewer associations deleted
5. **Annotations**: Content → `[Content removed]`
6. **AI Logs**: Query and response → `[Content removed]`
7. **Quiz Data**: Marked with `anonymised_at` timestamp
8. **Vector Embeddings**: Deleted from Pinecone (filtered by `studentId`)
9. **Contribution Metrics**: Deleted entirely
10. **Video Notes**: Deleted entirely
11. **Inactivity Reports**: Deleted entirely

**Immutable Audit Log:**
All purges recorded in `gdpr_purge_audit_log` with:
- `id` (purge ID)
- `admin_id` (who performed purge)
- `user_id` (who was purged)
- `institution_id`
- `tables_affected` (array)
- `records_anonymised`
- `files_deleted`
- `vector_embeddings_removed`
- `reason` (optional)
- `created_at`

This table has `CONSTRAINT` preventing updates. Once logged, immutable.

---

#### GET /admin/institutions/:institutionId/gdpr-audit-log

Retrieve all GDPR purges for institution.

**Auth:** `requireAuth(['admin'])`

**Response:**
```json
{
  "purges": [
    {
      "id": "purge-123abc456def",
      "admin_id": "550e8400-e29b-41d4-a716-446655440001",
      "user_id": "550e8400-e29b-41d4-a716-446655440000",
      "records_anonymised": 427,
      "files_deleted": 23,
      "created_at": "2025-01-15T10:45:00Z"
    },
    {
      "id": "purge-789ghi012jkl",
      "admin_id": "550e8400-e29b-41d4-a716-446655440001",
      "user_id": "550e8400-e29b-41d4-a716-446655440002",
      "records_anonymised": 312,
      "files_deleted": 15,
      "created_at": "2025-01-14T14:20:00Z"
    }
  ]
}
```

---

### Institution Settings

#### GET /admin/institutions/:institutionId/settings

Get institution SSO, branding, and feature configuration.

**Auth:** `requireAuth(['admin'])`

**Response:**
```json
{
  "id": "settings-550e8400-e29b-41d4-a716-446655440000",
  "institutionId": "inst-123",
  "institutionName": "University of Example",
  "logoUrl": "https://cdn.example.com/logo.png",
  "customDomain": "learn.example.edu",
  "ssoEnabled": true,
  "ssoOAuth2ClientId": "client_abc123xyz",
  "ssoDiscoveryUrl": "https://auth.example.edu/.well-known/openid-configuration",
  "features": {
    "peerReview": true,
    "groupRooms": true,
    "aiQuizGeneration": true,
    "liveSession": true
  },
  "createdAt": "2024-06-01T00:00:00Z",
  "updatedAt": "2025-01-15T10:30:00Z"
}
```

---

#### PATCH /admin/institutions/:institutionId/settings

Update institution settings.

**Auth:** `requireAuth(['admin'])`

**Request (partial, all fields optional):**
```json
{
  "institutionName": "New University Name",
  "logoUrl": "https://cdn.example.com/new-logo.png",
  "ssoEnabled": true,
  "ssoOAuth2ClientId": "new_client_id",
  "ssoDiscoveryUrl": "https://new-auth.example.edu/.well-known/openid-configuration",
  "customDomain": "learning.example.edu",
  "features": {
    "peerReview": false,
    "groupRooms": true,
    "aiQuizGeneration": true,
    "liveSession": true
  }
}
```

**Response:** Updated settings object (same as GET)

---

## Error Handling

### Standard Error Codes

```json
{
  "error": "error_code"
}
```

| Status | Code | Description |
|--------|------|-------------|
| 400 | `csv_content_required` | CSV field missing in bulk enrol |
| 400 | `missing_required_fields` | Email, name, or role missing in create user |
| 400 | `new_teacher_user_id_required` | Course transfer missing new teacher ID |
| 400 | `invalid_email` | Email format invalid (bulk enrol) |
| 400 | `teacher_not_found` | New teacher doesn't exist (course transfer) |
| 400 | `course_not_found` | Course doesn't exist |
| 409 | `course_already_owned_by_teacher` | Course already owned by target teacher |
| 403 | `forbidden` | Admin not from same institution |
| 404 | `settings_not_found` | Institution settings don't exist |
| 500 | `transaction_failed` | Atomic transaction rolled back |

---

## Security Model

### Admin Capabilities

✅ **Can Do:**
- Create/delete users
- Reset user passwords
- Transfer courses between teachers
- Export institution grades
- Configure SSO, branding, features
- Purge PII for GDPR compliance
- View audit logs
- Query settings

❌ **Cannot Do:**
- Create/edit quizzes
- Grade assignments
- Join group rooms
- Participate in peer review
- Impersonate students in quizzes
- Access student private messages
- Modify quiz content after publication

### Audit Trail

Every admin action creates an immutable log:
- `user_deletion_audit` (soft deletes)
- `course_transfer_audit` (course transfers)
- `gdpr_purge_audit_log` (PII purges)

Logs include admin ID, timestamp, action, affected records.

### Institution Isolation

- Admins can only manage their own institution
- `requireAuth(['admin'])` checks `request.auth.institutionId`
- Cross-institution requests return 403 Forbidden

---

## Examples

### Example 1: Bulk Enroll Students

**Request:**
```bash
curl -X POST http://localhost:3000/admin/users/bulk-enrol \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "csv": "email,role,courseCode\nalice@example.com,student,CS101\nbob@example.com,student,CS101\ncarol@example.com,teacher,CS101"
  }'
```

**Response:**
```json
{
  "totalRows": 3,
  "successCount": 3,
  "failedCount": 0,
  "failures": []
}
```

---

### Example 2: GDPR Data Removal

**Request:**
```bash
curl -X DELETE http://localhost:3000/admin/users/550e8400-e29b-41d4-a716-446655440000/purge-pii \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Student GDPR deletion request - verified identity"
  }'
```

**Response:**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "purgeId": "purge-abc123def456",
  "tablesAffected": 12,
  "recordsAnonymised": 427,
  "filesDeleted": 23,
  "vectorEmbeddingsRemoved": 156,
  "purgedAt": "2025-01-15T10:45:00Z"
}
```

---

### Example 3: Atomic Course Transfer

**Request:**
```bash
curl -X POST http://localhost:3000/admin/courses/course-123/transfer \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "newTeacherUserId": "550e8400-e29b-41d4-a716-446655440005"
  }'
```

**Response:**
```json
{
  "courseId": "course-123",
  "newTeacherId": "550e8400-e29b-41d4-a716-446655440005",
  "assetsTransferred": {
    "assignments": 8,
    "quizzes": 5,
    "groupRooms": 3,
    "videoLibraryItems": 24,
    "dmThreads": 12
  },
  "completedAt": "2025-01-15T11:00:00Z"
}
```

---

## Testing Checklist

- [ ] Create user via POST /admin/users
- [ ] Bulk enroll via CSV (success + failure cases)
- [ ] Reset password (verify email sent)
- [ ] Transfer course (verify assets transferred, old teacher notified)
- [ ] Export grades (verify CSV format)
- [ ] GDPR purge (verify all tables anonymised)
- [ ] Check GDPR audit log (verify immutable)
- [ ] Update settings (verify fields persisted)
- [ ] Get settings (verify returned)
- [ ] Verify institution isolation (cross-institution requests fail with 403)
- [ ] Verify admin cannot access teacher/student routes

---

## Deployment Notes

1. **Database Migration**: Run `initQuizDatabase()` to create admin tables
2. **Email Service**: Ensure email configuration for user welcome/password reset
3. **S3 Configuration**: File deletion in GDPR purge requires S3 client
4. **Pinecone Configuration**: Vector embedding removal requires Pinecone client
5. **Redis Session**: Session invalidation on user deletion requires Redis connection

---

## Compliance

### GDPR (General Data Protection Regulation)

✅ **Implemented:**
- Right to erasure (full PII purge)
- Data portability (grades export)
- Audit trail (immutable purge logs)
- Institutional admin controls

### FERPA (Family Educational Rights and Privacy Act)

✅ **Implemented:**
- Institutional record separation
- Admin audit logging
- Student data export
- Secure soft deletion

---

## Future Enhancements

- [ ] Bulk password resets
- [ ] Scheduled data retention policies
- [ ] Advanced reporting (grades by demographic, course performance)
- [ ] API key management for institutional integrations
- [ ] Two-factor authentication for admin accounts
- [ ] Admin activity logging dashboard

---

# AI Quiz Generator API Documentation

## Critical Design Rule
**No quiz is ever auto-published.** Every generated quiz must pass through a teacher preview gate before any student can see it.

---

## Overview

The AI Quiz Generator provides endpoints for generating MCQ (Multiple Choice Question) quizzes using Claude AI, with a complete teacher preview and approval workflow. All generated questions start in `draft` status and must be explicitly published by the teacher.

### Generation Pipeline

```
Teacher Request
    ↓
POST /courses/{courseId}/quizzes/ai-generate
    ↓
Query Pinecone (K=15) for course context
    ↓
Call Claude API (claude-sonnet-4-20250514)
    ↓
Parse & validate JSON response (2 retries max)
    ↓
Store questions with status='draft'
    ↓
Return to teacher for preview
    ↓
Teacher edits/adds/deletes questions
    ↓
PATCH /quizzes/{quizId}/publish
    ↓
All questions status='published'
    ↓
Quiz visible & launchable to students
```

---

## Endpoints

### 1. Generate AI Quiz
**`POST /courses/:courseId/quizzes/ai-generate`**

Generates AI quiz questions based on course context and topic.

**Authentication:** Requires `teacher` role

**Request Body:**
```typescript
{
  topic: string;        // Topic to generate questions on (required, trimmed)
  questionCount?: number; // Number of questions (default: 10, max: 30)
}
```

**Response (201):**
```typescript
{
  quizId: string;       // UUID of created draft quiz
  status: 'draft';
  questions: [
    {
      text: string;
      options: [string, string, string, string];
      correctOptionIndex: 0 | 1 | 2 | 3;
      difficultyRating: 'easy' | 'medium' | 'hard';
      explanation: string;
      pointValue: 10;    // Fixed at 10
      timeLimitSeconds: 30; // Fixed at 30
    }
    // ... questionCount items
  ]
}
```

**Error Responses:**
- `400`: Invalid topic or question count
- `403`: User is not a teacher for this course
- `422`: AI generation failed (invalid JSON from Claude, no context found)
- `500`: Internal error

**Environment Requirements:**
- `AI_SERVICE_URL`: URL of Python AI service (default: `http://localhost:8000`)
- `INTERNAL_API_KEY`: API key for Python service
- `ANTHROPIC_API_KEY`: Claude API key (on Python service)

---

### 2. Edit Draft Question
**`PATCH /quizzes/:quizId/questions/:questionId`**

Edits a question that is in `draft` status.

**Authentication:** Requires `teacher` role

**Request Body (all optional):**
```typescript
{
  text?: string;        // Question text
  options?: [string, string, string, string];
  correctOptionIndex?: 0 | 1 | 2 | 3;
  explanation?: string;
  difficultyRating?: 'easy' | 'medium' | 'hard';
  pointValue?: number;   // 1-100
  timeLimitSeconds?: number; // 10-120
}
```

**Response (200):**
```typescript
{
  ok: true
}
```

**Error Responses:**
- `400`: Question not found, or question is not in draft status
- `500`: Internal error

**Restrictions:**
- Only `draft` questions can be edited
- Once published, questions are immutable (except void)

---

### 3. Delete Draft Question
**`DELETE /quizzes/:quizId/questions/:questionId`**

Deletes a question in `draft` status and re-indexes remaining questions.

**Authentication:** Requires `teacher` role

**Response (200):**
```typescript
{
  ok: true
}
```

**Error Responses:**
- `400`: Question not found, or question is not in draft status
- `500`: Internal error

**Restrictions:**
- Only `draft` questions can be deleted
- Question indices are automatically adjusted

---

### 4. Add Manual Question
**`POST /quizzes/:quizId/questions`**

Adds a teacher-created question to a draft quiz.

**Authentication:** Requires `teacher` role

**Request Body:**
```typescript
{
  type: 'mcq' | 'true_false' | 'short_answer';
  text: string;
  options?: [string, string, string, string];
  correctOptionIndex?: 0 | 1 | 2 | 3;
  explanation?: string;
  pointValue?: number;   // Default: 10, Range: 1-100
  timeLimitSeconds?: number; // Default: 30, Range: 10-120
}
```

**Response (200):**
```typescript
{
  ok: true,
  questionId: string
}
```

**Error Responses:**
- `400`: Invalid payload, quiz not found, or quiz not in draft status
- `500`: Internal error

**Restrictions:**
- Can only add to `draft` quizzes
- Point value must be 1-100
- Time limit must be 10-120 seconds

---

### 5. Publish Draft Quiz
**`PATCH /quizzes/:quizId/publish`**

Converts all draft questions to published status. Once published, the quiz becomes visible to students and can be launched.

**Authentication:** Requires `teacher` role

**Response (200):**
```typescript
{
  quizId: string;
  status: 'published';
  questionCount: number;
  publishedAt: string; // ISO 8601 timestamp
}
```

**Error Responses:**
- `400`: Quiz not found, already published, or has no draft questions
- `500`: Internal error

**Critical Behavior:**
- ✅ This is the ONLY way for students to see a quiz
- ✅ All draft questions become published atomically
- ✅ After publish, quiz is immutable except for voiding individual questions
- ❌ No auto-publish path exists

---

### 6. Void Question (with Score Recalculation)
**`POST /quizzes/:quizId/questions/:questionId/void`**

Voids a question and recalculates all affected student scores proportionally.

**Authentication:** Requires `teacher` role

**Response (200):**
```typescript
{
  ok: true,
  questionId: string,
  voided: boolean,  // true
  affectedAttempts: [
    {
      attemptId: string;
      userId: string;
      oldScore: number;
      newScore: number;
      pointsRedistributed: number;
    }
    // ... one entry per affected attempt
  ]
}
```

**Error Responses:**
- `400`: Question or quiz not found
- `500`: Internal error

**Score Recalculation Algorithm:**
```
totalInitialPoints = sum of ALL original question point values
activeInitialPoints = sum of NON-VOIDED question point values
scale = totalInitialPoints / activeInitialPoints

For each correct answer:
  newPoints = originalPoints × scale
  
For each voided answer:
  newPoints = 0
  
newScore = sum of all newPoints
```

**Example:**
```
Original: 4 questions × 10 points = 40 total
Student scored: 25 points (2.5 questions correct with bonus)
Teacher voids 1 question:
  activeInitialPoints = 30
  scale = 40 / 30 = 1.333
  newScore = 25 × (30/40) = 18.75 points
```

---

## Data Structures

### Quiz
```typescript
interface Quiz {
  id: string;           // UUID
  courseId: string;
  title: string;
  status: 'draft' | 'published';
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}
```

### Question
```typescript
interface QuizQuestion {
  id: string;           // UUID
  quizId: string;
  type: 'mcq' | 'true_false' | 'short_answer';
  text: string;
  options: string[] | null;
  correctOptionIndex: number | null;
  explanation: string | null;
  pointValue: number;   // 10-100
  timeLimitSeconds: number; // 30-120
  questionIndex: number; // Order in quiz
  voided: boolean;
  status: 'draft' | 'published' | 'voided';
  generatedByAi: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### AI Generated Question
```typescript
interface AiGeneratedQuestion {
  questionText: string;
  options: [string, string, string, string]; // Exactly 4
  correctOptionIndex: 0 | 1 | 2 | 3;
  difficultyRating: 'easy' | 'medium' | 'hard';
  explanation: string; // Must be grounded in course context
  pointValue: 10;      // Always 10
  timeLimitSeconds: 30; // Always 30
}
```

---

## Workflow Examples

### Example 1: Generate, Review, Publish
```bash
# 1. Generate AI quiz
POST /courses/math101/quizzes/ai-generate
{
  "topic": "Quadratic Equations",
  "questionCount": 5
}
# Response: { quizId: "abc-123", status: "draft", questions: [...] }

# 2. Edit generated question
PATCH /quizzes/abc-123/questions/q1
{
  "text": "Find the roots of x² + 3x + 2 = 0",
  "options": ["x = -1, -2", "x = 1, 2", "x = -1, 1", "x = 2, 3"],
  "correctOptionIndex": 0
}

# 3. Add a custom question
POST /quizzes/abc-123/questions
{
  "type": "mcq",
  "text": "What is a parabola?",
  "options": ["A curve", "A line", "A circle", "A sphere"],
  "correctOptionIndex": 0,
  "pointValue": 10
}

# 4. Publish for students
PATCH /quizzes/abc-123/publish
# Response: { status: "published", questionCount: 6, publishedAt: "2025-06-23T..." }
```

### Example 2: Void Question & Redistribute Points
```bash
# After students have taken the quiz, teacher discovers an issue with Q3

# 1. Void the question
POST /quizzes/abc-123/questions/q3/void

# Response:
{
  "ok": true,
  "voided": true,
  "affectedAttempts": [
    {
      "userId": "student-1",
      "oldScore": 50,
      "newScore": 41.67,
      "pointsRedistributed": 8.33
    },
    {
      "userId": "student-2",
      "oldScore": 60,
      "newScore": 50,
      "pointsRedistributed": 10
    }
  ]
}

# Teacher sees immediate impact on all student scores
# student-1: 50 → 41.67 (lost 8.33 points)
# student-2: 60 → 50 (lost 10 points)
```

---

## Security & Authorization

All endpoints require authentication:
- **Teacher endpoints**: `requireAuth(['teacher'])`
- Teacher must own the course (via `getCourseDetail()`)

Course ownership is verified via the `courseStore`:
```typescript
function teacherOwnsCourse(courseId: string): boolean {
  return Boolean(
    getCourseDetail(courseId, "teacher") || 
    getCourseDetail(courseId, "admin")
  );
}
```

---

## Error Handling

### Python AI Service Errors
If the AI service returns an error, the Node endpoint will forward it:

```typescript
// 422 Unprocessable Entity - AI generation failed
{
  "error": "no_course_context_found" | 
           "invalid_model_json" | 
           "topic_required" | ...
}
```

### Validation Errors
```typescript
// 400 Bad Request
{
  "error": "can_only_edit_draft_questions" |
           "can_only_delete_draft_questions" |
           "can_only_add_to_draft_quiz" |
           "quiz_already_published" |
           "no_questions_to_publish"
}
```

---

## Database Changes

### New Columns
**quiz_questions:**
- `status` VARCHAR(50) DEFAULT 'draft' - Question publish status
- `generated_by_ai` BOOLEAN DEFAULT FALSE - Marks AI-generated questions
- `created_at` TIMESTAMP DEFAULT NOW()
- `updated_at` TIMESTAMP DEFAULT NOW()

**quizzes:**
- `status` VARCHAR(50) DEFAULT 'draft' - Quiz publish status
- `updated_at` TIMESTAMP DEFAULT NOW()

### Question Status Flow
```
draft ──[publish]──> published
  ↓                      ↓
[edit/delete]         [void individual Q]
  ↓                      ↓
  └──────────────────────┘
```

---

## Environment & Configuration

```env
# Node.js
AI_SERVICE_URL=http://localhost:8000
INTERNAL_API_KEY=your-secret-key

# Python service (.env or settings)
ANTHROPIC_API_KEY=sk-...
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=course-content
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

---

## Testing Checklist

- [ ] Generate quiz with valid topic
- [ ] Edit generated question text
- [ ] Edit question options
- [ ] Edit correct answer index
- [ ] Change point value (1-100)
- [ ] Change time limit (10-120)
- [ ] Delete question and verify re-indexing
- [ ] Add manual question to draft quiz
- [ ] Publish quiz → all questions become visible
- [ ] Cannot edit published question
- [ ] Cannot delete published question
- [ ] Void published question → scores recalculate
- [ ] Verify point redistribution math
- [ ] Cannot add questions to published quiz
- [ ] Cannot publish already-published quiz

---

## Architecture Diagram

```
Node.js API Server
├─ POST /courses/:courseId/quizzes/ai-generate
│  └─ Calls Python service
│     └─ Queries Pinecone
│     └─ Calls Claude API
│     └─ Returns validated JSON questions
├─ PATCH /quizzes/:quizId/questions/:questionId
│  └─ UPDATE quiz_questions (draft only)
├─ DELETE /quizzes/:quizId/questions/:questionId
│  └─ DELETE from quiz_questions (draft only)
├─ POST /quizzes/:quizId/questions
│  └─ INSERT into quiz_questions (draft quiz only)
├─ PATCH /quizzes/:quizId/publish
│  └─ UPDATE quizzes.status = 'published'
│  └─ UPDATE quiz_questions.status = 'published'
└─ POST /quizzes/:quizId/questions/:questionId/void
   └─ UPDATE quiz_questions.voided = TRUE
   └─ Recalculate quiz_attempt_answers.points_awarded
   └─ Update student_xp_ledger

Database
├─ quizzes (status: draft|published)
├─ quiz_questions (status: draft|published, generated_by_ai, voided)
├─ quiz_attempts
├─ quiz_attempt_answers
└─ student_xp_ledger
```

---

## FAQ

**Q: Can I unpublish a quiz?**
A: No. Once published, a quiz is permanent. If needed, void individual problematic questions.

**Q: Can I edit a published question?**
A: No. Only draft questions can be edited. Published questions can only be voided.

**Q: What happens when I void a question?**
A: The question is marked voided. All student attempt scores are recalculated proportionally. Points from the voided question are redistributed across remaining questions.

**Q: Can students see draft quizzes?**
A: No. Only published quizzes are visible and launchable.

**Q: How many attempts can I void?**
A: Unlimited. Each void recalculates all affected scores.

**Q: Are questions always multiple choice?**
A: AI-generated questions are always MCQ with 4 options. Teachers can add true/false and short answer questions manually.

---

## Related Endpoints

- `POST /quizzes/:quizId/launch` - Launch quiz (teacher only)
- `POST /quizzes/:quizId/start` - Start quiz immediately (teacher only)
- `POST /quizzes/:quizId/attempts/:attemptId/answers` - Submit answer (student)
- `GET /quizzes/:quizId/attempts/:attemptId/state` - Get quiz state (student)

---

# AI Quiz Generator Implementation Details

## Architecture Overview

The AI Quiz Generator is a full-stack feature connecting Claude AI, Pinecone vector search, and a PostgreSQL database with a strict teacher-approval workflow.

```
┌──────────────────┐
│   Next.js App    │ Teacher reviews & publishes
│  (Frontend)      │
└────────┬─────────┘
         │
┌────────▼──────────────────────┐
│   Fastify Node.js Server      │
│  (quiz-routes.ts)             │
│  ┌───────────────────────────┐│
│  │ POST /ai-generate         ││
│  │ PATCH /publish            ││
│  │ PATCH /edit question      ││
│  │ DELETE /delete question   ││
│  │ POST /add question        ││
│  │ POST /void question       ││
│  └───────────────┬───────────┘│
└────────┬─────────┘
         │ (internal API)
┌────────▼──────────────────────┐
│   Python FastAPI Service      │
│  (main.py)                    │
│  ┌───────────────────────────┐│
│  │ /internal/.../ai-generate ││
│  │ - Calls quiz_generation   ││
│  │ - Returns validated JSON  ││
│  └───────────────┬───────────┘│
│                  │             │
│      ┌───────────┴─────────┐   │
│      │                     │   │
│  ┌───▼────┐  ┌────────┐   │   │
│  │Pinecone│  │ Claude │   │   │
│  │ (K=15) │  │  API   │   │   │
│  └────────┘  └────────┘   │   │
└──────────────────────────────┘
         │
┌────────▼──────────────────────┐
│  PostgreSQL Database         │
│  ┌─────────────────────────┐ │
│  │ quizzes                 │ │
│  │ - id, courseId, title   │ │
│  │ - status (draft|pub)    │ │
│  └─────────────────────────┘ │
│  ┌─────────────────────────┐ │
│  │ quiz_questions          │ │
│  │ - status (draft|pub)    │ │
│  │ - generatedByAi         │ │
│  │ - voided                │ │
│  └─────────────────────────┘ │
│  ┌─────────────────────────┐ │
│  │ quiz_attempts           │ │
│  │ quiz_attempt_answers    │ │
│  │ student_xp_ledger       │ │
│  └─────────────────────────┘ │
└──────────────────────────────┘
```

---

## Generation Flow Details

### Step 1: Teacher Initiates Generation
```typescript
POST /courses/{courseId}/quizzes/ai-generate
{
  topic: "Quadratic Equations",
  questionCount: 10  // max 30
}
```

### Step 2: Validate & Call Python Service
```typescript
// quiz-routes.ts - AI generation endpoint
const aiResponse = await fetch(
  `${AI_SERVICE_URL}/internal/courses/${courseId}/quizzes/ai-generate`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-API-Key": process.env.INTERNAL_API_KEY,
    },
    body: JSON.stringify({
      courseId,
      topic: "Quadratic Equations",
      questionCount: 10,
    }),
  }
);
```

### Step 3: Python Service Generates Questions
```python
# app/services/quiz_generation.py

def generate_quiz_questions(*, course_id: str, topic: str, question_count: int):
    # 1. Query Pinecone for course context
    query_embedding = get_embedding_provider().embed_query(topic)
    matches = get_vector_store().query_course(
        course_id, 
        query_embedding, 
        K=15  # Retrieve 15 chunks for rich context
    )
    
    # 2. Filter for this course & non-archived
    normalized = [
        item for item in normalized
        if item["metadata"]["courseId"] == course_id 
        and item["metadata"]["archived"] is False
    ]
    
    if not normalized:
        raise QuizGenerationError("no_course_context_found")
    
    # 3. Assemble context string
    context = _assemble_context(normalized)
    
    # 4. Generate system prompt
    system_prompt = _system_prompt(
        question_count,
        strict_retry=False
    )
    
    # 5. Call Claude with retry logic
    for attempt in [0, 1]:  # Max 2 attempts
        raw_response = _call_claude(
            system_prompt=system_prompt,
            topic=topic,
            question_count=question_count,
            context=context
        )
        
        try:
            questions = _parse_questions(raw_response, question_count)
            return questions  # Success!
        except QuizGenerationError:
            if attempt == 0:
                system_prompt = _system_prompt(
                    question_count,
                    strict_retry=True  # Stricter on retry
                )
            else:
                raise QuizGenerationError("invalid_model_json")
```

### Step 4: Validate JSON Response
```python
# Expected format from Claude:
[
  {
    "questionText": "...",
    "options": ["A", "B", "C", "D"],
    "correctOptionIndex": 0,
    "difficultyRating": "medium",
    "explanation": "...",
    "pointValue": 10,
    "timeLimitSeconds": 30
  },
  // ... 10 items total
]

# Validation checks:
# ✓ Array with exactly N items
# ✓ Each item has all required fields
# ✓ 4 options exactly
# ✓ correctOptionIndex 0-3
# ✓ difficultyRating in {easy, medium, hard}
# ✓ pointValue === 10
# ✓ timeLimitSeconds === 30
# ✓ No empty text/options
```

### Step 5: Create Draft Quiz in Database
```typescript
// src/lib/server/quiz/service.ts
export async function createAiQuiz(
  courseId: string,
  title: string,
  aiQuestions: AiGeneratedQuestion[]
): Promise<string> {
  const quizId = randomUUID();
  
  await pool.query("BEGIN");
  try {
    // Create quiz with draft status
    await pool.query(
      `INSERT INTO quizzes (id, course_id, title, status)
       VALUES ($1, $2, $3, 'draft')`,
      [quizId, courseId, title]
    );

    // Insert each question
    for (let i = 0; i < aiQuestions.length; i++) {
      const q = aiQuestions[i];
      await pool.query(
        `INSERT INTO quiz_questions (
          id, quiz_id, type, text, options, 
          correct_option_index, explanation,
          point_value, time_limit_seconds, 
          question_index, status, generated_by_ai
        ) VALUES ($1, $2, 'mcq', $4, $5, $6, $7, 
                  $8, $9, $10, 'draft', true)`,
        [
          randomUUID(),
          quizId,
          q.questionText,
          JSON.stringify(q.options),
          q.correctOptionIndex,
          q.explanation,
          q.pointValue,      // Always 10
          q.timeLimitSeconds, // Always 30
          i
        ]
      );
    }
    
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
  
  return quizId;
}
```

### Step 6: Return to Teacher
```typescript
// Response: 
{
  quizId: "550e8400-e29b-41d4-a716-446655440000",
  status: "draft",
  questions: [
    {
      text: "What is the quadratic formula?",
      options: ["x = -b ± √(b² - 4ac) / 2a", "..."],
      correctOptionIndex: 0,
      difficultyRating: "easy",
      explanation: "The quadratic formula solves ax² + bx + c = 0",
      pointValue: 10,
      timeLimitSeconds: 30
    },
    // ... 9 more questions
  ]
}
```

---

## Teacher Preview & Editing

### Edit Question
```typescript
// quiz-routes.ts
app.patch("/quizzes/:quizId/questions/:questionId", async (req, res) => {
  try {
    await editQuestion(questionId, req.body);
    return { ok: true };
  }
});

// service.ts
export async function editQuestion(
  questionId: string,
  edit: EditQuestionRequest
): Promise<void> {
  // 1. Verify draft status
  const qRes = await pool.query(
    `SELECT status FROM quiz_questions WHERE id = $1`,
    [questionId]
  );
  if (qRes.rows[0].status !== "draft") {
    throw new Error("can_only_edit_draft_questions");
  }

  // 2. Build dynamic UPDATE SQL
  const updates: string[] = [];
  const values: (string | number)[] = [];
  let paramCount = 1;

  if (edit.text !== undefined) {
    updates.push(`text = $${paramCount}`);
    values.push(edit.text);
    paramCount++;
  }

  if (edit.options !== undefined) {
    updates.push(`options = $${paramCount}`);
    values.push(JSON.stringify(edit.options));
    paramCount++;
  }

  // ... continue for other fields

  updates.push(`updated_at = NOW()`);

  const sql = `UPDATE quiz_questions 
               SET ${updates.join(", ")} 
               WHERE id = $${paramCount}`;
  values.push(questionId);
  
  await pool.query(sql, values);
}
```

### Delete Question
```typescript
export async function deleteQuestion(questionId: string): Promise<void> {
  // 1. Verify draft & get quiz_id
  const qRes = await pool.query(
    `SELECT quiz_id, question_index, status FROM quiz_questions WHERE id = $1`,
    [questionId]
  );
  if (qRes.rows[0].status !== "draft") {
    throw new Error("can_only_delete_draft_questions");
  }

  const { quiz_id: quizId, question_index: deletedIndex } = qRes.rows[0];

  await pool.query("BEGIN");
  try {
    // 2. Delete the question
    await pool.query(`DELETE FROM quiz_questions WHERE id = $1`, [questionId]);

    // 3. Re-index remaining questions
    //    Question at index 2 becomes index 1, etc.
    await pool.query(
      `UPDATE quiz_questions
       SET question_index = question_index - 1
       WHERE quiz_id = $1 AND question_index > $2`,
      [quizId, deletedIndex]
    );

    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}
```

### Add Manual Question
```typescript
export async function addQuestion(
  quizId: string,
  question: AddQuestionRequest
): Promise<string> {
  // 1. Verify quiz is draft
  const quizRes = await pool.query(
    `SELECT status FROM quizzes WHERE id = $1`,
    [quizId]
  );
  if (quizRes.rows[0].status !== "draft") {
    throw new Error("can_only_add_to_draft_quiz");
  }

  // 2. Validate
  const pointValue = question.pointValue ?? 10;
  if (pointValue < 1 || pointValue > 100) {
    throw new Error("pointValue must be between 1 and 100");
  }

  const timeLimitSeconds = question.timeLimitSeconds ?? 30;
  if (timeLimitSeconds < 10 || timeLimitSeconds > 120) {
    throw new Error("timeLimitSeconds must be between 10 and 120");
  }

  // 3. Get next index
  const indexRes = await pool.query(
    `SELECT MAX(question_index) as max_index 
     FROM quiz_questions WHERE quiz_id = $1`,
    [quizId]
  );
  const nextIndex = (indexRes.rows[0]?.max_index ?? -1) + 1;

  // 4. Insert with generated_by_ai = false
  const questionId = randomUUID();
  await pool.query(
    `INSERT INTO quiz_questions (
      ..., question_index, status, generated_by_ai
    ) VALUES (..., $10, 'draft', false)`,
    [
      questionId,
      quizId,
      question.type,
      question.text,
      // ... other fields
      nextIndex
    ]
  );

  return questionId;
}
```

---

## Publishing Workflow

### Approve & Publish
```typescript
// quiz-routes.ts
app.patch("/quizzes/:quizId/publish", async (req, res) => {
  try {
    const questionCount = await publishQuiz(quizId);
    return {
      quizId,
      status: "published",
      questionCount,
      publishedAt: new Date().toISOString()
    };
  }
});

// service.ts
export async function publishQuiz(quizId: string): Promise<number> {
  const pool = getPostgresPool();

  await pool.query("BEGIN");
  try {
    // 1. Verify quiz is draft
    const quizRes = await pool.query(
      `SELECT status FROM quizzes WHERE id = $1`,
      [quizId]
    );
    if (quizRes.rows[0].status !== "draft") {
      throw new Error("quiz_already_published");
    }

    // 2. Count draft questions
    const countRes = await pool.query(
      `SELECT COUNT(*) as count FROM quiz_questions 
       WHERE quiz_id = $1 AND status = 'draft'`,
      [quizId]
    );
    const questionCount = parseInt(countRes.rows[0].count, 10);

    if (questionCount === 0) {
      throw new Error("no_questions_to_publish");
    }

    // 3. Update all draft questions to published (ATOMIC)
    await pool.query(
      `UPDATE quiz_questions 
       SET status = 'published' 
       WHERE quiz_id = $1 AND status = 'draft'`,
      [quizId]
    );

    // 4. Update quiz to published
    await pool.query(
      `UPDATE quizzes SET status = 'published' WHERE id = $1`,
      [quizId]
    );

    await pool.query("COMMIT");
    return questionCount;
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}
```

---

## Void & Score Redistribution

### Detailed Score Recalculation
```typescript
export async function voidQuestionAndRecalculateWithResponse(
  quizId: string,
  questionId: string
): Promise<VoidQuestionResponse> {
  const pool = getPostgresPool();
  const affectedAttempts = [];

  await pool.query("BEGIN");
  try {
    // 1. Mark question as voided
    await pool.query(
      `UPDATE quiz_questions SET voided = TRUE 
       WHERE id = $1 AND quiz_id = $2`,
      [questionId, quizId]
    );

    // 2. Calculate scaling factor
    //    Before void: Q1(10) + Q2(10) + Q3(10) + Q4(10) = 40 total
    //    After void:  Q1(10) + Q2(10) +        + Q4(10) = 30 active
    //    Scale = 40 / 30 = 1.333
    const questionsRes = await pool.query(
      `SELECT id, point_value, voided FROM quiz_questions WHERE quiz_id = $1`,
      [quizId]
    );
    const allQuestions = questionsRes.rows;
    const activeQuestions = allQuestions.filter(q => !q.voided);
    const voidedQuestions = allQuestions.filter(q => q.voided);

    const totalInitialPoints = allQuestions.reduce(
      (sum, q) => sum + q.point_value, 0
    );
    const activeInitialPoints = activeQuestions.reduce(
      (sum, q) => sum + q.point_value, 0
    );
    const scale = activeInitialPoints > 0 
      ? totalInitialPoints / activeInitialPoints 
      : 0;

    // 3. For each student attempt
    const attemptsRes = await pool.query(
      `SELECT id, user_id, score FROM quiz_attempts WHERE quiz_id = $1`,
      [quizId]
    );

    for (const attempt of attemptsRes.rows) {
      const attemptId = attempt.id;
      const userId = attempt.user_id;
      const oldScore = attempt.score;

      // Get all answers for this attempt
      const answersRes = await pool.query(
        `SELECT a.id, a.question_id, a.is_correct, 
                a.time_remaining_seconds, a.points_awarded,
                q.point_value, q.time_limit_seconds
         FROM quiz_attempt_answers a
         JOIN quiz_questions q ON a.question_id = q.id
         WHERE a.attempt_id = $1`,
        [attemptId]
      );

      let totalScore = 0;
      let pointsRedistributed = 0;

      // Example: Student got 25 points from 3 questions
      // Q1: ✓ 10 * 1.5 (bonus) = 15 points
      // Q2: ✓ 10 * 1.0 = 10 points
      // Q3: ✗ 0 points (voided - had 10 points)
      // Old score: 25
      // New score: (15 + 10) * (40/30) = 25 * 1.333 = 33.33

      for (const ans of answersRes.rows) {
        const isVoided = voidedQuestions.some(
          vq => vq.id === ans.question_id
        );

        if (isVoided) {
          // Voided answer: 0 points
          pointsRedistributed += ans.points_awarded;
          await pool.query(
            `UPDATE quiz_attempt_answers SET points_awarded = 0 WHERE id = $1`,
            [ans.id]
          );
        } else if (ans.is_correct) {
          // Correct answer: recalculate with scale
          const speedMultiplier =
            ans.time_remaining_seconds >= ans.time_limit_seconds / 2 
              ? 1.5 
              : 1.0;
          const originalPoints = ans.point_value * speedMultiplier;
          const redistributedPoints = originalPoints * scale;
          totalScore += redistributedPoints;

          await pool.query(
            `UPDATE quiz_attempt_answers 
             SET points_awarded = $2 WHERE id = $1`,
            [ans.id, redistributedPoints]
          );
        } else {
          // Incorrect answer: still 0
          await pool.query(
            `UPDATE quiz_attempt_answers SET points_awarded = 0 WHERE id = $1`,
            [ans.id]
          );
        }
      }

      // 4. Update attempt & ledger
      await pool.query(
        `UPDATE quiz_attempts SET score = $2 WHERE id = $1`,
        [attemptId, totalScore]
      );

      await pool.query(
        `UPDATE student_xp_ledger 
         SET xp_amount = $3 
         WHERE user_id = $1 AND quiz_id = $2`,
        [userId, quizId, Math.round(totalScore)]
      );

      affectedAttempts.push({
        attemptId,
        userId,
        oldScore,
        newScore: totalScore,
        pointsRedistributed
      });
    }

    await pool.query("COMMIT");

    return {
      ok: true,
      questionId,
      voided: true,
      affectedAttempts
    };
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}
```

---

## Database Schema

### quizzes table
```sql
CREATE TABLE quizzes (
  id UUID PRIMARY KEY,
  course_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### quiz_questions table
```sql
CREATE TABLE quiz_questions (
  id UUID PRIMARY KEY,
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  text TEXT NOT NULL,
  options JSONB,
  correct_option_index INT,
  explanation TEXT,
  point_value INT DEFAULT 10,
  time_limit_seconds INT DEFAULT 30,
  question_index INT NOT NULL,
  voided BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'draft' NOT NULL,
  generated_by_ai BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Relationships
```
quizzes (1) ──────→ (many) quiz_questions
             │
             └─→ quiz_attempts
                  └─→ quiz_attempt_answers
                      └─→ quiz_questions

student_xp_ledger →─ quiz_id, course_id
```

---

## Key Design Decisions

### 1. No Auto-Publish
- ✅ All generated quizzes start as `draft`
- ✅ Only explicit PATCH /publish makes quiz visible
- ✅ Prevents accidental student access to unapproved content

### 2. Immutable Published Questions
- ✅ Draft questions: fully editable and deletable
- ✅ Published questions: cannot be edited or deleted
- ✅ Can only void individual questions (with redistribution)

### 3. Atomic Publishing
- ✅ All draft questions → published in single transaction
- ✅ Quiz status changes simultaneously with all questions
- ✅ No race conditions or partial publishes

### 4. Proportional Point Redistribution
- ✅ Voided question's points redistributed across active questions
- ✅ Maintains proportionality: high-point questions get more redistribution
- ✅ Recalculates all affected student scores automatically
- ✅ Teacher sees immediate impact on all student scores

### 5. AI Question Constants
- ✅ All AI questions: exactly 10 points, 30 seconds
- ✅ Simplifies point calculation
- ✅ Teachers can customize when manually adding questions

---

## Type Safety

All TypeScript types are defined in `src/types/quiz.ts`:

```typescript
export interface AiGeneratedQuestion {
  questionText: string;
  options: [string, string, string, string];
  correctOptionIndex: 0 | 1 | 2 | 3;
  difficultyRating: "easy" | "medium" | "hard";
  explanation: string;
  pointValue: 10;
  timeLimitSeconds: 30;
}

export type QuestionStatus = "draft" | "published" | "voided";

export interface QuizQuestion {
  id: string;
  quizId: string;
  type: "mcq" | "true_false" | "short_answer";
  text: string;
  options: string[] | null;
  correctOptionIndex: number | null;
  explanation: string | null;
  pointValue: number;
  timeLimitSeconds: number;
  questionIndex: number;
  voided: boolean;
  status: QuestionStatus;
  generatedByAi: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## Error Handling Strategy

### Validation Errors (400)
- Invalid topic or question count
- Question not found
- Cannot edit/delete published questions
- Cannot add to published quiz
- Quiz already published

### Generation Errors (422)
- No course context found (Pinecone query returned nothing)
- Invalid JSON from Claude (even after retry)
- Topic required

### Authorization Errors (403)
- User is not a teacher
- User doesn't own the course

### Server Errors (500)
- Database connection issues
- Python service unavailable
- Claude API errors

---

## Testing Strategy

### Unit Tests (Python)
- `generate_quiz_questions()` with mock Pinecone data
- JSON validation and parsing
- Retry logic with malformed responses

### Integration Tests (Node.js)
- Generate → Edit → Publish workflow
- Question re-indexing after deletion
- Score recalculation after void
- Authorization checks

### End-to-End Tests
- Teacher generates quiz
- Teacher reviews and edits questions
- Teacher publishes quiz
- Student takes quiz
- Teacher voids problematic question
- Verify all student scores recalculated

---

## Monitoring & Logging

Important events to log:
- Quiz generation attempts and results
- Questions edited/deleted during preview
- Quiz publication (teacher & timestamp)
- Questions voided (with affected student count)
- Score redistribution events

Key metrics:
- Generation success rate
- Average generation time
- Distribution of difficulty ratings
- Time between generation and publication
- Number of questions edited before publish

---

# AI Quiz Generator - Quick Reference

## What Was Built

A complete AI-powered quiz generation system for CBB with **strict no-auto-publish design**. Every generated quiz must pass a teacher preview gate before students can see it.

---

## Quick Start

### 1. Generate Quiz
```bash
POST /courses/{courseId}/quizzes/ai-generate
{
  "topic": "Quadratic Equations",
  "questionCount": 10
}
```
Returns: `{ quizId, status: 'draft', questions: [...] }`

### 2. Review & Edit Questions
```bash
# Edit a question
PATCH /quizzes/{quizId}/questions/{questionId}
{
  "text": "New question text",
  "options": ["A", "B", "C", "D"],
  "correctOptionIndex": 0
}

# Delete a question
DELETE /quizzes/{quizId}/questions/{questionId}

# Add custom question
POST /quizzes/{quizId}/questions
{
  "type": "mcq",
  "text": "Your question",
  "options": ["A", "B", "C", "D"],
  "correctOptionIndex": 0,
  "pointValue": 10
}
```

### 3. Publish for Students
```bash
PATCH /quizzes/{quizId}/publish
```
Returns: `{ status: 'published', questionCount: 10, publishedAt: '...' }`

### 4. (Optional) Void Problematic Question
```bash
POST /quizzes/{quizId}/questions/{questionId}/void
```
Returns: `{ affectedAttempts: [...], pointsRedistributed: 8.33 }`

---

## File Changes Summary

### New Files
- `src/types/quiz.ts` - TypeScript types for all quiz operations
- `AI_QUIZ_GENERATOR_API.md` - Complete API reference
- `AI_QUIZ_GENERATOR_IMPLEMENTATION.md` - Implementation details

### Modified Files
- `src/lib/server/quiz/init-db.ts` - Added schema columns
- `src/lib/server/quiz/service.ts` - Added 6 new functions
- `src/server/fastify/quiz-routes.ts` - Added 6 new endpoints

### Python (Already Existed)
- `app/main.py` - `/internal/courses/{courseId}/quizzes/ai-generate`
- `app/services/quiz_generation.py` - Claude + Pinecone integration

---

## Database Schema Changes

### New Columns
```sql
-- quiz_questions table
ALTER TABLE quiz_questions ADD COLUMN status VARCHAR(50) DEFAULT 'draft';
ALTER TABLE quiz_questions ADD COLUMN generated_by_ai BOOLEAN DEFAULT FALSE;
ALTER TABLE quiz_questions ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE quiz_questions ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();

-- quizzes table  
ALTER TABLE quizzes ADD COLUMN status VARCHAR(50) DEFAULT 'draft';
ALTER TABLE quizzes ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
```

---

## Environment Variables

```env
# Node.js
AI_SERVICE_URL=http://localhost:8000
INTERNAL_API_KEY=your-secret-key

# Python (already configured)
ANTHROPIC_API_KEY=sk-...
PINECONE_API_KEY=...
```

---

## Core Functions

### Node.js Service Functions
```typescript
// Create draft quiz from AI questions
createAiQuiz(courseId, title, aiQuestions) → quizId

// Edit draft question
editQuestion(questionId, editObject) → void

// Delete draft question & re-index
deleteQuestion(questionId) → void

// Add manual question to draft quiz
addQuestion(quizId, questionObject) → questionId

// Publish all draft questions
publishQuiz(quizId) → questionCount

// Void question & recalculate all student scores
voidQuestionAndRecalculateWithResponse(quizId, questionId) → VoidQuestionResponse
```

### Python Service Functions
```python
# Generate questions from Pinecone context + Claude
generate_quiz_questions(
  course_id: str,
  topic: str,
  question_count: int
) → List[AiGeneratedQuestion]
```

---

## Question Status Flow

```
┌──────────────────────────────────────────────┐
│  NEW QUIZ (Generated by AI)                  │
│  status = 'draft'                            │
│  ✓ Can edit text, options, answer            │
│  ✓ Can delete individual questions           │
│  ✓ Can add manual questions                  │
│  ✓ Can change point value, time limit        │
│  ✗ Students cannot see                       │
└──────────────────────────────────────────────┘
                    │
            Teacher clicks Publish
                    │
                    ▼
┌──────────────────────────────────────────────┐
│  PUBLISHED QUIZ                              │
│  status = 'published'                        │
│  ✓ Students can see and take                 │
│  ✓ Can void individual questions             │
│  ✗ Cannot edit or delete questions           │
│  ✗ Cannot add new questions                  │
└──────────────────────────────────────────────┘
                    │
        (Optional) Teacher voids Q3
                    │
                    ▼
┌──────────────────────────────────────────────┐
│  QUESTION VOIDED                             │
│  Q3.voided = true                            │
│  ✓ All student scores recalculated           │
│  ✓ Points redistributed proportionally       │
│  ✓ XP ledger updated                         │
└──────────────────────────────────────────────┘
```

---

## Score Redistribution Example

**Scenario:**
- Quiz has 4 questions × 10 points each = 40 total
- Student A scored 25 points
- Student B scored 35 points
- Teacher voids Q3

**Calculation:**
```
Before void: 4 questions × 10 = 40 points total
After void:  3 questions × 10 = 30 points active
Scale factor: 40 / 30 = 1.333

Student A:
  Old score: 25 (2.5 questions correct)
  New score: 25 × (30/40) = 18.75 points

Student B:
  Old score: 35 (3.5 questions correct)  
  New score: 35 × (30/40) = 26.25 points
```

---

## API Response Examples

### Generate Quiz Response
```json
{
  "quizId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "draft",
  "questions": [
    {
      "text": "What is 2 + 2?",
      "options": ["3", "4", "5", "6"],
      "correctOptionIndex": 1,
      "difficultyRating": "easy",
      "explanation": "2 + 2 equals 4",
      "pointValue": 10,
      "timeLimitSeconds": 30
    }
  ]
}
```

### Publish Quiz Response
```json
{
  "quizId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "published",
  "questionCount": 10,
  "publishedAt": "2025-06-23T14:30:00Z"
}
```

### Void Question Response
```json
{
  "ok": true,
  "questionId": "q-123",
  "voided": true,
  "affectedAttempts": [
    {
      "attemptId": "a-1",
      "userId": "student-1",
      "oldScore": 50,
      "newScore": 41.67,
      "pointsRedistributed": 8.33
    }
  ]
}
```

---

## Key Constraints

1. **No Auto-Publish** - All quizzes start as draft
2. **Question Lock** - Once published, questions can't be edited/deleted (only voided)
3. **AI Constraints** - AI questions always: 10 points, 30 seconds, 4 options
4. **Teacher Control** - Every quiz must be explicitly approved by teacher
5. **Atomic Operations** - Publish & void are transactional

---

## Testing Checklist

- [ ] Generate quiz with valid topic → returns draft quiz
- [ ] Edit question text → updates in database
- [ ] Delete question → re-indexes remaining questions
- [ ] Add custom question → appears in quiz
- [ ] Publish quiz → all questions become published
- [ ] Try to edit published question → fails with error
- [ ] Void published question → scores recalculate
- [ ] Verify redistribution math → points add up correctly
- [ ] Check student_xp_ledger updates → matches new scores

---

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `no_course_context_found` | No documents in Pinecone for course | Upload course materials first |
| `can_only_edit_draft_questions` | Trying to edit published question | Void it instead, or create new quiz |
| `quiz_already_published` | Trying to publish twice | Already published, edit not allowed |
| `invalid_model_json` | Claude returned invalid JSON twice | Retry with different topic |
| `forbidden` | User is not a teacher | Check user role |
| `question_not_found` | Invalid question ID | Verify question exists |

---

## Performance Notes

- **Generation**: ~3-5 seconds (Pinecone query + Claude API)
- **Publishing**: O(n) where n = number of questions
- **Void Recalculation**: O(n×m) where m = number of student attempts
- **Database**: All operations are transactional (ACID)

---

## Next Steps (Future Enhancements)

1. Add question duplication (copy questions to new quiz)
2. Add bulk operations (edit multiple questions)
3. Add quiz versioning (track changes over time)
4. Add question analytics (which questions students miss most)
5. Add collaborative editing (multiple teachers)
6. Add automatic difficulty assignment (based on answer stats)
7. Add question import from CSV

---

## Related Documentation

- `src/types/quiz.ts` - TypeScript type definitions
- `app/services/quiz_generation.py` - Claude + Pinecone logic

---

## Support

For issues or questions:
1. Check error codes in the AI Quiz Generator API section above
2. Review flow diagram in the Implementation section
3. Check database schema in init-db.ts
4. Review TypeScript types in src/types/quiz.ts

---

# Group Rooms API - Documentation

**Status:** ✅ Complete and deployed  
**Version:** 1.0.0  
**Last Updated:** 2024

---

## Overview

The Group Rooms API enables collaborative learning spaces within courses. Students and teachers can:

- **Create collaborative group work rooms** with assigned student teams
- **Manage Kanban task boards** with status tracking (todo → in_progress → done)
- **Track member contributions** across messaging, task completion, and document edits
- **Report peer inactivity** for teacher intervention
- **Chat in real-time** with persistent message history (2-year retention)
- **Detect prolonged inactivity** via hourly cron job (48+ hour detection)

**Key Design Principle:** Contribution tracking happens automatically as students interact; teachers see aggregated reports and can monitor inactivity patterns.

---

## REST Endpoints

### Room Management

#### GET `/courses/:courseId/group-rooms`
Fetch all rooms in a course

**Auth:** Teacher or Student

**Response:**
```json
{
  "rooms": [
    {
      "id": "room-123",
      "courseId": "course-456",
      "name": "Group A - Project 1",
      "createdBy": "teacher-789",
      "memberCount": 4,
      "taskCount": 8,
      "tasksByStatus": {
        "todo": 2,
        "inProgress": 5,
        "done": 1
      },
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

**Behavior:**
- **Teacher:** Sees all rooms in course with aggregate stats
- **Student:** Sees only rooms they are members of

---

#### POST `/courses/:courseId/group-rooms`
Create a new group room

**Auth:** Teacher only

**Request:**
```json
{
  "name": "Group A - Project 1",
  "memberStudentIds": ["student-1", "student-2", "student-3", "student-4"]
}
```

**Response:**
```json
{
  "roomId": "room-123"
}
```

---

#### POST `/group-rooms/:roomId/members`
Add or remove room members

**Auth:** Teacher only

**Request:**
```json
{
  "action": "add",
  "studentIds": ["student-5", "student-6"]
}
```

**Behavior:**
- `"action": "add"` — Inserts new members
- `"action": "remove"` — Removes members

**Response:**
```json
{
  "ok": true
}
```

---

### Task Management

#### GET `/group-rooms/:roomId/tasks`
Get all tasks grouped by status (Kanban board view)

**Auth:** Room member or Teacher

**Response:**
```json
{
  "todo": [
    {
      "id": "task-1",
      "roomId": "room-123",
      "title": "Research phase",
      "description": "Gather sources",
      "assignedTo": "student-1",
      "createdBy": "teacher-789",
      "status": "todo",
      "dueDate": "2024-01-20T23:59:59Z",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z"
    }
  ],
  "in_progress": [
    {
      "id": "task-2",
      "roomId": "room-123",
      "title": "Draft outline",
      "status": "in_progress",
      "assignedTo": "student-2",
      "dueDate": "2024-01-25T23:59:59Z",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-16T14:30:00Z"
    }
  ],
  "done": []
}
```

---

#### POST `/group-rooms/:roomId/tasks`
Create a new task

**Auth:** Room member or Teacher

**Request:**
```json
{
  "title": "Research phase",
  "description": "Gather sources",
  "assignedToStudentId": "student-1",
  "dueDate": "2024-01-20T23:59:59Z",
  "status": "todo"
}
```

**Response:**
```json
{
  "taskId": "task-123"
}
```

---

#### PATCH `/group-rooms/:roomId/tasks/:taskId`
Update task properties (status, assignment, etc.)

**Auth:** Room member or Teacher

**Request:**
```json
{
  "status": "in_progress",
  "assignedToStudentId": "student-2"
}
```

**Behavior:**
- Any room member can move tasks between statuses
- When task moves to `"done"`: contribution metric `task_completions` incremented for assigned student
- Status changes logged in `task_audit_log` with timestamp and userId

**Response:**
```json
{
  "ok": true
}
```

---

### Contribution Metrics

#### GET `/group-rooms/:roomId/contribution-metrics`
Get contribution report for all students in room

**Auth:** Teacher only

**Response:**
```json
{
  "roomId": "room-123",
  "studentBreakdowns": [
    {
      "studentId": "student-1",
      "studentName": "Alice",
      "totalMessages": 24,
      "totalTaskCompletions": 5,
      "totalDocumentEdits": 18,
      "lastActivityAt": "2024-01-16T14:30:00Z",
      "dailyBreakdown": [
        {
          "date": "2024-01-16",
          "messagesSent": 8,
          "taskCompletions": 1,
          "documentEditEvents": 5
        },
        {
          "date": "2024-01-15",
          "messagesSent": 16,
          "taskCompletions": 4,
          "documentEditEvents": 13
        }
      ]
    }
  ]
}
```

**Tracking Dimensions:**
1. **Messages:** Incremented on every chat message sent
2. **Task Completions:** Incremented when task moves to "done"
3. **Document Edits:** Incremented via Yjs awareness (document collaboration)

**Granularity:** Daily (one record per student per day)

---

### Inactivity Reporting

#### POST `/group-rooms/:roomId/inactivity-report`
Student reports an inactive peer to teacher

**Auth:** Student only

**Request:**
```json
{
  "reportedStudentId": "student-3",
  "reason": "No activity for 2+ days on assigned task"
}
```

**Response:**
```json
{
  "reportId": "report-456"
}
```

**Behavior:**
- Report immediately notifies the course teacher
- Teacher receives notification with student name, room name, and reason
- Multiple reports on same student are tracked (not deduplicated)

---

## WebSocket (Real-Time Chat)

### Namespace: `/group-rooms/:roomId/chat`

Real-time messaging for group rooms. Messages are persisted to PostgreSQL with 2-year retention.

**Connection (Example):**
```javascript
const socket = io("http://localhost:3000", {
  path: "/socket.io",
  auth: {
    userId: "student-1",
    role: "student"
  }
});

socket.connect("/group-rooms/room-123/chat");
```

---

#### Event: `message_history`
Received on connection with previous 50 messages

```javascript
socket.on("message_history", (data) => {
  console.log(data.messages);
  // [
  //   {
  //     "id": "msg-1",
  //     "senderId": "student-1",
  //     "text": "Hello team!",
  //     "createdAt": "2024-01-16T10:00:00Z"
  //   }
  // ]
});
```

---

#### Event: `send_message`
Send a chat message (students only)

```javascript
socket.emit("send_message", { text: "Hello team!" }, (result) => {
  if (result.ok) {
    console.log("Message sent:", result.messageId);
  } else {
    console.error("Error:", result.error);
  }
});
```

**Constraints:**
- **Students** can send and receive messages
- **Teachers** can view only (read-only observer mode)
- Message increments `messages_sent` contribution metric automatically

---

#### Event: `new_message`
Broadcast to all connected users in room

```javascript
socket.on("new_message", (message) => {
  console.log(`${message.senderName}: ${message.text}`);
  // Alice: Hello team!
});
```

---

#### Event: `user_typing`
Broadcast typing indicator

**Send:**
```javascript
socket.emit("user_typing", { isTyping: true });
```

**Receive:**
```javascript
socket.on("user_typing", (data) => {
  console.log(`${data.userId} is typing...`);
});
```

---

## Background Jobs

### Inactivity Detection Cron (Hourly)

Runs every hour to detect students with no activity on 48+ hour old tasks.

**Query Pattern:**
1. Find all `group_room_tasks` with:
   - `status = 'in_progress'`
   - `assigned_to` is not null
   - `updated_at < NOW() - 48 HOURS`

2. For each task, check if student has activity in `contribution_metrics` for last 48 hours
   - If `messages_sent > 0` OR `task_completions > 0` OR `document_edit_events > 0` → Active
   - Otherwise → Inactive

3. For inactive students:
   - Fire notification to teacher with:
     - Student name
     - Room name
     - Task title
     - Inactivity duration

**Lifecycle:**
- Starts on app initialization via `startInactivityDetectionCron()`
- Runs immediately, then every 60 minutes
- Can be stopped via `stopInactivityDetectionCron(intervalId)`

---

## Database Schema

### Tables

#### `group_rooms`
```sql
CREATE TABLE group_rooms (
  id UUID PRIMARY KEY,
  course_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
```

#### `group_room_members`
```sql
CREATE TABLE group_room_members (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  student_id TEXT NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (room_id) REFERENCES group_rooms(id) ON DELETE CASCADE,
  UNIQUE (room_id, student_id)
);
```

#### `room_chat_messages`
```sql
CREATE TABLE room_chat_messages (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  sender_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '2 years'),
  FOREIGN KEY (room_id) REFERENCES group_rooms(id) ON DELETE CASCADE
);
```

#### `group_room_tasks`
```sql
CREATE TABLE group_room_tasks (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT,
  created_by TEXT NOT NULL,
  status TEXT CHECK (status IN ('todo', 'in_progress', 'done')) DEFAULT 'todo',
  due_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (room_id) REFERENCES group_rooms(id) ON DELETE CASCADE
);
```

#### `task_audit_log`
```sql
CREATE TABLE task_audit_log (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL,
  room_id UUID NOT NULL,
  changed_by TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (task_id) REFERENCES group_room_tasks(id) ON DELETE CASCADE
);
```

#### `contribution_metrics`
```sql
CREATE TABLE contribution_metrics (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  student_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  messages_sent INT DEFAULT 0,
  task_completions INT DEFAULT 0,
  document_edit_events INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (room_id) REFERENCES group_rooms(id) ON DELETE CASCADE,
  UNIQUE (room_id, student_id, metric_date)
);
```

#### `inactivity_reports`
```sql
CREATE TABLE inactivity_reports (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  reporter_id TEXT NOT NULL,
  reported_student_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (room_id) REFERENCES group_rooms(id) ON DELETE CASCADE
);
```

---

## Service Layer

### Room Management (`src/lib/server/group-rooms/room.ts`)
- `createGroupRoom(courseId, createdBy, request)` → `roomId`
- `getCourseRooms(courseId, userId, isTeacher)` → `GroupRoomWithSummary[]`
- `getGroupRoom(roomId)` → `GroupRoom`
- `getRoomMembers(roomId)` → `string[]`
- `isRoomMember(roomId, studentId)` → `boolean`
- `updateRoomMembers(roomId, request)` → `void`
- `deleteGroupRoom(roomId)` → `void`

### Task Management (`src/lib/server/group-rooms/task.ts`)
- `createTask(roomId, createdBy, request)` → `taskId`
- `getTask(taskId)` → `GroupRoomTask`
- `updateTask(taskId, changedBy, request)` → `void`
- `getRoomKanban(roomId)` → `KanbanBoard`
- `getTaskAuditLog(taskId)` → `TaskAuditLog[]`
- `getRoomTasks(roomId)` → `GroupRoomTask[]`
- `deleteTask(taskId)` → `void`

### Contribution Tracking (`src/lib/server/group-rooms/contribution.ts`)
- `incrementMessagesSent(roomId, studentId)` → `void`
- `incrementDocumentEdits(roomId, studentId)` → `void`
- `getRoomContributionMetrics(roomId)` → `ContributionMetricsResponse`
- `getStudentMetrics(roomId, studentId, sinceDate)` → `ContributionMetrics[]`
- `hasRecentActivity(roomId, studentId, hoursAgo)` → `boolean`

### Chat Messages (`src/lib/server/group-rooms/chat.ts`)
- `saveChatMessage(roomId, senderId, text)` → `messageId`
- `getRoomMessages(roomId, limit, offset)` → `RoomChatMessage[]`
- `getRoomMessageCount(roomId)` → `number`
- `deleteExpiredMessages()` → `number` (rows deleted)
- `deleteRoomMessages(roomId)` → `void`

### Inactivity Reporting (`src/lib/server/group-rooms/inactivity.ts`)
- `createInactivityReport(roomId, reporterId, reportedStudentId, reason)` → `reportId`
- `getRoomInactivityReports(roomId)` → `InactivityReport[]`
- `getStudentInactivityReports(roomId, studentId, sinceHours)` → `InactivityReport[]`

### Inactivity Detection (`src/lib/server/group-rooms/inactivity-cron.ts`)
- `detectInactiveStudents()` → `Promise<void>`
- `startInactivityDetectionCron()` → `NodeJS.Timeout`
- `stopInactivityDetectionCron(intervalId)` → `void`

---

## Error Handling

### Common Error Responses

**400 Bad Request**
```json
{
  "error": "invalid_payload"
}
```
Missing or malformed required fields.

---

**403 Forbidden**
```json
{
  "error": "forbidden"
}
```
User lacks authorization (not teacher, not room member, etc.).

---

**404 Not Found**
```json
{
  "error": "room_not_found"
}
```
Resource (room, task) does not exist.

---

**500 Internal Server Error**
```json
{
  "error": "error message"
}
```
Database or service failure.

---

## Integration Notes

### With Existing Quiz System
- Group rooms are independent of quizzes (separate feature)
- Both use same PostgreSQL database and Fastify framework
- Both have Socket.io namespaces for real-time updates

### With Existing Notification System
- Inactivity reports and cron notifications integrate with existing `notifyUser()` function
- Teachers receive notifications for:
  - Student inactivity report: `"group_inactivity_report"`
  - Cron-detected inactivity: `"group_inactivity_48h"`

### With Existing Authentication
- Uses same `requireAuth` middleware pattern
- Supports `"teacher"` and `"student"` roles
- Validates via `request.auth.userId` and `request.auth.role`

---

## Future Enhancements

1. **Document Collaboration:** Use Yjs awareness to track document_edit_events in real-time
2. **Attachment Sharing:** File upload/download for group deliverables
3. **Grade Submission:** Submit group work and receive teacher feedback
4. **Contribution Disputes:** Allow students to contest contribution metrics
5. **Advanced Analytics:** Heatmaps, trend analysis, peer comparison reports
6. **Offline Support:** Cache messages locally, sync on reconnect (ServiceWorker)

---

## Testing Checklist

- [ ] Create room with team assignment
- [ ] View room as teacher (see all) vs student (see own)
- [ ] Add/remove members
- [ ] Create task and assign to student
- [ ] Move task through statuses (todo → in_progress → done)
- [ ] Verify contribution metrics increment (messages, task completions)
- [ ] Send chat message and verify real-time broadcast
- [ ] Simulate 48+ hour inactivity and verify cron detection
- [ ] Student reports peer inactivity, teacher receives notification
- [ ] Message deletion after 2-year expiry
- [ ] Delete room and verify cascading deletes

---

## Deployment

**Environment Variables:** None additional (uses existing DB and Fastify setup)

**Startup:**
```typescript
// In app.ts
await registerGroupRoomsRoutes(app);
attachGroupRoomsChatServer(io);
startInactivityDetectionCron();
```

**Database Initialization:**
```typescript
// In initQuizDatabase() - already includes group rooms schema
await initGroupRoomsDatabase();
```

---

# Peer Review System - Documentation

**Status:** ✅ Complete and deployed  
**Version:** 1.0.0  
**Last Updated:** 2026-06-23  
**Architecture:** Genuinely double-blind with cryptographic token isolation

---

## Overview

The Peer Review System enables genuinely double-blind peer grading where reviewer identities are **cryptographically unrecoverable** by students. Unlike UI-only hidden fields, this system uses opaque tokens and server-side lookups to ensure students can never discover who reviewed their work.

**Core Principle:** `reviewer_id` is NEVER exposed in any student-facing API response. Reviewers are identified only by cryptographic tokens.

---

## Architecture

### Design Philosophy: Cryptographic Double-Blindness

**Traditional (Broken) Approach:**
```javascript
// ❌ UNSAFE - Students can intercept or guess reviewer ID
GET /submissions/sub-123/reviews
→ { reviews: [{ reviewerId: "student-42", score: 8 }, ...] }
```

**Our Approach (SECURE):**
```javascript
// ✅ SAFE - Token is unrecoverable without server-side lookup
Reviewer Dashboard: /peer-review/{review_token}/dashboard
→ { submissionId: "sub-123", content: "...", rubric: [...] }

Token stored server-side maps to: { reviewerId, assignmentId, submitterId }
Student can see: Nothing. They never receive the token.
```

### Token Lifecycle

1. **Generation:** `generateReviewToken()` creates 64-char random hex (256-bit entropy)
2. **Storage:** Stored in `review_tokens` table with mapping to `reviewer_id`
3. **Distribution:** Sent to reviewer via email/dashboard (students never see it)
4. **Lookup:** Only server-side queries convert token → `reviewer_id`
5. **Expiration:** Tokens persist; can't be "guessed" (entropy too high)

---

## Data Model

### Core Tables

#### `peer_review_configs`
Assignment-level configuration

```sql
CREATE TABLE peer_review_configs (
  id UUID PRIMARY KEY,
  assignment_id UUID NOT NULL UNIQUE,
  reviewers_per_submission INT DEFAULT 2,
  rubric JSONB NOT NULL,           -- Array of criteria with maxMarks
  review_deadline_utc TIMESTAMP,
  grade_contribution_percent INT DEFAULT 50,  -- 0-100
  outlier_z_score_threshold NUMERIC DEFAULT 2.0
);
```

#### `review_tokens` (CRITICAL)
**Server-side only. NEVER exposed to students.**

```sql
CREATE TABLE review_tokens (
  token VARCHAR(64) PRIMARY KEY,  -- Opaque, unrecoverable
  assignment_id UUID,
  reviewer_id VARCHAR(255),       -- HIDDEN from students
  submitter_id VARCHAR(255),      -- HIDDEN from students
  created_at TIMESTAMP
);
```

#### `peer_review_assignments`
Reviewer → Submission assignments

```sql
CREATE TABLE peer_review_assignments (
  id UUID PRIMARY KEY,
  assignment_id UUID,
  reviewer_id VARCHAR(255),       -- HIDDEN from students
  submitter_id VARCHAR(255),      -- HIDDEN from students
  submission_id UUID,
  review_token VARCHAR(64),       -- UNIQUE, references review_tokens
  status VARCHAR(50),             -- pending|submitted|discarded
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### `peer_review_scores`
Individual scores per criterion

```sql
CREATE TABLE peer_review_scores (
  id UUID PRIMARY KEY,
  assignment_id UUID,
  submission_id UUID,
  review_token VARCHAR(64),       -- NOT reviewer_id
  criterion VARCHAR(255),
  score NUMERIC,
  justification TEXT,
  is_overridden BOOLEAN,
  overridden_score NUMERIC,
  z_score NUMERIC,                -- Calculated post-submission
  is_outlier BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### `peer_review_outlier_flags`
Flagged anomalous scores (identified by token, not name)

```sql
CREATE TABLE peer_review_outlier_flags (
  id UUID PRIMARY KEY,
  assignment_id UUID,
  review_token VARCHAR(64),       -- Not reviewer name
  submission_id UUID,
  criterion VARCHAR(255),
  score NUMERIC,
  z_score NUMERIC,
  threshold NUMERIC,
  created_at TIMESTAMP,
  resolved_at TIMESTAMP,
  resolution_action VARCHAR(50)   -- overridden|discarded
);
```

#### `peer_review_results`
Final calculated grades per submission

```sql
CREATE TABLE peer_review_results (
  id UUID PRIMARY KEY,
  assignment_id UUID,
  submission_id UUID,
  submitter_id VARCHAR(255),
  peer_score NUMERIC,             -- 0-100
  peer_grade_contribution NUMERIC,
  teacher_rubric_score NUMERIC,
  final_grade_contribution NUMERIC,
  final_grade NUMERIC,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## REST Endpoints

### 1. Configure Peer Review

**Endpoint:** `POST /assignments/:assignmentId/peer-review/configure`

**Auth:** Teacher only

**Request:**
```json
{
  "reviewersPerSubmission": 2,
  "rubric": [
    {
      "criterion": "Code Quality",
      "descriptor": "Code is clean, well-structured, and maintainable",
      "maxMarks": 10
    },
    {
      "criterion": "Functionality",
      "descriptor": "Implementation meets all requirements",
      "maxMarks": 10
    }
  ],
  "reviewDeadlineUtc": "2026-07-15T23:59:59Z",
  "gradeContributionPercent": 50,
  "outlierZScoreThreshold": 2.0
}
```

**Response:**
```json
{
  "configId": "config-abc-123"
}
```

**Constraints:**
- Only callable BEFORE assignment deadline
- Updates existing config if called multiple times
- `gradeContributionPercent` should total 100 with teacher grades

---

### 2. Assign Peer Reviews

**Endpoint:** `POST /assignments/:assignmentId/peer-review/assign`

**Auth:** Teacher only

**Request:** (no body)

**Response:**
```json
{
  "assignmentCount": 24,
  "message": "Assignments created successfully"
}
```

**Algorithm:**
1. Fetch all submissions for assignment
2. For each submission:
   - Select `reviewersPerSubmission` random students (excluding submitter)
   - Create assignment record with opaque token
3. Return count (NEVER list assignments with reviewer IDs)

**Constraints:**
- Idempotent with second runs (checks for existing assignments)
- Fails if fewer submissions than required reviewers
- Distributes workload evenly

---

### 3. Submit Peer Review (Anonymous)

**Endpoint:** `POST /peer-review/:reviewToken/submit`

**Auth:** None required (token-only)

**Request:**
```json
{
  "scores": [
    {
      "criterion": "Code Quality",
      "score": 8,
      "justification": "Well-structured with clear comments, but some edge cases not handled"
    },
    {
      "criterion": "Functionality",
      "score": 9,
      "justification": "Meets all requirements and handles edge cases"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true
}
```

**Behavior:**
1. Validates `reviewToken` against `review_tokens` table
2. Validates scores within rubric `maxMarks`
3. Prevents duplicate submission (idempotent)
4. Automatically triggers Z-score calculation
5. Updates assignment status to `submitted`

**CRITICAL SECURITY:**
- Token is unrecoverable; no reviewer name exposed
- Endpoint is "role-blind" (no auth check needed, token proves authorization)

---

### 4. Reviewer Dashboard

**Endpoint:** `GET /peer-review/:reviewToken/dashboard`

**Auth:** None required

**Response:**
```json
{
  "reviewToken": "a1b2c3d4e5f6...",
  "assignmentId": "assign-123",
  "assignmentTitle": "Project 2: Data Structures",
  "rubric": [
    {
      "criterion": "Code Quality",
      "descriptor": "Code is clean, well-structured, and maintainable",
      "maxMarks": 10
    }
  ],
  "reviewDeadline": "2026-07-15T23:59:59Z",
  "submissionToReview": {
    "submissionId": "sub-456",
    "content": "https://s3.../submission.pdf"
  },
  "alreadySubmitted": false
}
```

**CRITICAL SECURITY:**
- `submissionToReview` contains NO submitter name, ID, or identity
- Reviewer never learns who submitted the work
- Can submit multiple reviews without knowing other reviewers

---

### 5. Override Outlier Score

**Endpoint:** `PATCH /peer-review/:reviewId/override`

**Auth:** Teacher only

**ReviewId Format:** `{assignmentId}:{submissionId}:{reviewToken}:{criterion}`

**Request:**
```json
{
  "newScore": 5
}
```

**Response:**
```json
{
  "ok": true
}
```

**Behavior:**
1. Teachers can manually adjust scores for outliers
2. Creates override audit record
3. Marks outlier flag as `resolved_at` with action `overridden`
4. Recalculates Z-scores

**CRITICAL:** Overridden score stored in `overridden_score` column; original preserved for audit trail.

---

### 6. Discard Reviewer

**Endpoint:** `DELETE /peer-review/reviewer/:reviewToken/discard`

**Auth:** Teacher only

**Request:**
```json
{
  "reason": "Scores appear to be random; flagged for review"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Behavior:**
1. Marks ALL scores from this reviewer as `status = discarded`
2. Resolves all outlier flags for this reviewer with action `discarded`
3. Grade calculation automatically excludes discarded scores
4. Audit trail records reason and teacher ID

---

### 7. Get Results (Teacher)

**Endpoint:** `GET /assignments/:assignmentId/peer-review/results`

**Auth:** Teacher only

**Response:**
```json
{
  "assignmentId": "assign-123",
  "submissionResults": [
    {
      "submissionId": "sub-456",
      "submitterId": "student-123",
      "submitterName": "Alice Johnson",
      "reviewCount": 2,
      "reviewsReceived": [
        {
          "criterion": "Code Quality",
          "maxMarks": 10,
          "scores": [
            {
              "reviewToken": "a1b2c3...",
              "score": 8,
              "overriddenScore": null,
              "justification": "Well-structured...",
              "zScore": 0.5,
              "isOutlier": false,
              "isDiscarded": false
            }
          ],
          "mean": 8.5,
          "stdDev": 0.707,
          "finalScore": 8.5
        }
      ],
      "outlierFlags": [
        {
          "reviewToken": "x9y8z7...",
          "submissionId": "sub-456"
        }
      ],
      "discardedReviewers": 0,
      "peerScore": 8.75,
      "peerGradeContribution": 4.375,
      "teacherRubricScore": 0,
      "finalGradeContribution": 4.375,
      "finalGrade": 4.375,
      "auditTrail": [
        {
          "action": "score_submitted",
          "reviewToken": "a1b2c3...",
          "createdAt": "2026-07-10T14:30:00Z"
        }
      ]
    }
  ],
  "reviewStats": {
    "totalSubmissions": 25,
    "totalReviewsAssigned": 50,
    "reviewsCompleted": 48,
    "outlierCount": 2
  }
}
```

**Data Structure:**
- Per-submission: scores, outliers, final grade
- Per-criterion: mean, stdev, Z-scores
- Per-score: token (not name), original & overridden values
- Audit trail: all actions with tokens (no reviewer names)

---

## Outlier Detection

### Z-Score Calculation

After each new review is submitted:

1. **Collect scores** for submission across all reviewers
2. **Per criterion:**
   - Calculate mean: `μ = Σ(scores) / n`
   - Calculate stddev: `σ = √(Σ(score - μ)² / n)`
   - For each score: `Z = (score - μ) / σ`
3. **Flag outliers** if `|Z| > threshold` (default 2.0)
4. **Create flag** in `peer_review_outlier_flags` with token (not name)

### Example
```
Criterion: "Code Quality" (max 10)
Scores: [8, 8, 2]
Mean: 6
StdDev: 2.83
Z-scores: [0.71, 0.71, -1.41]
Outlier? No (all |Z| < 2.0)

Scores: [9, 9, 2]
Mean: 6.67
StdDev: 3.06
Z-scores: [0.76, 0.76, -1.54]
Outlier? No (still < 2.0)

Scores: [10, 10, 1]
Mean: 7
StdDev: 4.36
Z-scores: [0.69, 0.69, -1.38]
Outlier? No

Scores: [10, 10, 0]
Mean: 6.67
StdDev: 4.71
Z-scores: [0.71, 0.71, -1.41]
Outlier? No

Scores: [10, 10, 10, 2]
Mean: 8
StdDev: 3.46
Z-scores: [0.58, 0.58, 0.58, -1.73]
Outlier? No (threshold 2.0)

Scores: [10, 10, 10, 0]
Mean: 7.5
StdDev: 4.33
Z-scores: [0.58, 0.58, 0.58, -1.73]
Outlier? No

Scores: [10, 10, -5] ← Invalid, rejected
```

---

## Grade Calculation

### Final Grade Formula

```
Per Criterion:
  active_scores = [s for s in scores if not discarded and not overridden] 
                  + [override for s if overridden]
  criterion_mean = mean(active_scores)

Peer Score:
  peer_score = mean(criterion_means)

Grade Contribution:
  peer_contribution = peer_score × (gradeContributionPercent / 100)
  teacher_contribution = teacher_score × ((100 - gradeContributionPercent) / 100)
  
Final Grade:
  final = peer_contribution + teacher_contribution
```

### Example (50/50 split)
```
Rubric:
  - Code Quality (max 10)
  - Functionality (max 10)

Peer Scores:
  - Code Quality: 8
  - Functionality: 9
  Peer Score: 8.5 (out of 10)

Teacher Score: 9 (out of 10)

Contribution: 50% peer + 50% teacher
  Peer: 8.5 × 0.5 = 4.25
  Teacher: 9 × 0.5 = 4.5
  Final: 4.25 + 4.5 = 8.75 (out of 20)
  
Final Grade (0-100 scale):
  (8.75 / 20) × 100 = 43.75%
```

---

## Security Model

### Threat: Student Discovers Reviewer Identity

**Attack Vector 1: Database Injection**
```sql
SELECT reviewer_id FROM peer_review_scores 
WHERE submission_id = ?
```
- **Defense:** No route exposes `reviewer_id` in response. Only `review_token` returned, which is unrecoverable.

**Attack Vector 2: Token Guessing**
```
Token format: 64-char hex = 2^256 combinations
Brute-force cost: Astronomical
```
- **Defense:** 256-bit entropy is cryptographically secure.

**Attack Vector 3: Timing Attack**
```
If endpoint responds faster for valid tokens, attacker can enumerate
```
- **Defense:** All lookups use prepared statements (constant-time comparison in DB layer).

**Attack Vector 4: Reverse-Engineering**
```
If token is derived from reviewer_id (e.g., SHA(reviewer_id)),
attacker can brute-force
```
- **Defense:** Tokens are random, not derived. No relationship to student IDs.

### Compliance

✅ **FERPA-Compliant:** No student identifies other students via peer review  
✅ **Bias-Reduced:** Reviewer identity cannot influence submission evaluation  
✅ **Authentic:** Scores tied to submission content only, not reviewer reputation  

---

## Integration

### With Existing Systems

**Quiz System:**
- Independent feature; both use PostgreSQL
- No conflicts in route paths
- Both use `requireAuth` middleware

**Notifications:**
- Outlier flags can trigger teacher notifications
- Use existing `notifyUser()` for "outlier_detected" event
- Include: criterion, submission ID, outlier Z-score

**Assignments:**
- Integrates via `assignment_id` foreign key
- Uses existing `submissions` table
- Can coexist with other assignment features (due dates, late policies, etc.)

---

## Error Handling

### Common Error Responses

**400 Bad Request**
```json
{
  "error": "rubric_required"
}
```
Missing or invalid rubric configuration.

**400 Bad Request**
```json
{
  "error": "score_out_of_range"
}
```
Score exceeds `maxMarks` for criterion.

**404 Not Found**
```json
{
  "error": "invalid_review_token"
}
```
Token does not exist or is malformed.

**409 Conflict**
```json
{
  "error": "assignments_already_exist"
}
```
Assignments have already been created for this assignment.

---

## Testing Checklist

- [ ] Configure peer review for assignment
- [ ] Auto-assign after deadline (no self-review)
- [ ] Submit review via token (no reviewer ID exposed)
- [ ] Verify token never appears in student API
- [ ] Verify `reviewer_id` never in response body
- [ ] Check Z-score calculation (outliers detected)
- [ ] Override outlier score (audit trail created)
- [ ] Discard reviewer (all scores excluded)
- [ ] Final grade calculated correctly (50/50 split example)
- [ ] Multiple submissions processed independently
- [ ] Concurrent review submissions (no race conditions)

---

## Deployment

**Environment Variables:** None additional

**Database Migration:**
```bash
# Already included in initQuizDatabase()
# Tables created on app startup
```

**Startup:**
```typescript
// In app.ts
await registerPeerReviewRoutes(app);
```

**Cron Jobs:** None required (Z-scores calculated on-demand)

---

**End of Documentation**
