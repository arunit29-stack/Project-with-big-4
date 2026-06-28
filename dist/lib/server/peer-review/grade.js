"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.overrideOutlierScore = overrideOutlierScore;
exports.discardReviewer = discardReviewer;
exports.calculateSubmissionResults = calculateSubmissionResults;
exports.storeSubmissionResults = storeSubmissionResults;
/**
 * Grade Calculation Service
 * Handles score overrides, reviewer discards, and final grade computation
 */
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
const config_1 = require("./config");
const review_1 = require("./review");
/**
 * Override a specific outlier score
 */
async function overrideOutlierScore(assignmentId, submissionId, reviewToken, criterion, newScore, reason, teacherId) {
    const pool = (0, postgres_1.getPostgresPool)();
    // Get original score
    const scoreRes = await pool.query(`SELECT id, score FROM peer_review_scores
     WHERE submission_id = $1 AND review_token = $2 AND criterion = $3`, [submissionId, reviewToken, criterion]);
    if (scoreRes.rows.length === 0) {
        throw new Error("score_not_found");
    }
    const originalScore = parseFloat(scoreRes.rows[0].score);
    const scoreId = scoreRes.rows[0].id;
    // Update score
    await pool.query(`UPDATE peer_review_scores
     SET is_overridden = true, overridden_score = $1, updated_at = NOW()
     WHERE id = $2`, [newScore, scoreId]);
    // Create override record
    await pool.query(`INSERT INTO peer_review_overrides (
      id, assignment_id, submission_id, review_token, criterion, 
      original_score, overridden_score, reason, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
        (0, crypto_1.randomUUID)(),
        assignmentId,
        submissionId,
        reviewToken,
        criterion,
        originalScore,
        newScore,
        reason,
        teacherId,
    ]);
    // Audit log
    await pool.query(`INSERT INTO peer_review_audit_log (
      id, assignment_id, action, review_token, submission_id, details, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        (0, crypto_1.randomUUID)(),
        assignmentId,
        "score_overridden",
        reviewToken,
        submissionId,
        JSON.stringify({
            criterion,
            originalScore,
            newScore,
            reason,
        }),
        teacherId,
    ]);
    // Update outlier flag
    await pool.query(`UPDATE peer_review_outlier_flags
     SET resolved_at = NOW(), resolution_action = 'overridden', resolved_by = $1
     WHERE assignment_id = $2 AND submission_id = $3 
       AND review_token = $4 AND criterion = $5`, [teacherId, assignmentId, submissionId, reviewToken, criterion]);
    // Recalculate Z-scores
    const { calculateZScoresForSubmission } = await Promise.resolve().then(() => __importStar(require("./outlier")));
    await calculateZScoresForSubmission(assignmentId, submissionId);
}
/**
 * Discard all scores from a reviewer (bad-faith flag)
 */
async function discardReviewer(assignmentId, submissionId, reviewToken, reason, teacherId) {
    const pool = (0, postgres_1.getPostgresPool)();
    // Mark all scores from this reviewer as discarded
    await pool.query(`UPDATE peer_review_assignments
     SET status = 'discarded', updated_at = NOW()
     WHERE assignment_id = $1 AND review_token = $2`, [assignmentId, reviewToken]);
    // Create discard record
    await pool.query(`INSERT INTO peer_review_discards (
      id, assignment_id, review_token, submission_id, reason, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6)`, [(0, crypto_1.randomUUID)(), assignmentId, reviewToken, submissionId, reason, teacherId]);
    // Audit log
    await pool.query(`INSERT INTO peer_review_audit_log (
      id, assignment_id, action, review_token, submission_id, details, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        (0, crypto_1.randomUUID)(),
        assignmentId,
        "reviewer_discarded",
        reviewToken,
        submissionId,
        JSON.stringify({ reason }),
        teacherId,
    ]);
    // Resolve all outlier flags for this reviewer
    await pool.query(`UPDATE peer_review_outlier_flags
     SET resolved_at = NOW(), resolution_action = 'discarded', resolved_by = $1
     WHERE assignment_id = $2 AND review_token = $3`, [teacherId, assignmentId, reviewToken]);
}
/**
 * Calculate results for a single submission
 */
async function calculateSubmissionResults(assignmentId, submissionId) {
    const pool = (0, postgres_1.getPostgresPool)();
    // Get config
    const config = await (0, config_1.getPeerReviewConfig)(assignmentId);
    if (!config) {
        throw new Error("peer_review_not_configured");
    }
    // Get submission details
    const submissionRes = await pool.query(`SELECT user_id FROM submissions WHERE id = $1`, [submissionId]);
    if (submissionRes.rows.length === 0) {
        throw new Error("submission_not_found");
    }
    const submitterId = submissionRes.rows[0].user_id;
    // Get all scores for submission
    const allScores = await (0, review_1.getSubmissionScores)(submissionId);
    // Get discarded reviewers
    const discardedRes = await pool.query(`SELECT review_token FROM peer_review_discards
     WHERE assignment_id = $1 AND submission_id = $2`, [assignmentId, submissionId]);
    const discardedTokens = new Set(discardedRes.rows.map((row) => row.review_token));
    // Filter out discarded reviewers' scores
    const activeScores = allScores.filter((s) => !discardedTokens.has(s.reviewToken));
    // Group by criterion
    const scoreByCriterion = new Map();
    for (const score of activeScores) {
        if (!scoreByCriterion.has(score.criterion)) {
            scoreByCriterion.set(score.criterion, []);
        }
        scoreByCriterion.get(score.criterion).push(score);
    }
    // Calculate per-criterion stats
    const reviewsReceived = [];
    let totalPeerScore = 0;
    for (const criterion of config.rubric) {
        const criterionScores = scoreByCriterion.get(criterion.criterion) || [];
        if (criterionScores.length === 0) {
            continue;
        }
        // Get final scores (use overridden if set, else original)
        const finalScores = criterionScores.map((s) => s.isOverridden && s.overriddenScore !== undefined
            ? s.overriddenScore
            : s.score);
        const mean = finalScores.reduce((a, b) => a + b, 0) / finalScores.length;
        const scoreDetails = criterionScores.map((s) => ({
            reviewToken: s.reviewToken,
            score: s.score,
            overriddenScore: s.overriddenScore,
            justification: s.justification,
            zScore: s.zScore || 0,
            isOutlier: s.isOutlier || false,
            isDiscarded: discardedTokens.has(s.reviewToken),
        }));
        reviewsReceived.push({
            criterion: criterion.criterion,
            maxMarks: criterion.maxMarks,
            scores: scoreDetails,
            mean: parseFloat(mean.toFixed(2)),
            stdDev: 0, // Can be calculated if needed
            finalScore: parseFloat(mean.toFixed(2)),
        });
        totalPeerScore += mean;
    }
    // Average peer score
    const peerScore = reviewsReceived.length > 0
        ? totalPeerScore / reviewsReceived.length
        : 0;
    // Calculate grade contributions
    const peerGradeContribution = (peerScore * config.gradeContributionPercent) / 100;
    const teacherRubricScore = 0; // TODO: Get from teacher grading
    const teacherGradeContribution = (teacherRubricScore * (100 - config.gradeContributionPercent)) / 100;
    const finalGrade = peerGradeContribution + teacherGradeContribution;
    // Get outlier flags
    const outlierFlagsRes = await pool.query(`SELECT id, review_token, criterion, score, z_score, threshold, created_at, resolved_at, resolution_action FROM peer_review_outlier_flags
     WHERE assignment_id = $1 AND submission_id = $2 AND resolved_at IS NULL`, [assignmentId, submissionId]);
    const outlierFlags = outlierFlagsRes.rows.map((row) => ({
        id: row.id,
        reviewToken: row.review_token,
        submissionId,
        criterion: row.criterion,
        score: parseFloat(row.score),
        zScore: parseFloat(row.z_score),
        threshold: parseFloat(row.threshold),
        createdAt: row.created_at.toISOString(),
        resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : undefined,
        resolutionAction: row.resolution_action,
    }));
    // Get audit trail
    const auditRes = await pool.query(`SELECT action, review_token, details, created_at FROM peer_review_audit_log
     WHERE assignment_id = $1 AND submission_id = $2
     ORDER BY created_at DESC`, [assignmentId, submissionId]);
    const auditTrail = auditRes.rows.map((row) => ({
        id: (0, crypto_1.randomUUID)(),
        assignmentId,
        submissionId,
        action: row.action,
        reviewToken: row.review_token,
        details: typeof row.details === "string" ? JSON.parse(row.details) : row.details,
        createdAt: row.created_at.toISOString(),
    }));
    return {
        submissionId,
        submitterId,
        submitterName: submitterId, // TODO: fetch from user table
        reviewCount: activeScores.length / (config.rubric.length || 1),
        reviewsReceived,
        outlierFlags,
        discardedReviewers: Array.from(discardedTokens),
        peerScore: parseFloat(peerScore.toFixed(2)),
        peerGradeContribution: parseFloat(peerGradeContribution.toFixed(2)),
        teacherRubricScore,
        finalGradeContribution: parseFloat((peerGradeContribution + teacherGradeContribution).toFixed(2)),
        finalGrade: parseFloat(finalGrade.toFixed(2)),
        auditTrail,
    };
}
/**
 * Store final grade calculation
 */
async function storeSubmissionResults(assignmentId, submissionId, submitterId, results) {
    const pool = (0, postgres_1.getPostgresPool)();
    await pool.query(`INSERT INTO peer_review_results (
      id, assignment_id, submission_id, submitter_id, 
      peer_score, peer_grade_contribution, teacher_rubric_score,
      final_grade_contribution, final_grade
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (submission_id) DO UPDATE SET
      peer_score = $5,
      peer_grade_contribution = $6,
      teacher_rubric_score = $7,
      final_grade_contribution = $8,
      final_grade = $9,
      updated_at = NOW()`, [
        (0, crypto_1.randomUUID)(),
        assignmentId,
        submissionId,
        submitterId,
        results.peerScore,
        results.peerGradeContribution,
        results.teacherRubricScore,
        results.finalGradeContribution,
        results.finalGrade,
    ]);
}
