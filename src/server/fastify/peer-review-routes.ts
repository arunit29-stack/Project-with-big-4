/**
 * Peer Review Routes
 * Double-blind peer grading endpoints
 * CRITICAL: Never expose reviewer identity or student IDs in responses
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../../lib/server/auth/fastify";
import {
  configurePeerReview,
  getPeerReviewConfig,
  isPeerReviewConfigured,
  getAssignmentRubric,
} from "../../lib/server/peer-review/config";
import { assignPeerReviews, getAssignmentByReviewToken } from "../../lib/server/peer-review/assign";
import {
  submitPeerReview,
  getReviewerSubmission,
  isReviewSubmitted,
} from "../../lib/server/peer-review/review";
import {
  overrideOutlierScore,
  discardReviewer,
  calculateSubmissionResults,
  storeSubmissionResults,
} from "../../lib/server/peer-review/grade";
import { getAssignmentOutlierFlags } from "../../lib/server/peer-review/outlier";
import type {
  ConfigurePeerReviewRequest,
  SubmitPeerReviewRequest,
  OverrideOutlierScoreRequest,
  DiscardReviewerRequest,
  ReviewerDashboard,
} from "../../types/peer-review";

export async function registerPeerReviewRoutes(app: FastifyInstance) {
  /**
   * POST /assignments/:assignmentId/peer-review/configure
   * Configure peer review for assignment
   * Teacher only, before deadline
   */
  app.post(
    "/assignments/:assignmentId/peer-review/configure",
    { preHandler: requireAuth(["teacher"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { assignmentId } = request.params as { assignmentId: string };

      try {
        const body = request.body as ConfigurePeerReviewRequest;

        if (!body.rubric || !Array.isArray(body.rubric)) {
          return reply.code(400).send({ error: "rubric_required" });
        }

        if (!body.reviewDeadlineUtc) {
          return reply.code(400).send({ error: "review_deadline_required" });
        }

        const configId = await configurePeerReview(assignmentId, body);
        return reply.send({ configId });
      } catch (err: any) {
        const statusCode = err.message?.includes("not_found") ? 404 : 400;
        return reply.code(statusCode).send({ error: err.message });
      }
    }
  );

  /**
   * POST /assignments/:assignmentId/peer-review/assign
   * Auto-assign submissions to reviewers
   * Teacher only, after submission deadline
   */
  app.post(
    "/assignments/:assignmentId/peer-review/assign",
    { preHandler: requireAuth(["teacher"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { assignmentId } = request.params as { assignmentId: string };

      try {
        // Verify peer review is configured
        const isConfigured = await isPeerReviewConfigured(assignmentId);
        if (!isConfigured) {
          return reply
            .code(400)
            .send({ error: "peer_review_not_configured" });
        }

        const assignments = await assignPeerReviews(assignmentId);
        return reply.send({
          assignmentCount: assignments.length,
          // CRITICAL: Never return reviewer_id in response
          message: "Assignments created successfully",
        });
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  );

  /**
   * POST /peer-review/:reviewToken/submit
   * Submit peer review
   * Role-blind endpoint - identified by review token only
   * CRITICAL: No identity checks, just token validation
   */
  app.post(
    "/peer-review/:reviewToken/submit",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewToken } = request.params as { reviewToken: string };

      try {
        // Validate token exists
        const assignment = await getAssignmentByReviewToken(reviewToken);
        if (!assignment) {
          return reply.code(404).send({ error: "invalid_review_token" });
        }

        const body = request.body as SubmitPeerReviewRequest;

        if (!body.scores || !Array.isArray(body.scores)) {
          return reply.code(400).send({ error: "scores_required" });
        }

        await submitPeerReview(reviewToken, body);
        return reply.send({ ok: true });
      } catch (err: any) {
        const statusCode = err.message?.includes("out_of_range") ? 400 : 500;
        return reply.code(statusCode).send({ error: err.message });
      }
    }
  );

  /**
   * GET /peer-review/:reviewToken/dashboard
   * Get submission to review (anonymous)
   * CRITICAL: No submitter name or identity exposed
   */
  app.get(
    "/peer-review/:reviewToken/dashboard",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewToken } = request.params as { reviewToken: string };

      try {
        const assignment = await getAssignmentByReviewToken(reviewToken);
        if (!assignment) {
          return reply.code(404).send({ error: "invalid_review_token" });
        }

        const config = await getPeerReviewConfig(assignment.assignmentId);
        if (!config) {
          return reply.code(400).send({ error: "peer_review_not_configured" });
        }

        const submission = await getReviewerSubmission(reviewToken);
        if (!submission) {
          return reply.code(404).send({ error: "submission_not_found" });
        }

        const alreadySubmitted = await isReviewSubmitted(reviewToken);

        const dashboard: ReviewerDashboard = {
          reviewToken,
          assignmentId: assignment.assignmentId,
          assignmentTitle: "Assignment Title", // TODO: fetch from assignments table
          rubric: config.rubric,
          reviewDeadline: config.reviewDeadlineUtc,
          submissionToReview: {
            submissionId: submission.submissionId,
            content: submission.content,
          },
          alreadySubmitted,
          submittedAt: undefined,
        };

        return reply.send(dashboard);
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  /**
   * PATCH /peer-review/:reviewId/override
   * Override a specific outlier score
   * Teacher only
   */
  app.patch(
    "/peer-review/:reviewId/override",
    { preHandler: requireAuth(["teacher"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewId } = request.params as { reviewId: string };
      const body = request.body as OverrideOutlierScoreRequest;

      try {
        // Parse reviewId as assignment:submission:reviewToken:criterion
        const [assignmentId, submissionId, reviewToken, criterion] =
          reviewId.split(":");

        if (!assignmentId || !submissionId || !reviewToken || !criterion) {
          return reply.code(400).send({ error: "invalid_review_id_format" });
        }

        if (body.newScore === undefined) {
          return reply.code(400).send({ error: "new_score_required" });
        }

        await overrideOutlierScore(
          assignmentId,
          submissionId,
          reviewToken,
          criterion,
          body.newScore,
          `Teacher override: ${body.newScore}`,
          request.auth.userId
        );

        return reply.send({ ok: true });
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  );

  /**
   * DELETE /peer-review/reviewer/:reviewToken/discard
   * Discard all scores from a reviewer (bad-faith flag)
   * Teacher only
   */
  app.delete(
    "/peer-review/reviewer/:reviewToken/discard",
    { preHandler: requireAuth(["teacher"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewToken } = request.params as { reviewToken: string };
      const body = request.body as DiscardReviewerRequest;

      try {
        // Get assignment from token
        const assignment = await getAssignmentByReviewToken(reviewToken);
        if (!assignment) {
          return reply.code(404).send({ error: "invalid_review_token" });
        }

        await discardReviewer(
          assignment.assignmentId,
          assignment.submissionId,
          reviewToken,
          body.reason || "No reason provided",
          request.auth.userId
        );

        return reply.send({ ok: true });
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  );

  /**
   * GET /assignments/:assignmentId/peer-review/results
   * Get peer review results for all submissions
   * Teacher only
   */
  app.get(
    "/assignments/:assignmentId/peer-review/results",
    { preHandler: requireAuth(["teacher"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { assignmentId } = request.params as { assignmentId: string };

      try {
        const config = await getPeerReviewConfig(assignmentId);
        if (!config) {
          return reply.code(400).send({ error: "peer_review_not_configured" });
        }

        // Get all submissions for assignment
        const pool = require("../db/postgres").getPostgresPool();
        const submissionsRes = await pool.query(
          `SELECT id FROM submissions WHERE assignment_id = $1`,
          [assignmentId]
        );

        const results = [];
        for (const submission of submissionsRes.rows) {
          const result = await calculateSubmissionResults(
            assignmentId,
            submission.id
          );
          results.push(result);
        }

        // Get assignment-level outlier stats
        const outlierFlags = await getAssignmentOutlierFlags(assignmentId);

        return reply.send({
          assignmentId,
          submissionResults: results,
          reviewStats: {
            totalSubmissions: results.length,
            totalReviewsAssigned: results.reduce((sum, r) => sum + r.reviewCount, 0),
            reviewsCompleted: results.reduce(
              (sum, r) => sum + r.reviewsReceived.length,
              0
            ),
            outlierCount: outlierFlags.length,
          },
        });
      } catch (err: any) {
        console.error("Error fetching results:", err);
        return reply.code(500).send({ error: err.message });
      }
    }
  );
}
