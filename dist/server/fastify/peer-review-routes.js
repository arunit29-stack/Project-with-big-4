"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPeerReviewRoutes = registerPeerReviewRoutes;
const fastify_1 = require("../../lib/server/auth/fastify");
const config_1 = require("../../lib/server/peer-review/config");
const assign_1 = require("../../lib/server/peer-review/assign");
const review_1 = require("../../lib/server/peer-review/review");
const grade_1 = require("../../lib/server/peer-review/grade");
const outlier_1 = require("../../lib/server/peer-review/outlier");
async function registerPeerReviewRoutes(app) {
    /**
     * POST /assignments/:assignmentId/peer-review/configure
     * Configure peer review for assignment
     * Teacher only, before deadline
     */
    app.post("/assignments/:assignmentId/peer-review/configure", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        var _a;
        const { assignmentId } = request.params;
        try {
            const body = request.body;
            if (!body.rubric || !Array.isArray(body.rubric)) {
                return reply.code(400).send({ error: "rubric_required" });
            }
            if (!body.reviewDeadlineUtc) {
                return reply.code(400).send({ error: "review_deadline_required" });
            }
            const configId = await (0, config_1.configurePeerReview)(assignmentId, body);
            return reply.send({ configId });
        }
        catch (err) {
            const statusCode = ((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes("not_found")) ? 404 : 400;
            return reply.code(statusCode).send({ error: err.message });
        }
    });
    /**
     * POST /assignments/:assignmentId/peer-review/assign
     * Auto-assign submissions to reviewers
     * Teacher only, after submission deadline
     */
    app.post("/assignments/:assignmentId/peer-review/assign", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { assignmentId } = request.params;
        try {
            // Verify peer review is configured
            const isConfigured = await (0, config_1.isPeerReviewConfigured)(assignmentId);
            if (!isConfigured) {
                return reply
                    .code(400)
                    .send({ error: "peer_review_not_configured" });
            }
            const assignments = await (0, assign_1.assignPeerReviews)(assignmentId);
            return reply.send({
                assignmentCount: assignments.length,
                // CRITICAL: Never return reviewer_id in response
                message: "Assignments created successfully",
            });
        }
        catch (err) {
            return reply.code(400).send({ error: err.message });
        }
    });
    /**
     * POST /peer-review/:reviewToken/submit
     * Submit peer review
     * Role-blind endpoint - identified by review token only
     * CRITICAL: No identity checks, just token validation
     */
    app.post("/peer-review/:reviewToken/submit", async (request, reply) => {
        var _a;
        const { reviewToken } = request.params;
        try {
            // Validate token exists
            const assignment = await (0, assign_1.getAssignmentByReviewToken)(reviewToken);
            if (!assignment) {
                return reply.code(404).send({ error: "invalid_review_token" });
            }
            const body = request.body;
            if (!body.scores || !Array.isArray(body.scores)) {
                return reply.code(400).send({ error: "scores_required" });
            }
            await (0, review_1.submitPeerReview)(reviewToken, body);
            return reply.send({ ok: true });
        }
        catch (err) {
            const statusCode = ((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes("out_of_range")) ? 400 : 500;
            return reply.code(statusCode).send({ error: err.message });
        }
    });
    /**
     * GET /peer-review/:reviewToken/dashboard
     * Get submission to review (anonymous)
     * CRITICAL: No submitter name or identity exposed
     */
    app.get("/peer-review/:reviewToken/dashboard", async (request, reply) => {
        const { reviewToken } = request.params;
        try {
            const assignment = await (0, assign_1.getAssignmentByReviewToken)(reviewToken);
            if (!assignment) {
                return reply.code(404).send({ error: "invalid_review_token" });
            }
            const config = await (0, config_1.getPeerReviewConfig)(assignment.assignmentId);
            if (!config) {
                return reply.code(400).send({ error: "peer_review_not_configured" });
            }
            const submission = await (0, review_1.getReviewerSubmission)(reviewToken);
            if (!submission) {
                return reply.code(404).send({ error: "submission_not_found" });
            }
            const alreadySubmitted = await (0, review_1.isReviewSubmitted)(reviewToken);
            const dashboard = {
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
        }
        catch (err) {
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * PATCH /peer-review/:reviewId/override
     * Override a specific outlier score
     * Teacher only
     */
    app.patch("/peer-review/:reviewId/override", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { reviewId } = request.params;
        const body = request.body;
        try {
            // Parse reviewId as assignment:submission:reviewToken:criterion
            const [assignmentId, submissionId, reviewToken, criterion] = reviewId.split(":");
            if (!assignmentId || !submissionId || !reviewToken || !criterion) {
                return reply.code(400).send({ error: "invalid_review_id_format" });
            }
            if (body.newScore === undefined) {
                return reply.code(400).send({ error: "new_score_required" });
            }
            await (0, grade_1.overrideOutlierScore)(assignmentId, submissionId, reviewToken, criterion, body.newScore, `Teacher override: ${body.newScore}`, request.auth.userId);
            return reply.send({ ok: true });
        }
        catch (err) {
            return reply.code(400).send({ error: err.message });
        }
    });
    /**
     * DELETE /peer-review/reviewer/:reviewToken/discard
     * Discard all scores from a reviewer (bad-faith flag)
     * Teacher only
     */
    app.delete("/peer-review/reviewer/:reviewToken/discard", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { reviewToken } = request.params;
        const body = request.body;
        try {
            // Get assignment from token
            const assignment = await (0, assign_1.getAssignmentByReviewToken)(reviewToken);
            if (!assignment) {
                return reply.code(404).send({ error: "invalid_review_token" });
            }
            await (0, grade_1.discardReviewer)(assignment.assignmentId, assignment.submissionId, reviewToken, body.reason || "No reason provided", request.auth.userId);
            return reply.send({ ok: true });
        }
        catch (err) {
            return reply.code(400).send({ error: err.message });
        }
    });
    /**
     * GET /assignments/:assignmentId/peer-review/results
     * Get peer review results for all submissions
     * Teacher only
     */
    app.get("/assignments/:assignmentId/peer-review/results", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { assignmentId } = request.params;
        try {
            const config = await (0, config_1.getPeerReviewConfig)(assignmentId);
            if (!config) {
                return reply.code(400).send({ error: "peer_review_not_configured" });
            }
            // Get all submissions for assignment
            const pool = require("../db/postgres").getPostgresPool();
            const submissionsRes = await pool.query(`SELECT id FROM submissions WHERE assignment_id = $1`, [assignmentId]);
            const results = [];
            for (const submission of submissionsRes.rows) {
                const result = await (0, grade_1.calculateSubmissionResults)(assignmentId, submission.id);
                results.push(result);
            }
            // Get assignment-level outlier stats
            const outlierFlags = await (0, outlier_1.getAssignmentOutlierFlags)(assignmentId);
            return reply.send({
                assignmentId,
                submissionResults: results,
                reviewStats: {
                    totalSubmissions: results.length,
                    totalReviewsAssigned: results.reduce((sum, r) => sum + r.reviewCount, 0),
                    reviewsCompleted: results.reduce((sum, r) => sum + r.reviewsReceived.length, 0),
                    outlierCount: outlierFlags.length,
                },
            });
        }
        catch (err) {
            console.error("Error fetching results:", err);
            return reply.code(500).send({ error: err.message });
        }
    });
}
