import { randomUUID } from "crypto";
import { getPostgresPool } from "../db/postgres";
import { getCourseDetail, getStudentCourses } from "../../api/courseStore";
import { getRedisPublisher } from "../notifications/redis";
import type { Role } from "../auth/types";

export type SessionState = "scheduled" | "active" | "ended";

export interface LiveSessionRecord {
  id: string;
  course_id: string;
  created_by: string;
  state: SessionState;
  wind_down_minutes: number;
  created_at: string;
  active_until: string | null;
  ended_at: string | null;
}

export interface LiveSessionMessageRecord {
  id: string;
  session_id: string;
  course_id: string;
  student_id: string | null;
  student_name: string | null;
  sender_id: string;
  sender_name: string;
  sender_role: Role;
  body: string;
  created_at: string;
  retained_until: string;
  pinned_at: string | null;
  deleted_at: string | null;
}

type SessionParticipantRole = "teacher" | "student";

function hasCourseAccess(courseId: string, userId: string, role: SessionParticipantRole): boolean {
  if (role === "teacher") {
    return Boolean(getCourseDetail(courseId, "teacher") || getCourseDetail(courseId, "admin"));
  }
  return getStudentCourses().some((course) => course.id === courseId);
}

export async function createSession(input: {
  courseId: string;
  teacherId: string;
  windDownMinutes?: number;
}): Promise<LiveSessionRecord> {
  if (!getCourseDetail(input.courseId, "teacher")) {
    throw new Error("forbidden");
  }
  const result = await getPostgresPool().query<LiveSessionRecord>(
    `
      INSERT INTO live_sessions (
        id, course_id, created_by, state, wind_down_minutes, created_at
      ) VALUES ($1,$2,$3,'scheduled',$4,NOW())
      RETURNING *
    `,
    [randomUUID(), input.courseId, input.teacherId, Math.min(10, Math.max(0, input.windDownMinutes ?? 0))],
  );
  return result.rows[0];
}

export async function getSession(sessionId: string): Promise<LiveSessionRecord | null> {
  const result = await getPostgresPool().query<LiveSessionRecord>(
    `SELECT * FROM live_sessions WHERE id = $1 LIMIT 1`,
    [sessionId],
  );
  return result.rows[0] ?? null;
}

export async function setSessionState(sessionId: string, state: SessionState): Promise<void> {
  await getPostgresPool().query(
    `
      UPDATE live_sessions
      SET state = $2,
          active_until = CASE WHEN $2 = 'ended' THEN NOW() + (wind_down_minutes || ' minutes')::interval ELSE active_until END,
          ended_at = CASE WHEN $2 = 'ended' THEN NOW() ELSE ended_at END
      WHERE id = $1
    `,
    [sessionId, state],
  );
}

export async function canJoinSession(sessionId: string, userId: string, role: SessionParticipantRole): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) return false;
  if (role === "teacher") {
    return hasCourseAccess(session.course_id, userId, role);
  }
  return hasCourseAccess(session.course_id, userId, role);
}

export async function insertChatMessage(input: {
  sessionId: string;
  courseId: string;
  senderId: string;
  senderName: string;
  senderRole: Role;
  body: string;
}): Promise<LiveSessionMessageRecord> {
  const result = await getPostgresPool().query<LiveSessionMessageRecord>(
    `
      INSERT INTO live_session_messages (
        id, session_id, course_id, sender_id, sender_name, sender_role, body, created_at, retained_until
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW() + INTERVAL '2 years')
      RETURNING *
    `,
    [randomUUID(), input.sessionId, input.courseId, input.senderId, input.senderName, input.senderRole, input.body],
  );
  return result.rows[0];
}

export async function listSessionMessages(sessionId: string): Promise<LiveSessionMessageRecord[]> {
  const result = await getPostgresPool().query<LiveSessionMessageRecord>(
    `
      SELECT *
      FROM live_session_messages
      WHERE session_id = $1
      ORDER BY created_at ASC
    `,
    [sessionId],
  );
  return result.rows;
}

export async function pinSessionMessage(sessionId: string, messageId: string): Promise<boolean> {
  const result = await getPostgresPool().query(
    `
      UPDATE live_session_messages
      SET pinned_at = NOW()
      WHERE session_id = $1 AND id = $2
    `,
    [sessionId, messageId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function removeSessionMessage(sessionId: string, messageId: string): Promise<boolean> {
  const result = await getPostgresPool().query(
    `
      UPDATE live_session_messages
      SET deleted_at = COALESCE(deleted_at, NOW()), body = '[Removed]'
      WHERE session_id = $1 AND id = $2
    `,
    [sessionId, messageId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function muteSessionStudent(sessionId: string, studentId: string): Promise<void> {
  await getPostgresPool().query(
    `
      INSERT INTO live_session_mutes (session_id, student_id, created_at)
      VALUES ($1,$2,NOW())
      ON CONFLICT (session_id, student_id) DO NOTHING
    `,
    [sessionId, studentId],
  );
}

export async function isStudentMuted(sessionId: string, studentId: string): Promise<boolean> {
  const result = await getPostgresPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM live_session_mutes WHERE session_id = $1 AND student_id = $2`,
    [sessionId, studentId],
  );
  return Number(result.rows[0]?.count ?? 0) > 0;
}

export async function setSlowMode(sessionId: string, enabled: boolean, intervalSeconds: number): Promise<number> {
  const redis = await getRedisPublisher();
  if (!redis) return 0;
  const key = `slow:${sessionId}`;
  const seconds = enabled ? Math.min(30, Math.max(1, intervalSeconds || 30)) : 0;
  if (seconds > 0) {
    await redis.set(key, String(seconds), { EX: seconds });
  } else {
    await redis.del(key);
  }
  return seconds;
}

export async function getSlowModeSeconds(sessionId: string): Promise<number> {
  const redis = await getRedisPublisher();
  if (!redis) return 0;
  const key = `slow:${sessionId}`;
  const value = await redis.get(key);
  return value ? Number(value) || 0 : 0;
}

export async function getSessionCourseId(sessionId: string): Promise<string | null> {
  const session = await getSession(sessionId);
  return session?.course_id ?? null;
}

export async function getLatestSessionForCourse(courseId: string): Promise<LiveSessionRecord | null> {
  const result = await getPostgresPool().query<LiveSessionRecord>(
    `
      SELECT *
      FROM live_sessions
      WHERE course_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [courseId],
  );
  return result.rows[0] ?? null;
}

export async function saveDm(input: {
  courseId: string;
  senderId: string;
  senderRole: "teacher" | "student";
  studentId: string;
  messageType: "text" | "voice_note" | "file";
  body?: string | null;
  fileKey?: string | null;
}): Promise<void> {
  await getPostgresPool().query(
    `
      INSERT INTO live_session_dms (
        id, course_id, student_id, sender_id, sender_role, message_type, body, file_key, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
    `,
    [
      randomUUID(),
      input.courseId,
      input.studentId,
      input.senderId,
      input.senderRole,
      input.messageType,
      input.body ?? null,
      input.fileKey ?? null,
    ],
  );
}

export async function listDmThread(input: {
  courseId: string;
  studentId: string;
}): Promise<Array<{ id: string; senderId: string; senderRole: "teacher" | "student"; type: "text" | "voice_note" | "file"; body: string | null; fileKey: string | null; createdAt: string }>> {
  const result = await getPostgresPool().query(
    `
      SELECT id, sender_id, sender_role, message_type, body, file_key, created_at
      FROM live_session_dms
      WHERE course_id = $1 AND student_id = $2
      ORDER BY created_at ASC
    `,
    [input.courseId, input.studentId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    type: row.message_type,
    body: row.body,
    fileKey: row.file_key,
    createdAt: row.created_at,
  }));
}
