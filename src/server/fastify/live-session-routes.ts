import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/server/auth/fastify";
import { createLiveKitToken } from "../../lib/server/live-session/livekit";
import {
  createSession,
  getSession,
  getLatestSessionForCourse,
  isStudentMuted,
  listDmThread,
  muteSessionStudent,
  pinSessionMessage,
  removeSessionMessage,
  saveDm,
  setSlowMode,
  setSessionState,
} from "../../lib/server/live-session/service";
import { publishLiveSessionEvent } from "../../lib/server/live-session/ws";
import { getCourseDetail, getStudentCourses } from "../../lib/api/courseStore";

type Role = "teacher" | "student";

function teacherOwnsCourse(courseId: string): boolean {
  return Boolean(getCourseDetail(courseId, "teacher") || getCourseDetail(courseId, "admin"));
}

function studentHasCourse(courseId: string): boolean {
  return getStudentCourses().some((course) => course.id === courseId);
}

function isAuthorizedForCourse(courseId: string, role: Role): boolean {
  return role === "teacher" ? teacherOwnsCourse(courseId) : studentHasCourse(courseId);
}

async function assertSessionAccess(sessionId: string, role: Role) {
  const session = await getSession(sessionId);
  if (!session) return null;
  const courseId = session.course_id;
  if (!isAuthorizedForCourse(courseId, role)) return null;
  return session;
}

export async function registerLiveSessionRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/courses/:courseId/sessions",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      const body = request.body as { wind_down_minutes?: number } | undefined;
      if (!teacherOwnsCourse(courseId)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const session = await createSession({
        courseId,
        teacherId: request.auth.userId,
        windDownMinutes: body?.wind_down_minutes,
      });
      return reply.send({ sessionId: session.id, state: session.state, windDownMinutes: session.wind_down_minutes });
    },
  );

  app.post(
    "/sessions/:sessionId/call/token",
    { preHandler: requireAuth(["teacher", "student"]) },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const session = await assertSessionAccess(sessionId, request.auth.role === "teacher" ? "teacher" : "student");
      if (!session) return reply.code(404).send({ error: "not_found" });

      const canPublish = request.auth.role === "teacher" || !(await isStudentMuted(sessionId, request.auth.userId));
      const token = await createLiveKitToken({
        sessionId,
        userId: request.auth.userId,
        name: request.auth.email,
        role: request.auth.role === "teacher" ? "teacher" : "student",
        canPublish,
      });

      return reply.send(token);
    },
  );

  app.post(
    "/sessions/:sessionId/call/grant-mic/:studentId",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { sessionId, studentId } = request.params as { sessionId: string; studentId: string };
      const session = await assertSessionAccess(sessionId, "teacher");
      if (!session) return reply.code(404).send({ error: "not_found" });
      const token = await createLiveKitToken({
        sessionId,
        userId: studentId,
        name: studentId,
        role: "student",
        canPublish: true,
      });
      return reply.send(token);
    },
  );

  app.post(
    "/sessions/:sessionId/call/record/start",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const session = await assertSessionAccess(sessionId, "teacher");
      if (!session) return reply.code(404).send({ error: "not_found" });
      await publishLiveSessionEvent(sessionId, {
        type: "rec:started",
        payload: { consentBanner: { title: "Recording started", body: "By continuing, you consent to being recorded." } },
      });
      return reply.send({ ok: true });
    },
  );

  app.post(
    "/sessions/:sessionId/call/record/stop",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const session = await assertSessionAccess(sessionId, "teacher");
      if (!session) return reply.code(404).send({ error: "not_found" });
      await publishLiveSessionEvent(sessionId, { type: "rec:stopped", payload: {} });
      return reply.send({ ok: true });
    },
  );

  app.post(
    "/sessions/:sessionId/call/opt-out",
    { preHandler: requireAuth(["student"]) },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const session = await assertSessionAccess(sessionId, "student");
      if (!session) return reply.code(404).send({ error: "not_found" });
      await muteSessionStudent(sessionId, request.auth.userId);
      return reply.send({ ok: true });
    },
  );

  app.post(
    "/sessions/:sessionId/messages/:messageId/pin",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { sessionId, messageId } = request.params as { sessionId: string; messageId: string };
      const session = await assertSessionAccess(sessionId, "teacher");
      if (!session) return reply.code(404).send({ error: "not_found" });
      const ok = await pinSessionMessage(sessionId, messageId);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      await publishLiveSessionEvent(sessionId, { type: "chat:pinned", payload: { messageId } });
      return reply.send({ ok: true });
    },
  );

  app.delete(
    "/sessions/:sessionId/messages/:messageId",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { sessionId, messageId } = request.params as { sessionId: string; messageId: string };
      const session = await assertSessionAccess(sessionId, "teacher");
      if (!session) return reply.code(404).send({ error: "not_found" });
      const ok = await removeSessionMessage(sessionId, messageId);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      await publishLiveSessionEvent(sessionId, { type: "chat:removed", payload: { messageId } });
      return reply.send({ ok: true });
    },
  );

  app.post(
    "/sessions/:sessionId/students/:studentId/mute",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { sessionId, studentId } = request.params as { sessionId: string; studentId: string };
      const session = await assertSessionAccess(sessionId, "teacher");
      if (!session) return reply.code(404).send({ error: "not_found" });
      await muteSessionStudent(sessionId, studentId);
      return reply.send({ ok: true });
    },
  );

  app.post(
    "/sessions/:sessionId/slow-mode",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const session = await assertSessionAccess(sessionId, "teacher");
      if (!session) return reply.code(404).send({ error: "not_found" });
      const body = request.body as { enabled?: boolean; intervalSeconds?: number } | undefined;
      const enabled = Boolean(body?.enabled);
      const intervalSeconds = Math.min(30, Math.max(1, Number(body?.intervalSeconds ?? 30)));
      const seconds = await setSlowMode(sessionId, enabled, intervalSeconds);
      await publishLiveSessionEvent(sessionId, { type: "chat:slow-mode", payload: { seconds } });
      return reply.send({ ok: true, seconds });
    },
  );

  app.get(
    "/courses/:courseId/dm",
    { preHandler: requireAuth(["student"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      if (!studentHasCourse(courseId)) return reply.code(403).send({ error: "forbidden" });
      return reply.send({ thread: await listDmThread({ courseId, studentId: request.auth.userId }) });
    },
  );

  app.post(
    "/courses/:courseId/dm",
    { preHandler: requireAuth(["student"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      if (!studentHasCourse(courseId)) return reply.code(403).send({ error: "forbidden" });
      const body = request.body as { type?: "text" | "voice_note" | "file"; body?: string; fileKey?: string } | undefined;
      if (!body?.type) return reply.code(400).send({ error: "invalid" });
      await saveDm({
        courseId,
        studentId: request.auth.userId,
        senderId: request.auth.userId,
        senderRole: "student",
        messageType: body.type,
        body: body.body,
        fileKey: body.fileKey,
      });
      return reply.send({ ok: true });
    },
  );

  app.get(
    "/courses/:courseId/dm/:studentId",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { courseId, studentId } = request.params as { courseId: string; studentId: string };
      if (!teacherOwnsCourse(courseId)) return reply.code(403).send({ error: "forbidden" });
      return reply.send({ thread: await listDmThread({ courseId, studentId }) });
    },
  );

  app.post(
    "/courses/:courseId/dm/:studentId",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { courseId, studentId } = request.params as { courseId: string; studentId: string };
      if (!teacherOwnsCourse(courseId)) return reply.code(403).send({ error: "forbidden" });
      const body = request.body as { type?: "text" | "voice_note" | "file"; body?: string; fileKey?: string } | undefined;
      if (!body?.type) return reply.code(400).send({ error: "invalid" });
      await saveDm({
        courseId,
        studentId,
        senderId: request.auth.userId,
        senderRole: "teacher",
        messageType: body.type,
        body: body.body,
        fileKey: body.fileKey,
      });
      return reply.send({ ok: true });
    },
  );

  app.post(
    "/courses/:courseId/live-session/livekit-token",
    { preHandler: requireAuth(["teacher", "student"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      const session = await getLatestSessionForCourse(courseId);
      if (!session && !isAuthorizedForCourse(courseId, request.auth.role === "teacher" ? "teacher" : "student")) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const token = await createLiveKitToken({
        sessionId: session?.id ?? courseId,
        userId: request.auth.userId,
        name: request.auth.email,
        role: request.auth.role === "teacher" ? "teacher" : "student",
        canPublish: request.auth.role === "teacher",
      });
      return reply.send(token);
    },
  );

  app.post(
    "/courses/:courseId/live-session/recording/opt-out",
    { preHandler: requireAuth(["student"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      if (!studentHasCourse(courseId)) return reply.code(403).send({ error: "forbidden" });
      const session = await getLatestSessionForCourse(courseId);
      if (session) {
        await muteSessionStudent(session.id, request.auth.userId);
      }
      return reply.send({ ok: true });
    },
  );
}
