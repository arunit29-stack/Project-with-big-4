"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSession = createSession;
exports.getSession = getSession;
exports.setSessionState = setSessionState;
exports.canJoinSession = canJoinSession;
exports.insertChatMessage = insertChatMessage;
exports.listSessionMessages = listSessionMessages;
exports.pinSessionMessage = pinSessionMessage;
exports.removeSessionMessage = removeSessionMessage;
exports.muteSessionStudent = muteSessionStudent;
exports.isStudentMuted = isStudentMuted;
exports.setSlowMode = setSlowMode;
exports.getSlowModeSeconds = getSlowModeSeconds;
exports.getSessionCourseId = getSessionCourseId;
exports.getLatestSessionForCourse = getLatestSessionForCourse;
exports.saveDm = saveDm;
exports.listDmThread = listDmThread;
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
const courseStore_1 = require("../../api/courseStore");
const redis_1 = require("../notifications/redis");
function hasCourseAccess(courseId, userId, role) {
    if (role === "teacher") {
        return Boolean((0, courseStore_1.getCourseDetail)(courseId, "teacher") || (0, courseStore_1.getCourseDetail)(courseId, "admin"));
    }
    return (0, courseStore_1.getStudentCourses)().some((course) => course.id === courseId);
}
async function createSession(input) {
    var _a;
    if (!(0, courseStore_1.getCourseDetail)(input.courseId, "teacher")) {
        throw new Error("forbidden");
    }
    const result = await (0, postgres_1.getPostgresPool)().query(`
      INSERT INTO live_sessions (
        id, course_id, created_by, state, wind_down_minutes, created_at
      ) VALUES ($1,$2,$3,'scheduled',$4,NOW())
      RETURNING *
    `, [(0, crypto_1.randomUUID)(), input.courseId, input.teacherId, Math.min(10, Math.max(0, (_a = input.windDownMinutes) !== null && _a !== void 0 ? _a : 0))]);
    return result.rows[0];
}
async function getSession(sessionId) {
    var _a;
    const result = await (0, postgres_1.getPostgresPool)().query(`SELECT * FROM live_sessions WHERE id = $1 LIMIT 1`, [sessionId]);
    return (_a = result.rows[0]) !== null && _a !== void 0 ? _a : null;
}
async function setSessionState(sessionId, state) {
    await (0, postgres_1.getPostgresPool)().query(`
      UPDATE live_sessions
      SET state = $2,
          active_until = CASE WHEN $2 = 'ended' THEN NOW() + (wind_down_minutes || ' minutes')::interval ELSE active_until END,
          ended_at = CASE WHEN $2 = 'ended' THEN NOW() ELSE ended_at END
      WHERE id = $1
    `, [sessionId, state]);
}
async function canJoinSession(sessionId, userId, role) {
    const session = await getSession(sessionId);
    if (!session)
        return false;
    if (role === "teacher") {
        return hasCourseAccess(session.course_id, userId, role);
    }
    return hasCourseAccess(session.course_id, userId, role);
}
async function insertChatMessage(input) {
    const result = await (0, postgres_1.getPostgresPool)().query(`
      INSERT INTO live_session_messages (
        id, session_id, course_id, sender_id, sender_name, sender_role, body, created_at, retained_until
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW() + INTERVAL '2 years')
      RETURNING *
    `, [(0, crypto_1.randomUUID)(), input.sessionId, input.courseId, input.senderId, input.senderName, input.senderRole, input.body]);
    return result.rows[0];
}
async function listSessionMessages(sessionId) {
    const result = await (0, postgres_1.getPostgresPool)().query(`
      SELECT *
      FROM live_session_messages
      WHERE session_id = $1
      ORDER BY created_at ASC
    `, [sessionId]);
    return result.rows;
}
async function pinSessionMessage(sessionId, messageId) {
    var _a;
    const result = await (0, postgres_1.getPostgresPool)().query(`
      UPDATE live_session_messages
      SET pinned_at = NOW()
      WHERE session_id = $1 AND id = $2
    `, [sessionId, messageId]);
    return ((_a = result.rowCount) !== null && _a !== void 0 ? _a : 0) > 0;
}
async function removeSessionMessage(sessionId, messageId) {
    var _a;
    const result = await (0, postgres_1.getPostgresPool)().query(`
      UPDATE live_session_messages
      SET deleted_at = COALESCE(deleted_at, NOW()), body = '[Removed]'
      WHERE session_id = $1 AND id = $2
    `, [sessionId, messageId]);
    return ((_a = result.rowCount) !== null && _a !== void 0 ? _a : 0) > 0;
}
async function muteSessionStudent(sessionId, studentId) {
    await (0, postgres_1.getPostgresPool)().query(`
      INSERT INTO live_session_mutes (session_id, student_id, created_at)
      VALUES ($1,$2,NOW())
      ON CONFLICT (session_id, student_id) DO NOTHING
    `, [sessionId, studentId]);
}
async function isStudentMuted(sessionId, studentId) {
    var _a, _b;
    const result = await (0, postgres_1.getPostgresPool)().query(`SELECT COUNT(*)::text AS count FROM live_session_mutes WHERE session_id = $1 AND student_id = $2`, [sessionId, studentId]);
    return Number((_b = (_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0) > 0;
}
async function setSlowMode(sessionId, enabled, intervalSeconds) {
    const redis = await (0, redis_1.getRedisPublisher)();
    if (!redis)
        return 0;
    const key = `slow:${sessionId}`;
    const seconds = enabled ? Math.min(30, Math.max(1, intervalSeconds || 30)) : 0;
    if (seconds > 0) {
        await redis.set(key, String(seconds), { EX: seconds });
    }
    else {
        await redis.del(key);
    }
    return seconds;
}
async function getSlowModeSeconds(sessionId) {
    const redis = await (0, redis_1.getRedisPublisher)();
    if (!redis)
        return 0;
    const key = `slow:${sessionId}`;
    const value = await redis.get(key);
    return value ? Number(value) || 0 : 0;
}
async function getSessionCourseId(sessionId) {
    var _a;
    const session = await getSession(sessionId);
    return (_a = session === null || session === void 0 ? void 0 : session.course_id) !== null && _a !== void 0 ? _a : null;
}
async function getLatestSessionForCourse(courseId) {
    var _a;
    const result = await (0, postgres_1.getPostgresPool)().query(`
      SELECT *
      FROM live_sessions
      WHERE course_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [courseId]);
    return (_a = result.rows[0]) !== null && _a !== void 0 ? _a : null;
}
async function saveDm(input) {
    var _a, _b;
    await (0, postgres_1.getPostgresPool)().query(`
      INSERT INTO live_session_dms (
        id, course_id, student_id, sender_id, sender_role, message_type, body, file_key, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
    `, [
        (0, crypto_1.randomUUID)(),
        input.courseId,
        input.studentId,
        input.senderId,
        input.senderRole,
        input.messageType,
        (_a = input.body) !== null && _a !== void 0 ? _a : null,
        (_b = input.fileKey) !== null && _b !== void 0 ? _b : null,
    ]);
}
async function listDmThread(input) {
    const result = await (0, postgres_1.getPostgresPool)().query(`
      SELECT id, sender_id, sender_role, message_type, body, file_key, created_at
      FROM live_session_dms
      WHERE course_id = $1 AND student_id = $2
      ORDER BY created_at ASC
    `, [input.courseId, input.studentId]);
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
