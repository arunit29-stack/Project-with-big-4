/**
 * Admin Dashboard Routes
 * Institution-level management endpoints
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../../lib/server/auth/fastify";
import {
  bulkEnrolUsers,
  createUser,
  deleteUser,
  resetUserPassword,
} from "../../lib/server/admin/users";
import { transferCourse } from "../../lib/server/admin/transfer";
import { exportGradesAsCSV, getExportSummary } from "../../lib/server/admin/export";
import { purgeUserPII, listGDPRPurges } from "../../lib/server/admin/gdpr";
import {
  getInstitutionSettings,
  updateInstitutionSettings,
} from "../../lib/server/admin/settings";
import type {
  BulkEnrolRequest,
  CreateUserRequest,
  ResetPasswordRequest,
  CourseTransferRequest,
  GDPRPurgeRequest,
  UpdateInstitutionSettingsRequest,
} from "../../types/admin";

export async function registerAdminRoutes(app: FastifyInstance) {
  /**
   * POST /admin/users/bulk-enrol
   * Bulk enrol users from CSV
   * Admin only
   */
  app.post(
    "/admin/users/bulk-enrol",
    { preHandler: requireAuth(["admin"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as BulkEnrolRequest;

        if (!body.csv) {
          return reply.code(400).send({ error: "csv_content_required" });
        }

        const result = await bulkEnrolUsers(request.auth.institutionId, body.csv);
        return reply.send(result);
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  /**
   * POST /admin/users
   * Create single user (teacher or student)
   * Admin only
   */
  app.post(
    "/admin/users",
    { preHandler: requireAuth(["admin"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as CreateUserRequest;

        if (!body.email || !body.name || !body.role) {
          return reply.code(400).send({ error: "missing_required_fields" });
        }

        const result = await createUser(request.auth.institutionId, body);
        return reply.send(result);
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  );

  /**
   * DELETE /admin/users/:userId
   * Soft delete user (removes from enrollments, invalidates sessions)
   * Admin only
   */
  app.delete(
    "/admin/users/:userId",
    { preHandler: requireAuth(["admin"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };

      try {
        const reason = (request.body as any)?.reason;

        await deleteUser(
          userId,
          request.auth.userId,
          request.auth.institutionId,
          reason
        );

        return reply.send({ ok: true });
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  );

  /**
   * PATCH /admin/users/:userId/reset-password
   * Reset user password (send temp password via email)
   * Admin only
   */
  app.patch(
    "/admin/users/:userId/reset-password",
    { preHandler: requireAuth(["admin"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };

      try {
        const tempPassword = await resetUserPassword(userId);

        return reply.send({
          userId,
          tempPassword,
          message: "Temporary password sent to user email",
        });
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  );

  /**
   * POST /admin/courses/:courseId/transfer
   * Transfer course ownership and all assets to new teacher
   * Admin only, atomic transaction
   */
  app.post(
    "/admin/courses/:courseId/transfer",
    { preHandler: requireAuth(["admin"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { courseId } = request.params as { courseId: string };

      try {
        const body = request.body as CourseTransferRequest;

        if (!body.newTeacherUserId) {
          return reply.code(400).send({ error: "new_teacher_user_id_required" });
        }

        const result = await transferCourse(
          courseId,
          body.newTeacherUserId,
          request.auth.userId,
          request.auth.institutionId
        );

        return reply.send(result);
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  );

  /**
   * GET /admin/institutions/:institutionId/grades/export
   * Export all grades as CSV
   * Admin only
   */
  app.get(
    "/admin/institutions/:institutionId/grades/export",
    { preHandler: requireAuth(["admin"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { institutionId } = request.params as { institutionId: string };

      try {
        // Verify admin is from same institution
        if (request.auth.institutionId !== institutionId) {
          return reply.code(403).send({ error: "forbidden" });
        }

        const csv = await exportGradesAsCSV(institutionId);
        const summary = await getExportSummary(institutionId);

        // Return as downloadable file
        reply.type("text/csv");
        reply.header(
          "Content-Disposition",
          `attachment; filename="grades-export-${new Date().toISOString().split("T")[0]}.csv"`
        );

        return reply.send(csv);
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  /**
   * DELETE /admin/users/:userId/purge-pii
   * Full GDPR/FERPA PII purge (irreversible)
   * Admin only, immutable audit trail
   */
  app.delete(
    "/admin/users/:userId/purge-pii",
    { preHandler: requireAuth(["admin"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };

      try {
        const reason = (request.body as any)?.reason;

        const result = await purgeUserPII(
          userId,
          request.auth.userId,
          request.auth.institutionId,
          reason
        );

        return reply.send(result);
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  /**
   * GET /admin/institutions/:institutionId/settings
   * Get institution settings (SSO, branding, features)
   * Admin only
   */
  app.get(
    "/admin/institutions/:institutionId/settings",
    { preHandler: requireAuth(["admin"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { institutionId } = request.params as { institutionId: string };

      try {
        // Verify admin is from same institution
        if (request.auth.institutionId !== institutionId) {
          return reply.code(403).send({ error: "forbidden" });
        }

        const settings = await getInstitutionSettings(institutionId);

        if (!settings) {
          return reply.code(404).send({ error: "settings_not_found" });
        }

        return reply.send(settings);
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  /**
   * PATCH /admin/institutions/:institutionId/settings
   * Update institution settings
   * Admin only
   */
  app.patch(
    "/admin/institutions/:institutionId/settings",
    { preHandler: requireAuth(["admin"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { institutionId } = request.params as { institutionId: string };

      try {
        // Verify admin is from same institution
        if (request.auth.institutionId !== institutionId) {
          return reply.code(403).send({ error: "forbidden" });
        }

        const body = request.body as UpdateInstitutionSettingsRequest;
        const updated = await updateInstitutionSettings(institutionId, body);

        return reply.send(updated);
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  /**
   * GET /admin/institutions/:institutionId/gdpr-audit-log
   * List all GDPR purges (immutable audit log)
   * Admin only
   */
  app.get(
    "/admin/institutions/:institutionId/gdpr-audit-log",
    { preHandler: requireAuth(["admin"]) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { institutionId } = request.params as { institutionId: string };

      try {
        // Verify admin is from same institution
        if (request.auth.institutionId !== institutionId) {
          return reply.code(403).send({ error: "forbidden" });
        }

        const purges = await listGDPRPurges(institutionId);
        return reply.send({ purges });
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );
}
