"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementMessagesSent = incrementMessagesSent;
exports.incrementDocumentEdits = incrementDocumentEdits;
exports.getRoomContributionMetrics = getRoomContributionMetrics;
exports.getStudentMetrics = getStudentMetrics;
exports.hasRecentActivity = hasRecentActivity;
/**
 * Contribution Tracking Service
 * Tracks messages_sent, task_completions, document_edit_events per student per day
 */
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
/**
 * Increment message count for student in room today
 */
async function incrementMessagesSent(roomId, studentId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    await pool.query(`INSERT INTO contribution_metrics (id, room_id, student_id, metric_date, messages_sent)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (room_id, student_id, metric_date)
     DO UPDATE SET messages_sent = messages_sent + 1`, [(0, crypto_1.randomUUID)(), roomId, studentId, today]);
}
/**
 * Increment document edit events for student in room today
 */
async function incrementDocumentEdits(roomId, studentId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    await pool.query(`INSERT INTO contribution_metrics (id, room_id, student_id, metric_date, document_edit_events)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (room_id, student_id, metric_date)
     DO UPDATE SET document_edit_events = document_edit_events + 1`, [(0, crypto_1.randomUUID)(), roomId, studentId, today]);
}
/**
 * Get contribution metrics for a room
 * Returns per-student breakdown with daily chart data
 */
async function getRoomContributionMetrics(roomId) {
    const pool = (0, postgres_1.getPostgresPool)();
    // Get all students in room
    const membersRes = await pool.query(`SELECT student_id FROM group_room_members WHERE room_id = $1`, [roomId]);
    const memberIds = membersRes.rows.map((row) => row.student_id);
    // Get metrics for each student
    const metricsRes = await pool.query(`SELECT student_id, metric_date, messages_sent, task_completions, document_edit_events
     FROM contribution_metrics
     WHERE room_id = $1
     ORDER BY student_id ASC, metric_date DESC`, [roomId]);
    // Group by student
    const metricsByStudent = {};
    for (const metric of metricsRes.rows) {
        const studentId = metric.student_id;
        if (!metricsByStudent[studentId]) {
            metricsByStudent[studentId] = {
                daily: [],
                totalMessages: 0,
                totalCompletions: 0,
                totalEdits: 0,
                lastActivityAt: metric.metric_date,
            };
        }
        metricsByStudent[studentId].daily.push({
            date: metric.metric_date,
            messagesSent: metric.messages_sent || 0,
            taskCompletions: metric.task_completions || 0,
            documentEditEvents: metric.document_edit_events || 0,
        });
        metricsByStudent[studentId].totalMessages += metric.messages_sent || 0;
        metricsByStudent[studentId].totalCompletions +=
            metric.task_completions || 0;
        metricsByStudent[studentId].totalEdits += metric.document_edit_events || 0;
        // Update lastActivityAt if this is more recent
        if (metric.metric_date > metricsByStudent[studentId].lastActivityAt) {
            metricsByStudent[studentId].lastActivityAt = metric.metric_date;
        }
    }
    // Build response for all room members
    const studentBreakdowns = memberIds.map((studentId) => {
        const metrics = metricsByStudent[studentId] || {
            daily: [],
            totalMessages: 0,
            totalCompletions: 0,
            totalEdits: 0,
            lastActivityAt: new Date().toISOString(),
        };
        return {
            studentId,
            studentName: studentId, // TODO: fetch from student table if available
            totalMessages: metrics.totalMessages,
            totalTaskCompletions: metrics.totalCompletions,
            totalDocumentEdits: metrics.totalEdits,
            dailyBreakdown: metrics.daily,
            lastActivityAt: metrics.lastActivityAt,
        };
    });
    return {
        roomId,
        studentBreakdowns,
    };
}
/**
 * Get raw metrics for a student in a room for date range
 */
async function getStudentMetrics(roomId, studentId, sinceDate // YYYY-MM-DD
) {
    const pool = (0, postgres_1.getPostgresPool)();
    const res = await pool.query(`SELECT id, room_id, student_id, metric_date, messages_sent, task_completions, document_edit_events, created_at, updated_at
     FROM contribution_metrics
     WHERE room_id = $1 AND student_id = $2 AND metric_date >= $3
     ORDER BY metric_date DESC`, [roomId, studentId, sinceDate]);
    return res.rows.map((row) => ({
        id: row.id,
        roomId: row.room_id,
        studentId: row.student_id,
        metricDate: row.metric_date,
        messagesSent: row.messages_sent || 0,
        taskCompletions: row.task_completions || 0,
        documentEditEvents: row.document_edit_events || 0,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    }));
}
/**
 * Check if student has any activity in last N hours
 */
async function hasRecentActivity(roomId, studentId, hoursAgo) {
    const pool = (0, postgres_1.getPostgresPool)();
    const sinceDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
    const res = await pool.query(`SELECT COUNT(*) as count
     FROM contribution_metrics
     WHERE room_id = $1 AND student_id = $2 AND metric_date >= $3
       AND (messages_sent > 0 OR task_completions > 0 OR document_edit_events > 0)`, [roomId, studentId, sinceDate]);
    return parseInt(res.rows[0].count, 10) > 0;
}
