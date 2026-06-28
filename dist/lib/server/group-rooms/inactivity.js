"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInactivityReport = createInactivityReport;
exports.getRoomInactivityReports = getRoomInactivityReports;
exports.getStudentInactivityReports = getStudentInactivityReports;
/**
 * Inactivity Report Service
 */
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
/**
 * Create an inactivity report
 */
async function createInactivityReport(roomId, reporterId, reportedStudentId, reason) {
    const pool = (0, postgres_1.getPostgresPool)();
    const reportId = (0, crypto_1.randomUUID)();
    await pool.query(`INSERT INTO inactivity_reports (id, room_id, reporter_id, reported_student_id, reason)
     VALUES ($1, $2, $3, $4, $5)`, [reportId, roomId, reporterId, reportedStudentId, reason]);
    return reportId;
}
/**
 * Get inactivity reports for a room
 */
async function getRoomInactivityReports(roomId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const res = await pool.query(`SELECT id, room_id, reporter_id, reported_student_id, reason, created_at
     FROM inactivity_reports
     WHERE room_id = $1
     ORDER BY created_at DESC`, [roomId]);
    return res.rows.map((row) => ({
        id: row.id,
        roomId: row.room_id,
        reporterId: row.reporter_id,
        reportedStudentId: row.reported_student_id,
        reason: row.reason,
        createdAt: row.created_at.toISOString(),
    }));
}
/**
 * Get recent inactivity reports for a student in a room
 */
async function getStudentInactivityReports(roomId, studentId, sinceHours = 72 // Last 3 days
) {
    const pool = (0, postgres_1.getPostgresPool)();
    const sinceTime = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    const res = await pool.query(`SELECT id, room_id, reporter_id, reported_student_id, reason, created_at
     FROM inactivity_reports
     WHERE room_id = $1 AND reported_student_id = $2 AND created_at >= $3
     ORDER BY created_at DESC`, [roomId, studentId, sinceTime]);
    return res.rows.map((row) => ({
        id: row.id,
        roomId: row.room_id,
        reporterId: row.reporter_id,
        reportedStudentId: row.reported_student_id,
        reason: row.reason,
        createdAt: row.created_at.toISOString(),
    }));
}
