/**
 * Peer Review Configuration Service
 */
import { randomUUID } from "crypto";
import { getPostgresPool } from "../db/postgres";
import type {
  PeerReviewConfig,
  ConfigurePeerReviewRequest,
  ReviewCriterion,
} from "../../types/peer-review";

/**
 * Configure peer review for an assignment
 * Only allowed BEFORE assignment deadline
 */
export async function configurePeerReview(
  assignmentId: string,
  request: ConfigurePeerReviewRequest
): Promise<string> {
  const pool = getPostgresPool();

  // Check assignment exists and deadline has not passed
  const assignmentRes = await pool.query(
    `SELECT deadline_utc FROM assignments WHERE id = $1`,
    [assignmentId]
  );

  if (assignmentRes.rows.length === 0) {
    throw new Error("assignment_not_found");
  }

  const deadline = new Date(assignmentRes.rows[0].deadline_utc);
  if (new Date() > deadline) {
    throw new Error("cannot_configure_after_deadline");
  }

  const configId = randomUUID();
  const reviewersPerSubmission = request.reviewersPerSubmission ?? 2;
  const gradeContributionPercent = request.gradeContributionPercent ?? 50;
  const outlierZScoreThreshold = request.outlierZScoreThreshold ?? 2.0;

  await pool.query(
    `INSERT INTO peer_review_configs (
      id, assignment_id, reviewers_per_submission, rubric, 
      review_deadline_utc, grade_contribution_percent, outlier_z_score_threshold
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (assignment_id) DO UPDATE SET
      reviewers_per_submission = $3,
      rubric = $4,
      review_deadline_utc = $5,
      grade_contribution_percent = $6,
      outlier_z_score_threshold = $7,
      updated_at = NOW()`,
    [
      configId,
      assignmentId,
      reviewersPerSubmission,
      JSON.stringify(request.rubric),
      request.reviewDeadlineUtc,
      gradeContributionPercent,
      outlierZScoreThreshold,
    ]
  );

  return configId;
}

/**
 * Get peer review configuration for assignment
 */
export async function getPeerReviewConfig(
  assignmentId: string
): Promise<PeerReviewConfig | null> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT id, assignment_id, reviewers_per_submission, rubric, 
            review_deadline_utc, grade_contribution_percent, outlier_z_score_threshold,
            created_at, updated_at
     FROM peer_review_configs
     WHERE assignment_id = $1`,
    [assignmentId]
  );

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
export async function isPeerReviewConfigured(
  assignmentId: string
): Promise<boolean> {
  const config = await getPeerReviewConfig(assignmentId);
  return config !== null;
}

/**
 * Get rubric for assignment
 */
export async function getAssignmentRubric(
  assignmentId: string
): Promise<ReviewCriterion[]> {
  const config = await getPeerReviewConfig(assignmentId);
  if (!config) {
    throw new Error("peer_review_not_configured");
  }
  return config.rubric;
}
