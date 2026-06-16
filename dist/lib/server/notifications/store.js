"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertNotification = insertNotification;
exports.getNotificationsPage = getNotificationsPage;
exports.markAllNotificationsRead = markAllNotificationsRead;
exports.softDeleteNotification = softDeleteNotification;
exports.countUnreadNotifications = countUnreadNotifications;
const postgres_1 = require("../db/postgres");
function toDto(row) {
    return {
        id: row.id,
        type: row.type,
        courseId: row.course_id,
        courseName: row.course_name,
        message: row.message,
        navigateTo: row.navigate_to,
        createdAt: row.created_at,
    };
}
async function insertNotification(input) {
    var _a, _b, _c, _d;
    const pool = (0, postgres_1.getPostgresPool)();
    const result = await pool.query(`
      INSERT INTO notifications (
        user_id, type, course_id, course_name, message, navigate_to, payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        user_id,
        type,
        course_id,
        course_name,
        message,
        navigate_to,
        payload,
        created_at,
        read_at,
        deleted_at
    `, [
        input.userId,
        input.type,
        (_a = input.courseId) !== null && _a !== void 0 ? _a : null,
        (_b = input.courseName) !== null && _b !== void 0 ? _b : null,
        input.message,
        (_c = input.navigateTo) !== null && _c !== void 0 ? _c : null,
        JSON.stringify((_d = input.payload) !== null && _d !== void 0 ? _d : {}),
    ]);
    return toDto(result.rows[0]);
}
async function getNotificationsPage(input) {
    var _a, _b;
    const pool = (0, postgres_1.getPostgresPool)();
    const offset = (input.page - 1) * input.limit;
    const [rowsResult, countResult] = await Promise.all([
        pool.query(`
        SELECT
          id,
          user_id,
          type,
          course_id,
          course_name,
          message,
          navigate_to,
          payload,
          created_at,
          read_at,
          deleted_at
        FROM notifications
        WHERE user_id = $1
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [input.userId, input.limit, offset]),
        pool.query(`
        SELECT COUNT(*)::text AS count
        FROM notifications
        WHERE user_id = $1
          AND deleted_at IS NULL
      `, [input.userId]),
    ]);
    return {
        items: rowsResult.rows.map(toDto),
        total: Number((_b = (_a = countResult.rows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0),
    };
}
async function markAllNotificationsRead(userId) {
    await (0, postgres_1.getPostgresPool)().query(`
      UPDATE notifications
      SET read_at = COALESCE(read_at, NOW())
      WHERE user_id = $1
        AND deleted_at IS NULL
        AND read_at IS NULL
    `, [userId]);
}
async function softDeleteNotification(userId, notificationId) {
    var _a;
    const result = await (0, postgres_1.getPostgresPool)().query(`
      UPDATE notifications
      SET deleted_at = COALESCE(deleted_at, NOW())
      WHERE user_id = $1
        AND id = $2
        AND deleted_at IS NULL
      RETURNING id
    `, [userId, notificationId]);
    return ((_a = result.rowCount) !== null && _a !== void 0 ? _a : 0) > 0;
}
async function countUnreadNotifications(userId) {
    var _a, _b;
    const result = await (0, postgres_1.getPostgresPool)().query(`
      SELECT COUNT(*)::text AS count
      FROM notifications
      WHERE user_id = $1
        AND deleted_at IS NULL
        AND read_at IS NULL
    `, [userId]);
    return Number((_b = (_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0);
}
