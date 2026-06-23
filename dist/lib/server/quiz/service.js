"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createQuiz = createQuiz;
exports.getQuizQuestions = getQuizQuestions;
exports.logIntegrityFlag = logIntegrityFlag;
exports.getOrCreateAttempt = getOrCreateAttempt;
exports.saveAnswer = saveAnswer;
exports.finishQuizScoring = finishQuizScoring;
exports.voidQuestionAndRecalculate = voidQuestionAndRecalculate;
/* eslint-disable */
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
const redis_state_1 = require("./redis-state");
async function createQuiz(courseId, input) {
    var _a, _b, _c, _d, _e, _f;
    const pool = (0, postgres_1.getPostgresPool)();
    const quizId = (0, crypto_1.randomUUID)();
    // Validate questions
    for (const q of input.questions) {
        if (!["mcq", "true_false", "short_answer"].includes(q.type)) {
            throw new Error(`Invalid question type: ${q.type}`);
        }
        const pt = (_a = q.pointValue) !== null && _a !== void 0 ? _a : 10;
        if (pt < 1 || pt > 100) {
            throw new Error(`pointValue must be between 1 and 100, got ${pt}`);
        }
        const limit = (_b = q.timeLimitSeconds) !== null && _b !== void 0 ? _b : 30;
        if (limit < 10 || limit > 120) {
            throw new Error(`timeLimitSeconds must be between 10 and 120, got ${limit}`);
        }
    }
    // Insert quiz and questions
    await pool.query("BEGIN");
    try {
        await pool.query(`INSERT INTO quizzes (id, course_id, title) VALUES ($1, $2, $3)`, [quizId, courseId, input.title]);
        for (let i = 0; i < input.questions.length; i++) {
            const q = input.questions[i];
            await pool.query(`INSERT INTO quiz_questions (
          id, quiz_id, type, text, options, correct_option_index, explanation, point_value, time_limit_seconds, question_index
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
                (0, crypto_1.randomUUID)(),
                quizId,
                q.type,
                q.text,
                q.options ? JSON.stringify(q.options) : null,
                (_c = q.correctOptionIndex) !== null && _c !== void 0 ? _c : null,
                (_d = q.explanation) !== null && _d !== void 0 ? _d : null,
                (_e = q.pointValue) !== null && _e !== void 0 ? _e : 10,
                (_f = q.timeLimitSeconds) !== null && _f !== void 0 ? _f : 30,
                i,
            ]);
        }
        await pool.query("COMMIT");
    }
    catch (err) {
        await pool.query("ROLLBACK");
        throw err;
    }
    return quizId;
}
async function getQuizQuestions(quizId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const res = await pool.query(`SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY question_index ASC`, [quizId]);
    return res.rows;
}
async function logIntegrityFlag(quizId, userId, userAgent, ip) {
    const pool = (0, postgres_1.getPostgresPool)();
    await pool.query(`INSERT INTO quiz_integrity_log (id, quiz_id, user_id, timestamp, user_agent, ip_address)
     VALUES ($1, $2, $3, NOW(), $4, $5)`, [(0, crypto_1.randomUUID)(), quizId, userId, userAgent, ip]);
}
async function getOrCreateAttempt(quizId, userId, attemptId, userAgent, ip) {
    const pool = (0, postgres_1.getPostgresPool)();
    const activeSession = await (0, redis_state_1.getActiveSession)(quizId, userId);
    if (activeSession && activeSession !== attemptId) {
        await logIntegrityFlag(quizId, userId, userAgent, ip);
        throw new Error("duplicate_device");
    }
    if (!activeSession) {
        await (0, redis_state_1.setActiveSession)(quizId, userId, attemptId);
    }
    // Ensure record in DB
    const attemptRes = await pool.query(`SELECT id FROM quiz_attempts WHERE id = $1 LIMIT 1`, [attemptId]);
    if (attemptRes.rowCount === 0) {
        await pool.query(`INSERT INTO quiz_attempts (id, quiz_id, user_id, status, score, started_at)
       VALUES ($1, $2, $3, 'started', 0, NOW())`, [attemptId, quizId, userId]);
    }
    return attemptId;
}
async function saveAnswer(quizId, attemptId, userId, questionId, selectedOption, timeRemainingSeconds, userAgent, ip) {
    const pool = (0, postgres_1.getPostgresPool)();
    const activeSession = await (0, redis_state_1.getActiveSession)(quizId, userId);
    if (activeSession && activeSession !== attemptId) {
        await logIntegrityFlag(quizId, userId, userAgent, ip);
        throw new Error("duplicate_device");
    }
    // Get question details to assess correctness
    const qRes = await pool.query(`SELECT * FROM quiz_questions WHERE id = $1 LIMIT 1`, [questionId]);
    if (qRes.rowCount === 0) {
        throw new Error("question_not_found");
    }
    const question = qRes.rows[0];
    let isCorrect = false;
    if (question.type === "mcq" || question.type === "true_false") {
        isCorrect = Number(selectedOption) === question.correct_option_index;
    }
    else if (question.type === "short_answer") {
        // case-insensitive trimmed match
        const correctText = question.explanation || "";
        isCorrect = selectedOption.trim().toLowerCase() === correctText.trim().toLowerCase();
    }
    const speedMultiplier = timeRemainingSeconds >= (question.time_limit_seconds / 2) ? 1.5 : 1.0;
    const pointsAwarded = isCorrect ? question.point_value * speedMultiplier : 0;
    await pool.query(`INSERT INTO quiz_attempt_answers (
      id, attempt_id, question_id, selected_option, submitted_at, time_remaining_seconds, is_correct, points_awarded
     ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)
     ON CONFLICT (attempt_id, question_id) DO UPDATE SET
      selected_option = EXCLUDED.selected_option,
      submitted_at = NOW(),
      time_remaining_seconds = EXCLUDED.time_remaining_seconds,
      is_correct = EXCLUDED.is_correct,
      points_awarded = EXCLUDED.points_awarded`, [
        (0, crypto_1.randomUUID)(),
        attemptId,
        questionId,
        selectedOption,
        timeRemainingSeconds,
        isCorrect,
        pointsAwarded,
    ]);
    return { isCorrect, pointsAwarded };
}
async function finishQuizScoring(quizId) {
    var _a, _b;
    const pool = (0, postgres_1.getPostgresPool)();
    // Get course_id
    const quizRes = await pool.query(`SELECT course_id FROM quizzes WHERE id = $1 LIMIT 1`, [quizId]);
    if (quizRes.rowCount === 0)
        return;
    const courseId = quizRes.rows[0].course_id;
    // Find all started attempts for this quiz
    const attemptsRes = await pool.query(`SELECT id, user_id FROM quiz_attempts WHERE quiz_id = $1 AND status = 'started'`, [quizId]);
    for (const attempt of attemptsRes.rows) {
        const attemptId = attempt.id;
        const userId = attempt.user_id;
        // Get the answers for this attempt (ignoring voided questions)
        const scoreRes = await pool.query(`SELECT COALESCE(SUM(a.points_awarded), 0)::numeric AS total_score
       FROM quiz_attempt_answers a
       JOIN quiz_questions q ON a.question_id = q.id
       WHERE a.attempt_id = $1 AND q.voided = FALSE`, [attemptId]);
        const score = Number((_b = (_a = scoreRes.rows[0]) === null || _a === void 0 ? void 0 : _a.total_score) !== null && _b !== void 0 ? _b : 0);
        // Update attempt status to completed
        await pool.query(`UPDATE quiz_attempts
       SET status = 'completed', score = $2, completed_at = NOW()
       WHERE id = $1`, [attemptId, score]);
        // Store in student_xp_ledger
        await pool.query(`INSERT INTO student_xp_ledger (id, user_id, course_id, quiz_id, xp_amount, earned_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`, [(0, crypto_1.randomUUID)(), userId, courseId, quizId, Math.round(score)]);
    }
}
async function voidQuestionAndRecalculate(quizId, questionId) {
    const pool = (0, postgres_1.getPostgresPool)();
    await pool.query("BEGIN");
    try {
        // 1. Mark question as voided
        await pool.query(`UPDATE quiz_questions SET voided = TRUE WHERE id = $1 AND quiz_id = $2`, [questionId, quizId]);
        // 2. Fetch all active questions and their initial point values
        const questionsRes = await pool.query(`SELECT id, point_value, voided FROM quiz_questions WHERE quiz_id = $1`, [quizId]);
        const allQuestions = questionsRes.rows;
        const activeQuestions = allQuestions.filter(q => !q.voided);
        const voidedQuestions = allQuestions.filter(q => q.voided);
        const totalInitialPoints = allQuestions.reduce((sum, q) => sum + q.point_value, 0);
        const activeInitialPoints = activeQuestions.reduce((sum, q) => sum + q.point_value, 0);
        // 3. For each student attempt, recalculate their points
        const attemptsRes = await pool.query(`SELECT id, user_id FROM quiz_attempts WHERE quiz_id = $1`, [quizId]);
        for (const attempt of attemptsRes.rows) {
            const attemptId = attempt.id;
            // Recalculate each non-voided answer's awarded points.
            // Redistribution ratio: totalInitialPoints / activeInitialPoints
            const scale = activeInitialPoints > 0 ? (totalInitialPoints / activeInitialPoints) : 0;
            // Get answers for the attempt
            const answersRes = await pool.query(`SELECT a.id, a.question_id, a.is_correct, a.time_remaining_seconds, q.point_value, q.time_limit_seconds
         FROM quiz_attempt_answers a
         JOIN quiz_questions q ON a.question_id = q.id
         WHERE a.attempt_id = $1`, [attemptId]);
            let totalScore = 0;
            for (const ans of answersRes.rows) {
                const isVoided = voidedQuestions.some(vq => vq.id === ans.question_id);
                if (isVoided) {
                    // Voided answer gets 0 points
                    await pool.query(`UPDATE quiz_attempt_answers SET points_awarded = 0 WHERE id = $1`, [ans.id]);
                }
                else {
                    // Recalculate correct answer with proportional points
                    if (ans.is_correct) {
                        const speedMultiplier = ans.time_remaining_seconds >= (ans.time_limit_seconds / 2) ? 1.5 : 1.0;
                        const originalPoints = ans.point_value * speedMultiplier;
                        const redistributedPoints = originalPoints * scale;
                        totalScore += redistributedPoints;
                        await pool.query(`UPDATE quiz_attempt_answers SET points_awarded = $2 WHERE id = $1`, [ans.id, redistributedPoints]);
                    }
                    else {
                        await pool.query(`UPDATE quiz_attempt_answers SET points_awarded = 0 WHERE id = $1`, [ans.id]);
                    }
                }
            }
            // Update quiz_attempts score
            await pool.query(`UPDATE quiz_attempts SET score = $2 WHERE id = $1`, [attemptId, totalScore]);
            // Update student_xp_ledger
            await pool.query(`UPDATE student_xp_ledger SET xp_amount = $3 WHERE user_id = $1 AND quiz_id = $2`, [attempt.user_id, quizId, Math.round(totalScore)]);
        }
        await pool.query("COMMIT");
    }
    catch (err) {
        await pool.query("ROLLBACK");
        throw err;
    }
}
