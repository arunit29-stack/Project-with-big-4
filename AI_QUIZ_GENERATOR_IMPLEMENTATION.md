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
