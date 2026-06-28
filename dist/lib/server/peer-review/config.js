"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configurePeerReview = configurePeerReview;
exports.getPeerReviewConfig = getPeerReviewConfig;
exports.isPeerReviewConfigured = isPeerReviewConfigured;
exports.getAssignmentRubric = getAssignmentRubric;
/**
 * Peer Review Configuration Service
 */
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
/**
 * Configure peer review for an assignment
 * Only allowed BEFORE assignment deadline
 */
async function configurePeerReview(assignmentId, request) {
    var _a, _b, _c;
    const pool = (0, postgres_1.getPostgresPool)();
    // Check assignment exists and deadline has not passed
    const assignmentRes = await pool.query(`SELECT deadline_utc FROM assignments WHERE id = $1`, [assignmentId]);
    if (assignmentRes.rows.length === 0) {
        throw new Error("assignment_not_found");
    }
    const deadline = new Date(assignmentRes.rows[0].deadline_utc);
    if (new Date() > deadline) {
        throw new Error("cannot_configure_after_deadline");
    }
    const configId = (0, crypto_1.randomUUID)();
    const reviewersPerSubmission = (_a = request.reviewersPerSubmission) !== null && _a !== void 0 ? _a : 2;
    const gradeContributionPercent = (_b = request.gradeContributionPercent) !== null && _b !== void 0 ? _b : 50;
    const outlierZScoreThreshold = (_c = request.outlierZScoreThreshold) !== null && _c !== void 0 ? _c : 2.0;
    await pool.query(`INSERT INTO peer_review_configs (
      id, assignment_id, reviewers_per_submission, rubric, 
      review_deadline_utc, grade_contribution_percent, outlier_z_score_threshold
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (assignment_id) DO UPDATE SET
      reviewers_per_submission = $3,
      rubric = $4,
      review_deadline_utc = $5,
      grade_contribution_percent = $6,
      outlier_z_score_threshold = $7,
      updated_at = NOW()`, [
        configId,
        assignmentId,
        reviewersPerSubmission,
        JSON.stringify(request.rubric),
        request.reviewDeadlineUtc,
        gradeContributionPercent,
        outlierZScoreThreshold,
    ]);
    return configId;
}
/**
 * Get peer review configuration for assignment
 */
async function getPeerReviewConfig(assignmentId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const res = await pool.query(`SELECT id, assignment_id, reviewers_per_submission, rubric, 
            review_deadline_utc, grade_contribution_percent, outlier_z_score_threshold,
            created_at, updated_at
     FROM peer_review_configs
     WHERE assignment_id = $1`, [assignmentId]);
    if (res.rows.length === 0) {
        return null;
    }
    const row = res.rows[0];
    return {
        id: row.id,
        assignmentId: row.assignment_id,
        reviewersPerSubmission: row.reviewers_per_submission,
        rubric: Array.isArray(row.rubric) ? row.rubric : JSON.parse(row.rubric),
        reviewDeadlineUtc: row.review_deadline_utc.toISOString(),
        gradeContributionPercent: row.grade_contribution_percent,
        outlierZScoreThreshold: parseFloat(row.outlier_z_score_threshold),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}
/**
 * Check if peer review is configured for assignment
 */
async function isPeerReviewConfigured(assignmentId) {
    const config = await getPeerReviewConfig(assignmentId);
    return config !== null;
}
/**
 * Get rubric for assignment
 */
async function getAssignmentRubric(assignmentId) {
    const config = await getPeerReviewConfig(assignmentId);
    if (!config) {
        throw new Error("peer_review_not_configured");
    }
    return config.rubric;
}
