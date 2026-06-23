/**
 * Peer Review Assignment Algorithm
 * Assigns submissions to peer reviewers after deadline
 * CRITICAL: No self-review constraint, even distribution
 */
import { randomUUID } from "crypto";
import { getPostgresPool } from "../db/postgres";
import { getPeerReviewConfig } from "./config";
import type { PeerReviewAssignment } from "../../types/peer-review";

/**
 * Generate cryptographically secure review token
 * CRITICAL: This token is unrecoverable without server-side lookup
 */
function generateReviewToken(): string {
  // 32 bytes = 256-bit entropy, hex encoded = 64 chars
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

/**
 * Assign submissions to peer reviewers
 * Rules:
 * 1. No student reviews their own work (hard constraint)
 * 2. Each reviewer gets exactly reviewersPerSubmission assignments
 * 3. Each submission gets reviewed by reviewersPerSubmission reviewers
 * 4. Reviewer identities stored server-side only, never exposed to students
 */
export async function assignPeerReviews(
  assignmentId: string
): Promise<PeerReviewAssignment[]> {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get peer review config
    const config = await getPeerReviewConfig(assignmentId);
    if (!config) {
      throw new Error("peer_review_not_configured");
    }

    const reviewersPerSubmission = config.reviewersPerSubmission;

    // Get all submissions for this assignment (student_id, submission_id)
    const submissionsRes = await client.query(
      `SELECT DISTINCT user_id, id FROM submissions
       WHERE assignment_id = $1
       ORDER BY user_id`,
      [assignmentId]
    );

    const submissions = submissionsRes.rows.map((row) => ({
      submitterId: row.user_id,
      submissionId: row.id,
    }));

    if (submissions.length === 0) {
      await client.query("ROLLBACK");
      return [];
    }

    // Check for existing assignments (avoid duplicate runs)
    const existingRes = await client.query(
      `SELECT COUNT(*) as count FROM peer_review_assignments
       WHERE assignment_id = $1`,
      [assignmentId]
    );

    if (parseInt(existingRes.rows[0].count, 10) > 0) {
      await client.query("ROLLBACK");
      throw new Error("assignments_already_exist");
    }

    const assignments: PeerReviewAssignment[] = [];
    const studentIds = submissions.map((s) => s.submitterId);

    // Fisher-Yates shuffle for randomness
    function shuffle<T>(array: T[]): T[] {
      const copy = [...array];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }

    // For each submission, assign reviewers
    for (const submission of submissions) {
      const submitterId = submission.submitterId;
      const submissionId = submission.submissionId;

      // Get potential reviewers (all students except submitter)
      const potentialReviewers = studentIds.filter((id) => id !== submitterId);

      if (potentialReviewers.length < reviewersPerSubmission) {
        throw new Error(
          `not_enough_reviewers_for_submission: need ${reviewersPerSubmission}, have ${potentialReviewers.length}`
        );
      }

      // Randomly select reviewers for this submission
      const selectedReviewers = shuffle(potentialReviewers).slice(
        0,
        reviewersPerSubmission
      );

      for (const reviewerId of selectedReviewers) {
        const assignmentId_ = randomUUID();
        const reviewToken = generateReviewToken();

        // Create review token
        await client.query(
          `INSERT INTO review_tokens (token, assignment_id, reviewer_id, submitter_id)
           VALUES ($1, $2, $3, $4)`,
          [reviewToken, assignmentId, reviewerId, submitterId]
        );

        // Create assignment
        await client.query(
          `INSERT INTO peer_review_assignments (
            id, assignment_id, reviewer_id, submitter_id, submission_id, review_token, status
          ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
          [
            assignmentId_,
            assignmentId,
            reviewerId,
            submitterId,
            submissionId,
            reviewToken,
          ]
        );

        assignments.push({
          id: assignmentId_,
          assignmentId,
          reviewerId, // Internal only
          submitterId, // Internal only
          submissionId,
          reviewToken, // External facing
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    await client.query("COMMIT");
    return assignments;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get assignments for a reviewer (internal use only)
 * Do NOT return this to student API
 */
export async function getReviewerAssignments(
  assignmentId: string,
  reviewerId: string
): Promise<PeerReviewAssignment[]> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT id, assignment_id, reviewer_id, submitter_id, submission_id, review_token, status, created_at, updated_at
     FROM peer_review_assignments
     WHERE assignment_id = $1 AND reviewer_id = $2`,
    [assignmentId, reviewerId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    assignmentId: row.assignment_id,
    reviewerId: row.reviewer_id,
    submitterId: row.submitter_id,
    submissionId: row.submission_id,
    reviewToken: row.review_token,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

/**
 * Get assignment by review token (for reviewer view)
 * CRITICAL: Return ONLY reviewToken, never reviewer_id
 */
export async function getAssignmentByReviewToken(reviewToken: string): Promise<{
  assignmentId: string;
  submissionId: string;
  submitterId: string; // For internal verification only
  reviewerId: string; // For internal verification only
} | null> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT a.assignment_id, a.submission_id, a.submitter_id, a.reviewer_id
     FROM peer_review_assignments a
     WHERE a.review_token = $1`,
    [reviewToken]
  );

  if (res.rows.length === 0) {
    return null;
  }

  return {
    assignmentId: res.rows[0].assignment_id,
    submissionId: res.rows[0].submission_id,
    submitterId: res.rows[0].submitter_id,
    reviewerId: res.rows[0].reviewer_id,
  };
}

/**
 * Count assignments for assignment
 */
export async function countAssignments(assignmentId: string): Promise<number> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT COUNT(*) as count FROM peer_review_assignments
     WHERE assignment_id = $1`,
    [assignmentId]
  );

  return parseInt(res.rows[0].count, 10);
}

/**
 * Count completed assignments
 */
export async function countCompletedAssignments(
  assignmentId: string
): Promise<number> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT COUNT(*) as count FROM peer_review_assignments
     WHERE assignment_id = $1 AND status = 'submitted'`,
    [assignmentId]
  );

  return parseInt(res.rows[0].count, 10);
}
