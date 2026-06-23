/**
 * Outlier Detection Service
 * Calculates Z-scores and flags anomalous reviews
 * CRITICAL: Identifies outliers by review_token, never by reviewer name
 */
import { randomUUID } from "crypto";
import { getPostgresPool } from "../db/postgres";
import { getPeerReviewConfig } from "./config";
import type { OutlierDetection } from "../../types/peer-review";

/**
 * Calculate mean and standard deviation
 */
function calculateStats(values: number[]): {
  mean: number;
  stdDev: number;
} {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0 };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, val) => a + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev };
}

/**
 * Calculate Z-score for a value
 */
function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) {
    return 0; // If all scores are the same, Z-score is 0
  }
  return (value - mean) / stdDev;
}

/**
 * Recalculate Z-scores for all reviews of a submission
 * Called after each new review is submitted
 */
export async function calculateZScoresForSubmission(
  assignmentId: string,
  submissionId: string
): Promise<void> {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get config
    const config = await getPeerReviewConfig(assignmentId);
    if (!config) {
      await client.query("ROLLBACK");
      return;
    }

    const outlierThreshold = config.outlierZScoreThreshold;

    // Get all scores for this submission
    const scoresRes = await client.query(
      `SELECT id, review_token, criterion, score, is_overridden, overridden_score
       FROM peer_review_scores
       WHERE submission_id = $1
       ORDER BY criterion, review_token`,
      [submissionId]
    );

    const scores = scoresRes.rows;

    // Group scores by criterion
    const scoresByCriterion = new Map<string, any[]>();
    for (const score of scores) {
      if (!scoresByCriterion.has(score.criterion)) {
        scoresByCriterion.set(score.criterion, []);
      }
      scoresByCriterion.get(score.criterion)!.push(score);
    }

    // For each criterion, calculate Z-scores
    const outlierDetections: OutlierDetection[] = [];

    for (const [criterion, criterionScores] of scoresByCriterion) {
      // Use overridden scores if available, otherwise use original
      const values = criterionScores.map((s) =>
        s.is_overridden && s.overridden_score !== null
          ? parseFloat(s.overridden_score)
          : parseFloat(s.score)
      );

      const { mean, stdDev } = calculateStats(values);

      // Update Z-scores in database
      for (const score of criterionScores) {
        const scoreValue = score.is_overridden
          ? parseFloat(score.overridden_score)
          : parseFloat(score.score);
        const zScore = calculateZScore(scoreValue, mean, stdDev);
        const isOutlier = Math.abs(zScore) > outlierThreshold;

        await client.query(
          `UPDATE peer_review_scores
           SET z_score = $1, is_outlier = $2, updated_at = NOW()
           WHERE id = $3`,
          [zScore, isOutlier, score.id]
        );

        if (isOutlier) {
          outlierDetections.push({
            reviewToken: score.review_token,
            submissionId,
            criterion,
            score: scoreValue,
            mean,
            stdDev,
            zScore,
            isOutlier: true,
            threshold: outlierThreshold,
          });
        }
      }
    }

    // Create outlier flags for each detection
    for (const detection of outlierDetections) {
      // Check if flag already exists
      const existingRes = await client.query(
        `SELECT id FROM peer_review_outlier_flags
         WHERE assignment_id = $1 AND submission_id = $2 
           AND review_token = $3 AND criterion = $4
           AND resolved_at IS NULL`,
        [assignmentId, submissionId, detection.reviewToken, detection.criterion]
      );

      if (existingRes.rows.length === 0) {
        const flagId = randomUUID();
        await client.query(
          `INSERT INTO peer_review_outlier_flags (
            id, assignment_id, review_token, submission_id, criterion, 
            score, z_score, threshold
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            flagId,
            assignmentId,
            detection.reviewToken,
            submissionId,
            detection.criterion,
            detection.score,
            detection.zScore,
            detection.threshold,
          ]
        );

        // Audit log
        await client.query(
          `INSERT INTO peer_review_audit_log (
            id, assignment_id, action, review_token, submission_id, details
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            assignmentId,
            "outlier_flagged",
            detection.reviewToken,
            submissionId,
            JSON.stringify({
              criterion: detection.criterion,
              score: detection.score,
              zScore: detection.zScore,
              threshold: detection.threshold,
            }),
          ]
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get outlier flags for a submission
 */
export async function getOutlierFlags(submissionId: string): Promise<any[]> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT id, review_token, criterion, score, z_score, threshold, created_at, resolved_at, resolution_action
     FROM peer_review_outlier_flags
     WHERE submission_id = $1 AND resolved_at IS NULL
     ORDER BY created_at DESC`,
    [submissionId]
  );

  return res.rows;
}

/**
 * Get active outlier flags for assignment
 */
export async function getAssignmentOutlierFlags(assignmentId: string): Promise<
  {
    id: string;
    reviewToken: string;
    submissionId: string;
    criterion: string;
    score: number;
    zScore: number;
  }[]
> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT id, review_token, submission_id, criterion, score, z_score
     FROM peer_review_outlier_flags
     WHERE assignment_id = $1 AND resolved_at IS NULL
     ORDER BY created_at DESC`,
    [assignmentId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    reviewToken: row.review_token,
    submissionId: row.submission_id,
    criterion: row.criterion,
    score: parseFloat(row.score),
    zScore: parseFloat(row.z_score),
  }));
}
