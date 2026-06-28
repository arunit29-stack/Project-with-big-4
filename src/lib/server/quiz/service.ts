/* eslint-disable */
import { randomUUID } from "crypto";
import { getPostgresPool } from "../db/postgres";
import { getQuizState, setQuizState, getActiveSession, setActiveSession } from "./redis-state";
import type {
  AiGeneratedQuestion,
  EditQuestionRequest,
  AddQuestionRequest,
  VoidQuestionResponse,
} from "../../../types/quiz";

export interface QuestionInput {
  type: "mcq" | "true_false" | "short_answer";
  text: string;
  options?: string[];
  correctOptionIndex?: number;
  explanation?: string;
  pointValue?: number; // 1-100, default 10
  timeLimitSeconds?: number; // 10-120, default 30;
}

export interface QuizInput {
  title: string;
  questions: QuestionInput[];
}

export async function createQuiz(courseId: string, input: QuizInput): Promise<string> {
  const pool = getPostgresPool();
  const quizId = randomUUID();

  // Validate questions
  for (const q of input.questions) {
    if (!["mcq", "true_false", "short_answer"].includes(q.type)) {
      throw new Error(`Invalid question type: ${q.type}`);
    }
    const pt = q.pointValue ?? 10;
    if (pt < 1 || pt > 100) {
      throw new Error(`pointValue must be between 1 and 100, got ${pt}`);
    }
    const limit = q.timeLimitSeconds ?? 30;
    if (limit < 10 || limit > 120) {
      throw new Error(`timeLimitSeconds must be between 10 and 120, got ${limit}`);
    }
  }

  // Insert quiz and questions
  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO quizzes (id, course_id, title) VALUES ($1, $2, $3)`,
      [quizId, courseId, input.title]
    );

    for (let i = 0; i < input.questions.length; i++) {
      const q = input.questions[i];
      await pool.query(
        `INSERT INTO quiz_questions (
          id, quiz_id, type, text, options, correct_option_index, explanation, point_value, time_limit_seconds, question_index
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          randomUUID(),
          quizId,
          q.type,
          q.text,
          q.options ? JSON.stringify(q.options) : null,
          q.correctOptionIndex ?? null,
          q.explanation ?? null,
          q.pointValue ?? 10,
          q.timeLimitSeconds ?? 30,
          i,
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

export async function getQuizQuestions(quizId: string) {
  const pool = getPostgresPool();
  const res = await pool.query(
    `SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY question_index ASC`,
    [quizId]
  );
  return res.rows;
}

export async function logIntegrityFlag(quizId: string, userId: string, userAgent: string, ip: string) {
  const pool = getPostgresPool();
  await pool.query(
    `INSERT INTO quiz_integrity_log (id, quiz_id, user_id, timestamp, user_agent, ip_address)
     VALUES ($1, $2, $3, NOW(), $4, $5)`,
    [randomUUID(), quizId, userId, userAgent, ip]
  );
}

export async function getOrCreateAttempt(quizId: string, userId: string, attemptId: string, userAgent: string, ip: string): Promise<string> {
  const pool = getPostgresPool();
  const activeSession = await getActiveSession(quizId, userId);

  if (activeSession && activeSession !== attemptId) {
    await logIntegrityFlag(quizId, userId, userAgent, ip);
    throw new Error("duplicate_device");
  }

  if (!activeSession) {
    await setActiveSession(quizId, userId, attemptId);
  }

  // Ensure record in DB
  const attemptRes = await pool.query(
    `SELECT id FROM quiz_attempts WHERE id = $1 LIMIT 1`,
    [attemptId]
  );
  if (attemptRes.rowCount === 0) {
    await pool.query(
      `INSERT INTO quiz_attempts (id, quiz_id, user_id, status, score, started_at)
       VALUES ($1, $2, $3, 'started', 0, NOW())`,
      [attemptId, quizId, userId]
    );
  }

  return attemptId;
}

export async function saveAnswer(
  quizId: string,
  attemptId: string,
  userId: string,
  questionId: string,
  selectedOption: string,
  timeRemainingSeconds: number,
  userAgent: string,
  ip: string
) {
  const pool = getPostgresPool();
  const activeSession = await getActiveSession(quizId, userId);

  if (activeSession && activeSession !== attemptId) {
    await logIntegrityFlag(quizId, userId, userAgent, ip);
    throw new Error("duplicate_device");
  }

  // Get question details to assess correctness
  const qRes = await pool.query(
    `SELECT * FROM quiz_questions WHERE id = $1 LIMIT 1`,
    [questionId]
  );
  if (qRes.rowCount === 0) {
    throw new Error("question_not_found");
  }
  const question = qRes.rows[0];

  let isCorrect = false;
  if (question.type === "mcq" || question.type === "true_false") {
    isCorrect = Number(selectedOption) === question.correct_option_index;
  } else if (question.type === "short_answer") {
    // case-insensitive trimmed match
    const correctText = question.explanation || "";
    isCorrect = selectedOption.trim().toLowerCase() === correctText.trim().toLowerCase();
  }

  const speedMultiplier = timeRemainingSeconds >= (question.time_limit_seconds / 2) ? 1.5 : 1.0;
  const pointsAwarded = isCorrect ? question.point_value * speedMultiplier : 0;

  await pool.query(
    `INSERT INTO quiz_attempt_answers (
      id, attempt_id, question_id, selected_option, submitted_at, time_remaining_seconds, is_correct, points_awarded
     ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)
     ON CONFLICT (attempt_id, question_id) DO UPDATE SET
      selected_option = EXCLUDED.selected_option,
      submitted_at = NOW(),
      time_remaining_seconds = EXCLUDED.time_remaining_seconds,
      is_correct = EXCLUDED.is_correct,
      points_awarded = EXCLUDED.points_awarded`,
    [
      randomUUID(),
      attemptId,
      questionId,
      selectedOption,
      timeRemainingSeconds,
      isCorrect,
      pointsAwarded,
    ]
  );

  return { isCorrect, pointsAwarded };
}

export async function finishQuizScoring(quizId: string) {
  const pool = getPostgresPool();
  
  // Get course_id
  const quizRes = await pool.query(`SELECT course_id FROM quizzes WHERE id = $1 LIMIT 1`, [quizId]);
  if (quizRes.rowCount === 0) return;
  const courseId = quizRes.rows[0].course_id;

  // Find all started attempts for this quiz
  const attemptsRes = await pool.query(
    `SELECT id, user_id FROM quiz_attempts WHERE quiz_id = $1 AND status = 'started'`,
    [quizId]
  );

  for (const attempt of attemptsRes.rows) {
    const attemptId = attempt.id;
    const userId = attempt.user_id;

    // Get the answers for this attempt (ignoring voided questions)
    const scoreRes = await pool.query(
      `SELECT COALESCE(SUM(a.points_awarded), 0)::numeric AS total_score
       FROM quiz_attempt_answers a
       JOIN quiz_questions q ON a.question_id = q.id
       WHERE a.attempt_id = $1 AND q.voided = FALSE`,
      [attemptId]
    );
    const score = Number(scoreRes.rows[0]?.total_score ?? 0);

    // Update attempt status to completed
    await pool.query(
      `UPDATE quiz_attempts
       SET status = 'completed', score = $2, completed_at = NOW()
       WHERE id = $1`,
      [attemptId, score]
    );

    // Store in student_xp_ledger
    await pool.query(
      `INSERT INTO student_xp_ledger (id, user_id, course_id, quiz_id, xp_amount, earned_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [randomUUID(), userId, courseId, quizId, Math.round(score)]
    );
  }
}

export async function voidQuestionAndRecalculate(quizId: string, questionId: string) {
  const pool = getPostgresPool();

  await pool.query("BEGIN");
  try {
    // 1. Mark question as voided
    await pool.query(
      `UPDATE quiz_questions SET voided = TRUE WHERE id = $1 AND quiz_id = $2`,
      [questionId, quizId]
    );

    // 2. Fetch all active questions and their initial point values
    const questionsRes = await pool.query(
      `SELECT id, point_value, voided FROM quiz_questions WHERE quiz_id = $1`,
      [quizId]
    );
    const allQuestions = questionsRes.rows;
    const activeQuestions = allQuestions.filter(q => !q.voided);
    const voidedQuestions = allQuestions.filter(q => q.voided);

    const totalInitialPoints = allQuestions.reduce((sum, q) => sum + q.point_value, 0);
    const activeInitialPoints = activeQuestions.reduce((sum, q) => sum + q.point_value, 0);

    // 3. For each student attempt, recalculate their points
    const attemptsRes = await pool.query(
      `SELECT id, user_id FROM quiz_attempts WHERE quiz_id = $1`,
      [quizId]
    );

    for (const attempt of attemptsRes.rows) {
      const attemptId = attempt.id;

      // Recalculate each non-voided answer's awarded points.
      // Redistribution ratio: totalInitialPoints / activeInitialPoints
      const scale = activeInitialPoints > 0 ? (totalInitialPoints / activeInitialPoints) : 0;

      // Get answers for the attempt
      const answersRes = await pool.query(
        `SELECT a.id, a.question_id, a.is_correct, a.time_remaining_seconds, q.point_value, q.time_limit_seconds
         FROM quiz_attempt_answers a
         JOIN quiz_questions q ON a.question_id = q.id
         WHERE a.attempt_id = $1`,
        [attemptId]
      );

      let totalScore = 0;

      for (const ans of answersRes.rows) {
        const isVoided = voidedQuestions.some(vq => vq.id === ans.question_id);
        if (isVoided) {
          // Voided answer gets 0 points
          await pool.query(
            `UPDATE quiz_attempt_answers SET points_awarded = 0 WHERE id = $1`,
            [ans.id]
          );
        } else {
          // Recalculate correct answer with proportional points
          if (ans.is_correct) {
            const speedMultiplier = ans.time_remaining_seconds >= (ans.time_limit_seconds / 2) ? 1.5 : 1.0;
            const originalPoints = ans.point_value * speedMultiplier;
            const redistributedPoints = originalPoints * scale;
            totalScore += redistributedPoints;

            await pool.query(
              `UPDATE quiz_attempt_answers SET points_awarded = $2 WHERE id = $1`,
              [ans.id, redistributedPoints]
            );
          } else {
            await pool.query(
              `UPDATE quiz_attempt_answers SET points_awarded = 0 WHERE id = $1`,
              [ans.id]
            );
          }
        }
      }

      // Update quiz_attempts score
      await pool.query(
        `UPDATE quiz_attempts SET score = $2 WHERE id = $1`,
        [attemptId, totalScore]
      );

      // Update student_xp_ledger
      await pool.query(
        `UPDATE student_xp_ledger SET xp_amount = $3 WHERE user_id = $1 AND quiz_id = $2`,
        [attempt.user_id, quizId, Math.round(totalScore)]
      );
    }

    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}

/**
 * Create an AI-generated quiz with draft questions
 * @param courseId Course ID
 * @param title Quiz title (e.g., generated from topic)
 * @param aiQuestions Questions generated by Claude
 * @returns Quiz ID
 */
export async function createAiQuiz(
  courseId: string,
  title: string,
  aiQuestions: AiGeneratedQuestion[]
): Promise<string> {
  const pool = getPostgresPool();
  const quizId = randomUUID();

  await pool.query("BEGIN");
  try {
    // Create quiz with draft status
    await pool.query(
      `INSERT INTO quizzes (id, course_id, title, status)
       VALUES ($1, $2, $3, 'draft')`,
      [quizId, courseId, title]
    );

    // Insert all AI-generated questions with draft status
    for (let i = 0; i < aiQuestions.length; i++) {
      const q = aiQuestions[i];
      await pool.query(
        `INSERT INTO quiz_questions (
          id, quiz_id, type, text, options, correct_option_index, explanation,
          point_value, time_limit_seconds, question_index, status, generated_by_ai
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', true)`,
        [
          randomUUID(),
          quizId,
          "mcq",
          q.questionText,
          JSON.stringify(q.options),
          q.correctOptionIndex,
          q.explanation,
          q.pointValue,
          q.timeLimitSeconds,
          i,
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

/**
 * Edit a draft question
 * Only allows editing if question status is 'draft'
 */
export async function editQuestion(
  questionId: string,
  edit: EditQuestionRequest
): Promise<void> {
  const pool = getPostgresPool();

  // Check if question is draft
  const qRes = await pool.query(
    `SELECT status FROM quiz_questions WHERE id = $1`,
    [questionId]
  );
  if (qRes.rowCount === 0) {
    throw new Error("question_not_found");
  }
  if (qRes.rows[0].status !== "draft") {
    throw new Error("can_only_edit_draft_questions");
  }

  const updates: string[] = [];
  const values: (string | number | string[] | null)[] = [];
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

  if (edit.correctOptionIndex !== undefined) {
    updates.push(`correct_option_index = $${paramCount}`);
    values.push(edit.correctOptionIndex);
    paramCount++;
  }

  if (edit.explanation !== undefined) {
    updates.push(`explanation = $${paramCount}`);
    values.push(edit.explanation);
    paramCount++;
  }

  if (edit.pointValue !== undefined) {
    updates.push(`point_value = $${paramCount}`);
    values.push(edit.pointValue);
    paramCount++;
  }

  if (edit.timeLimitSeconds !== undefined) {
    updates.push(`time_limit_seconds = $${paramCount}`);
    values.push(edit.timeLimitSeconds);
    paramCount++;
  }

  // Always update updated_at
  updates.push(`updated_at = NOW()`);

  if (updates.length > 1 || values.length > 0) {
    values.push(questionId);
    const sql = `UPDATE quiz_questions SET ${updates.join(", ")} WHERE id = $${paramCount}`;
    await pool.query(sql, values);
  }
}

/**
 * Delete a draft question and adjust question indices
 */
export async function deleteQuestion(questionId: string): Promise<void> {
  const pool = getPostgresPool();

  // Check if question is draft
  const qRes = await pool.query(
    `SELECT quiz_id, question_index, status FROM quiz_questions WHERE id = $1`,
    [questionId]
  );
  if (qRes.rowCount === 0) {
    throw new Error("question_not_found");
  }

  const { quiz_id: quizId, question_index: deletedIndex, status } = qRes.rows[0];

  if (status !== "draft") {
    throw new Error("can_only_delete_draft_questions");
  }

  await pool.query("BEGIN");
  try {
    // Delete the question
    await pool.query(`DELETE FROM quiz_questions WHERE id = $1`, [questionId]);

    // Re-index remaining questions in the quiz
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

/**
 * Add a manual question to a draft quiz
 */
export async function addQuestion(
  quizId: string,
  question: AddQuestionRequest
): Promise<string> {
  const pool = getPostgresPool();

  // Verify quiz is draft
  const quizRes = await pool.query(
    `SELECT status FROM quizzes WHERE id = $1`,
    [quizId]
  );
  if (quizRes.rowCount === 0) {
    throw new Error("quiz_not_found");
  }
  if (quizRes.rows[0].status !== "draft") {
    throw new Error("can_only_add_to_draft_quiz");
  }

  // Validate
  if (!["mcq", "true_false", "short_answer"].includes(question.type)) {
    throw new Error("invalid_question_type");
  }

  const pointValue = question.pointValue ?? 10;
  if (pointValue < 1 || pointValue > 100) {
    throw new Error("pointValue must be between 1 and 100");
  }

  const timeLimitSeconds = question.timeLimitSeconds ?? 30;
  if (timeLimitSeconds < 10 || timeLimitSeconds > 120) {
    throw new Error("timeLimitSeconds must be between 10 and 120");
  }

  // Get next question_index
  const indexRes = await pool.query(
    `SELECT MAX(question_index) as max_index FROM quiz_questions WHERE quiz_id = $1`,
    [quizId]
  );
  const nextIndex = (indexRes.rows[0]?.max_index ?? -1) + 1;

  const questionId = randomUUID();

  await pool.query(
    `INSERT INTO quiz_questions (
      id, quiz_id, type, text, options, correct_option_index, explanation,
      point_value, time_limit_seconds, question_index, status, generated_by_ai
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', false)`,
    [
      questionId,
      quizId,
      question.type,
      question.text,
      question.options ? JSON.stringify(question.options) : null,
      question.correctOptionIndex ?? null,
      question.explanation ?? null,
      pointValue,
      timeLimitSeconds,
      nextIndex,
    ]
  );

  return questionId;
}

/**
 * Publish a draft quiz - converts all draft questions to published
 * Once published, the quiz becomes visible to students and can be launched
 */
export async function publishQuiz(quizId: string): Promise<number> {
  const pool = getPostgresPool();

  await pool.query("BEGIN");
  try {
    // Check quiz exists and is draft
    const quizRes = await pool.query(
      `SELECT status FROM quizzes WHERE id = $1`,
      [quizId]
    );
    if (quizRes.rowCount === 0) {
      throw new Error("quiz_not_found");
    }
    if (quizRes.rows[0].status !== "draft") {
      throw new Error("quiz_already_published");
    }

    // Count draft questions
    const countRes = await pool.query(
      `SELECT COUNT(*) as count FROM quiz_questions WHERE quiz_id = $1 AND status = 'draft'`,
      [quizId]
    );
    const questionCount = parseInt(countRes.rows[0].count, 10);

    if (questionCount === 0) {
      throw new Error("no_questions_to_publish");
    }

    // Update all draft questions to published
    await pool.query(
      `UPDATE quiz_questions SET status = 'published' WHERE quiz_id = $1 AND status = 'draft'`,
      [quizId]
    );

    // Update quiz status to published
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

/**
 * Enhanced void question function that returns affected attempt data
 */
export async function voidQuestionAndRecalculateWithResponse(
  quizId: string,
  questionId: string
): Promise<VoidQuestionResponse> {
  const pool = getPostgresPool();
  const affectedAttempts: Array<{
    attemptId: string;
    userId: string;
    oldScore: number;
    newScore: number;
    pointsRedistributed: number;
  }> = [];

  await pool.query("BEGIN");
  try {
    // 1. Mark question as voided
    await pool.query(
      `UPDATE quiz_questions SET voided = TRUE WHERE id = $1 AND quiz_id = $2`,
      [questionId, quizId]
    );

    // 2. Fetch all active questions and their point values
    const questionsRes = await pool.query(
      `SELECT id, point_value, voided FROM quiz_questions WHERE quiz_id = $1`,
      [quizId]
    );
    const allQuestions = questionsRes.rows;
    const activeQuestions = allQuestions.filter(q => !q.voided);
    const voidedQuestions = allQuestions.filter(q => q.voided);

    const totalInitialPoints = allQuestions.reduce((sum, q) => sum + q.point_value, 0);
    const activeInitialPoints = activeQuestions.reduce((sum, q) => sum + q.point_value, 0);

    // 3. For each attempt, recalculate and track changes
    const attemptsRes = await pool.query(
      `SELECT id, user_id, score FROM quiz_attempts WHERE quiz_id = $1`,
      [quizId]
    );

    for (const attempt of attemptsRes.rows) {
      const attemptId = attempt.id;
      const userId = attempt.user_id;
      const oldScore = attempt.score;

      const scale = activeInitialPoints > 0 ? totalInitialPoints / activeInitialPoints : 0;

      const answersRes = await pool.query(
        `SELECT a.id, a.question_id, a.is_correct, a.time_remaining_seconds, a.points_awarded, q.point_value, q.time_limit_seconds
         FROM quiz_attempt_answers a
         JOIN quiz_questions q ON a.question_id = q.id
         WHERE a.attempt_id = $1`,
        [attemptId]
      );

      let totalScore = 0;
      let pointsRedistributed = 0;

      for (const ans of answersRes.rows) {
        const isVoided = voidedQuestions.some(vq => vq.id === ans.question_id);
        if (isVoided) {
          pointsRedistributed += ans.points_awarded;
          await pool.query(
            `UPDATE quiz_attempt_answers SET points_awarded = 0 WHERE id = $1`,
            [ans.id]
          );
        } else {
          if (ans.is_correct) {
            const speedMultiplier =
              ans.time_remaining_seconds >= ans.time_limit_seconds / 2 ? 1.5 : 1.0;
            const originalPoints = ans.point_value * speedMultiplier;
            const redistributedPoints = originalPoints * scale;
            totalScore += redistributedPoints;

            await pool.query(
              `UPDATE quiz_attempt_answers SET points_awarded = $2 WHERE id = $1`,
              [ans.id, redistributedPoints]
            );
          } else {
            await pool.query(
              `UPDATE quiz_attempt_answers SET points_awarded = 0 WHERE id = $1`,
              [ans.id]
            );
          }
        }
      }

      // Update attempt score
      await pool.query(`UPDATE quiz_attempts SET score = $2 WHERE id = $1`, [
        attemptId,
        totalScore,
      ]);

      // Update XP ledger
      await pool.query(
        `UPDATE student_xp_ledger SET xp_amount = $3 WHERE user_id = $1 AND quiz_id = $2`,
        [userId, quizId, Math.round(totalScore)]
      );

      affectedAttempts.push({
        attemptId,
        userId,
        oldScore,
        newScore: totalScore,
        pointsRedistributed,
      });
    }

    await pool.query("COMMIT");

    return {
      ok: true,
      questionId,
      voided: true,
      affectedAttempts,
    };
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}
