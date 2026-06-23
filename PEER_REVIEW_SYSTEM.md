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
