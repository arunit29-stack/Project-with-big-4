import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/server/auth/fastify";
import {
  buildLibraryTree,
  confirmPdfUpload,
  createVideoTusSession,
  deleteLibraryFile,
  presignPdfUpload,
  setVideoStatus,
} from "../../lib/server/library/service";

export async function registerLibraryRoutes(app: FastifyInstance) {
  app.post(
    "/courses/:courseId/library/pdf/presign",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      const body = request.body as {
        week?: number;
        topic?: string;
        fileName?: string;
        size?: number;
        mimeType?: string;
      };
      if (
        typeof body.week !== "number" ||
        typeof body.topic !== "string" ||
        typeof body.fileName !== "string" ||
        typeof body.size !== "number" ||
        typeof body.mimeType !== "string"
      ) {
        return reply.code(400).send({ error: "invalid" });
      }
      try {
        return await presignPdfUpload({
          courseId,
          week: body.week,
          topic: body.topic,
          fileName: body.fileName,
          size: body.size,
          mimeType: body.mimeType,
        });
      } catch (error) {
        return reply.code(400).send({ error: "invalid" });
      }
    },
  );

  app.post(
    "/courses/:courseId/library/pdf/confirm",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      const body = request.body as {
        fileId?: string;
        week?: number;
        topic?: string;
        fileName?: string;
      };
      if (
        typeof body.fileId !== "string" ||
        typeof body.week !== "number" ||
        typeof body.topic !== "string" ||
        typeof body.fileName !== "string"
      ) {
        return reply.code(400).send({ error: "invalid" });
      }
      const ok = await confirmPdfUpload({
        courseId,
        fileId: body.fileId,
        week: body.week,
        topic: body.topic,
        fileName: body.fileName,
      });
      if (!ok) return reply.code(404).send({ error: "not_found" });
      return reply.send({ ok: true, indexQueued: true });
    },
  );

  app.get(
    "/courses/:courseId/library",
    { preHandler: requireAuth(["student", "teacher"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      try {
        const tree = await buildLibraryTree(courseId, request.auth.role, request.auth.userId);
        return reply.send({ weeks: tree });
      } catch (error) {
        if ((error as Error).message === "forbidden") {
          return reply.code(403).send({ error: "forbidden" });
        }
        return reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  app.delete(
    "/courses/:courseId/library/files/:fileId",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { courseId, fileId } = request.params as { courseId: string; fileId: string };
      const ok = await deleteLibraryFile(courseId, fileId);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      return reply.send({ ok: true });
    },
  );

  app.post(
    "/courses/:courseId/library/video/tus-init",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      const body = request.body as {
        fileHash?: string;
        fileName?: string;
        size?: number;
      };
      if (
        typeof body.fileHash !== "string" ||
        typeof body.fileName !== "string" ||
        typeof body.size !== "number"
      ) {
        return reply.code(400).send({ error: "invalid" });
      }
      const session = await createVideoTusSession({
        courseId,
        fileHash: body.fileHash,
        fileName: body.fileName,
        size: body.size,
      });
      return reply
        .header("Upload-URL", `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/courses/${courseId}/library/video/${session.uploadId}`)
        .header("Tus-Resumable", "1.0.0")
        .send({ uploadId: session.uploadId });
    },
  );

  app.patch(
    "/courses/:courseId/library/video/:videoId/status",
    async (request, reply) => {
      const { courseId, videoId } = request.params as { courseId: string; videoId: string };
      const body = request.body as { status?: "uploading" | "processing" | "ready" | "failed" };
      if (!body.status) {
        return reply.code(400).send({ error: "invalid" });
      }
      const ok = await setVideoStatus({
        courseId,
        videoId,
        status: body.status,
      });
      if (!ok) return reply.code(404).send({ error: "not_found" });
      return reply.send({ ok: true });
    },
  );
}
