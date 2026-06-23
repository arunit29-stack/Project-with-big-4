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
