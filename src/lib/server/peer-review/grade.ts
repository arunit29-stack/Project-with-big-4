/**
 * Grade Calculation Service
 * Handles score overrides, reviewer discards, and final grade computation
 */
import { randomUUID } from "crypto";
import { getPostgresPool } from "../db/postgres";
import { getPeerReviewConfig } from "./config";
import { getSubmissionScores } from "./review";
import type {
  SubmissionReviewResults,
  ReviewSummaryPerCriterion,
  ReviewScoreDetail,
} from "../../types/peer-review";

/**
 * Override a specific outlier score
 */
export async function overrideOutlierScore(
  assignmentId: string,
  submissionId: string,
  reviewToken: string,
  criterion: string,
  newScore: number,
  reason: string,
  teacherId: string
): Promise<void> {
  const pool = getPostgresPool();

  // Get original score
  const scoreRes = await pool.query(
    `SELECT id, score FROM peer_review_scores
     WHERE submission_id = $1 AND review_token = $2 AND criterion = $3`,
    [submissionId, reviewToken, criterion]
  );

  if (scoreRes.rows.length === 0) {
    throw new Error("score_not_found");
  }

  const originalScore = parseFloat(scoreRes.rows[0].score);
  const scoreId = scoreRes.rows[0].id;

  // Update score
  await pool.query(
    `UPDATE peer_review_scores
     SET is_overridden = true, overridden_score = $1, updated_at = NOW()
     WHERE id = $2`,
    [newScore, scoreId]
  );

  // Create override record
  await pool.query(
    `INSERT INTO peer_review_overrides (
      id, assignment_id, submission_id, review_token, criterion, 
      original_score, overridden_score, reason, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      randomUUID(),
      assignmentId,
      submissionId,
      reviewToken,
      criterion,
      originalScore,
      newScore,
      reason,
      teacherId,
    ]
  );

  // Audit log
  await pool.query(
    `INSERT INTO peer_review_audit_log (
      id, assignment_id, action, review_token, submission_id, details, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
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
    ]
  );

  // Update outlier flag
  await pool.query(
    `UPDATE peer_review_outlier_flags
     SET resolved_at = NOW(), resolution_action = 'overridden', resolved_by = $1
     WHERE assignment_id = $2 AND submission_id = $3 
       AND review_token = $4 AND criterion = $5`,
    [teacherId, assignmentId, submissionId, reviewToken, criterion]
  );

  // Recalculate Z-scores
  const { calculateZScoresForSubmission } = await import("./outlier");
  await calculateZScoresForSubmission(assignmentId, submissionId);
}

/**
 * Discard all scores from a reviewer (bad-faith flag)
 */
export async function discardReviewer(
  assignmentId: string,
  submissionId: string,
  reviewToken: string,
  reason: string,
  teacherId: string
): Promise<void> {
  const pool = getPostgresPool();

  // Mark all scores from this reviewer as discarded
  await pool.query(
    `UPDATE peer_review_assignments
     SET status = 'discarded', updated_at = NOW()
     WHERE assignment_id = $1 AND review_token = $2`,
    [assignmentId, reviewToken]
  );

  // Create discard record
  await pool.query(
    `INSERT INTO peer_review_discards (
      id, assignment_id, review_token, submission_id, reason, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), assignmentId, reviewToken, submissionId, reason, teacherId]
  );

  // Audit log
  await pool.query(
    `INSERT INTO peer_review_audit_log (
      id, assignment_id, action, review_token, submission_id, details, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      assignmentId,
      "reviewer_discarded",
      reviewToken,
      submissionId,
      JSON.stringify({ reason }),
      teacherId,
    ]
  );

  // Resolve all outlier flags for this reviewer
  await pool.query(
    `UPDATE peer_review_outlier_flags
     SET resolved_at = NOW(), resolution_action = 'discarded', resolved_by = $1
     WHERE assignment_id = $2 AND review_token = $3`,
    [teacherId, assignmentId, reviewToken]
  );
}

/**
 * Calculate results for a single submission
 */
export async function calculateSubmissionResults(
  assignmentId: string,
  submissionId: string
): Promise<SubmissionReviewResults> {
  const pool = getPostgresPool();

  // Get config
  const config = await getPeerReviewConfig(assignmentId);
  if (!config) {
    throw new Error("peer_review_not_configured");
  }

  // Get submission details
  const submissionRes = await pool.query(
    `SELECT user_id FROM submissions WHERE id = $1`,
    [submissionId]
  );

  if (submissionRes.rows.length === 0) {
    throw new Error("submission_not_found");
  }

  const submitterId = submissionRes.rows[0].user_id;

  // Get all scores for submission
  const allScores = await getSubmissionScores(submissionId);

  // Get discarded reviewers
  const discardedRes = await pool.query(
    `SELECT review_token FROM peer_review_discards
     WHERE assignment_id = $1 AND submission_id = $2`,
    [assignmentId, submissionId]
  );

  const discardedTokens = new Set(
    discardedRes.rows.map((row) => row.review_token)
  );

  // Filter out discarded reviewers' scores
  const activeScores = allScores.filter(
    (s) => !discardedTokens.has(s.reviewToken)
  );

  // Group by criterion
  const scoreByCriterion = new Map<string, any[]>();
  for (const score of activeScores) {
    if (!scoreByCriterion.has(score.criterion)) {
      scoreByCriterion.set(score.criterion, []);
    }
    scoreByCriterion.get(score.criterion)!.push(score);
  }

  // Calculate per-criterion stats
  const reviewsReceived: ReviewSummaryPerCriterion[] = [];
  let totalPeerScore = 0;

  for (const criterion of config.rubric) {
    const criterionScores = scoreByCriterion.get(criterion.criterion) || [];

    if (criterionScores.length === 0) {
      continue;
    }

    // Get final scores (use overridden if set, else original)
    const finalScores = criterionScores.map((s) =>
      s.isOverridden && s.overriddenScore !== undefined
        ? s.overriddenScore
        : s.score
    );

    const mean = finalScores.reduce((a, b) => a + b, 0) / finalScores.length;

    const scoreDetails: ReviewScoreDetail[] = criterionScores.map((s) => ({
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
  const peerScore =
    reviewsReceived.length > 0
      ? totalPeerScore / reviewsReceived.length
      : 0;

  // Calculate grade contributions
  const peerGradeContribution = (peerScore * config.gradeContributionPercent) / 100;
  const teacherRubricScore = 0; // TODO: Get from teacher grading
  const teacherGradeContribution =
    (teacherRubricScore * (100 - config.gradeContributionPercent)) / 100;
  const finalGrade = peerGradeContribution + teacherGradeContribution;

  // Get outlier flags
  const outlierFlagsRes = await pool.query(
    `SELECT review_token FROM peer_review_outlier_flags
     WHERE assignment_id = $1 AND submission_id = $2 AND resolved_at IS NULL`,
    [assignmentId, submissionId]
  );

  const outlierFlags = outlierFlagsRes.rows.map((row) => ({
    reviewToken: row.review_token,
    submissionId,
  }));

  // Get audit trail
  const auditRes = await pool.query(
    `SELECT action, review_token, details, created_at FROM peer_review_audit_log
     WHERE assignment_id = $1 AND submission_id = $2
     ORDER BY created_at DESC`,
    [assignmentId, submissionId]
  );

  const auditTrail = auditRes.rows.map((row) => ({
    id: randomUUID(),
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
    finalGradeContribution: parseFloat(
      (peerGradeContribution + teacherGradeContribution).toFixed(2)
    ),
    finalGrade: parseFloat(finalGrade.toFixed(2)),
    auditTrail,
  };
}

/**
 * Store final grade calculation
 */
export async function storeSubmissionResults(
  assignmentId: string,
  submissionId: string,
  submitterId: string,
  results: {
    peerScore: number;
    peerGradeContribution: number;
    teacherRubricScore: number;
    finalGradeContribution: number;
    finalGrade: number;
  }
): Promise<void> {
  const pool = getPostgresPool();

  await pool.query(
    `INSERT INTO peer_review_results (
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
      updated_at = NOW()`,
    [
      randomUUID(),
      assignmentId,
      submissionId,
      submitterId,
      results.peerScore,
      results.peerGradeContribution,
      results.teacherRubricScore,
      results.finalGradeContribution,
      results.finalGrade,
    ]
  );
}
