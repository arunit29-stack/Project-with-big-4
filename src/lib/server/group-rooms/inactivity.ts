/**
 * Inactivity Report Service
 */
import { randomUUID } from "crypto";
import { getPostgresPool } from "../db/postgres";
import type { InactivityReport } from "../../../types/group-rooms";

/**
 * Create an inactivity report
 */
export async function createInactivityReport(
  roomId: string,
  reporterId: string,
  reportedStudentId: string,
  reason: string
): Promise<string> {
  const pool = getPostgresPool();
  const reportId = randomUUID();

  await pool.query(
    `INSERT INTO inactivity_reports (id, room_id, reporter_id, reported_student_id, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [reportId, roomId, reporterId, reportedStudentId, reason]
  );

  return reportId;
}

/**
 * Get inactivity reports for a room
 */
export async function getRoomInactivityReports(
  roomId: string
): Promise<InactivityReport[]> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT id, room_id, reporter_id, reported_student_id, reason, created_at
     FROM inactivity_reports
     WHERE room_id = $1
     ORDER BY created_at DESC`,
    [roomId]
  );

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
export async function getStudentInactivityReports(
  roomId: string,
  studentId: string,
  sinceHours: number = 72 // Last 3 days
): Promise<InactivityReport[]> {
  const pool = getPostgresPool();
  const sinceTime = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const res = await pool.query(
    `SELECT id, room_id, reporter_id, reported_student_id, reason, created_at
     FROM inactivity_reports
     WHERE room_id = $1 AND reported_student_id = $2 AND created_at >= $3
     ORDER BY created_at DESC`,
    [roomId, studentId, sinceTime]
  );

  return res.rows.map((row) => ({
    id: row.id,
    roomId: row.room_id,
    reporterId: row.reporter_id,
    reportedStudentId: row.reported_student_id,
    reason: row.reason,
    createdAt: row.created_at.toISOString(),
  }));
}
