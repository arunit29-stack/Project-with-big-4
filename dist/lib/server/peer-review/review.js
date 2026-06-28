"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitPeerReview = submitPeerReview;
exports.getSubmissionScores = getSubmissionScores;
exports.getReviewerSubmission = getReviewerSubmission;
exports.isReviewSubmitted = isReviewSubmitted;
/**
 * Peer Review Submission Service
 * Handles review submission and score storage
 */
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
const config_1 = require("./config");
const assign_1 = require("./assign");
const outlier_1 = require("./outlier");
/**
 * Submit a peer review
 * CRITICAL: Identified by review_token, not reviewer_id
 */
async function submitPeerReview(reviewToken, request) {
    const pool = (0, postgres_1.getPostgresPool)();
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Get assignment details from token
        const assignment = await (0, assign_1.getAssignmentByReviewToken)(reviewToken);
        if (!assignment) {
            throw new Error("invalid_review_token");
        }
        const { assignmentId, submissionId, reviewerId } = assignment;
        // Get rubric
        const rubric = await (0, config_1.getAssignmentRubric)(assignmentId);
        const rubricByCriterion = new Map(rubric.map((c) => [c.criterion, c.maxMarks]));
        // Validate each score
        for (const scoreData of request.scores) {
            const maxMarks = rubricByCriterion.get(scoreData.criterion);
            if (!maxMarks) {
                throw new Error(`unknown_criterion: ${scoreData.criterion}`);
            }
            if (scoreData.score < 0 || scoreData.score > maxMarks) {
                throw new Error(`score_out_of_range: ${scoreData.criterion}, max ${maxMarks}`);
            }
        }
        // Check for existing review (prevent double submission)
        const existingRes = await client.query(`SELECT COUNT(*) as count FROM peer_review_scores
       WHERE submission_id = $1 AND review_token = $2`, [submissionId, reviewToken]);
        if (parseInt(existingRes.rows[0].count, 10) > 0) {
            throw new Error("review_already_submitted");
        }
        // Insert scores
        for (const scoreData of request.scores) {
            const scoreId = (0, crypto_1.randomUUID)();
            await client.query(`INSERT INTO peer_review_scores (
          id, assignment_id, submission_id, review_token, criterion, score, justification
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                scoreId,
                assignmentId,
                submissionId,
                reviewToken,
                scoreData.criterion,
                scoreData.score,
                scoreData.justification,
            ]);
        }
        // Update assignment status
        await client.query(`UPDATE peer_review_assignments SET status = 'submitted', updated_at = NOW()
       WHERE review_token = $1`, [reviewToken]);
        // Audit log
        await auditLog(client, assignmentId, "score_submitted", reviewToken, submissionId, { criterion_count: request.scores.length });
        await client.query("COMMIT");
        // After commit, calculate Z-scores and detect outliers
        // (do outside of transaction to avoid lock contention)
        setTimeout(() => {
            (0, outlier_1.calculateZScoresForSubmission)(assignmentId, submissionId).catch((err) => {
                console.error("Error calculating Z-scores:", err);
            });
        }, 100);
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
/**
 * Get scores for a submission
 */
async function getSubmissionScores(submissionId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const res = await pool.query(`SELECT id, assignment_id, submission_id, review_token, criterion, score, justification,
            is_overridden, overridden_score, z_score, is_outlier, created_at, updated_at
     FROM peer_review_scores
     WHERE submission_id = $1
     ORDER BY criterion, review_token`, [submissionId]);
    return res.rows.map((row) => ({
        id: row.id,
        assignmentId: row.assignment_id,
        submissionId: row.submission_id,
        reviewToken: row.review_token,
        criterion: row.criterion,
        score: parseFloat(row.score),
        justification: row.justification,
        isOverridden: row.is_overridden,
        overriddenScore: row.overridden_score
            ? parseFloat(row.overridden_score)
            : undefined,
        zScore: row.z_score ? parseFloat(row.z_score) : undefined,
        isOutlier: row.is_outlier,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    }));
}
/**
 * Get reviewer's submission (for reviewer dashboard)
 * CRITICAL: Return ONLY submissionId and content, NEVER submitter identity
 */
async function getReviewerSubmission(reviewToken) {
    const pool = (0, postgres_1.getPostgresPool)();
    const assignment = await (0, assign_1.getAssignmentByReviewToken)(reviewToken);
    if (!assignment) {
        return null;
    }
    const res = await pool.query(`SELECT id, content FROM submissions WHERE id = $1`, [assignment.submissionId]);
    if (res.rows.length === 0) {
        return null;
    }
    return {
        submissionId: res.rows[0].id,
        content: res.rows[0].content,
    };
}
/**
 * Check if review already submitted
 */
async function isReviewSubmitted(reviewToken) {
    const pool = (0, postgres_1.getPostgresPool)();
    const res = await pool.query(`SELECT COUNT(*) as count FROM peer_review_scores
     WHERE review_token = $1`, [reviewToken]);
    return parseInt(res.rows[0].count, 10) > 0;
}
/**
 * Audit log helper
 */
async function auditLog(client, assignmentId, action, reviewToken, submissionId, details) {
    const auditId = (0, crypto_1.randomUUID)();
    await client.query(`INSERT INTO peer_review_audit_log (id, assignment_id, action, review_token, submission_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`, [auditId, assignmentId, action, reviewToken, submissionId, JSON.stringify(details)]);
}
