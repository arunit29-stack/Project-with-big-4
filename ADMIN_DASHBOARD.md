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
