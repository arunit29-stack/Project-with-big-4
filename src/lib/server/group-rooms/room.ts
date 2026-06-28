/**
 * Group Rooms Service - CRUD operations for rooms and members
 */
import { randomUUID } from "crypto";
import { getPostgresPool } from "../db/postgres";
import type {
  GroupRoom,
  GroupRoomWithSummary,
  CreateGroupRoomRequest,
  UpdateMembersRequest,
} from "../../../types/group-rooms";

/**
 * Create a new group room
 */
export async function createGroupRoom(
  courseId: string,
  createdBy: string,
  request: CreateGroupRoomRequest
): Promise<string> {
  const pool = getPostgresPool();
  const roomId = randomUUID();

  await pool.query("BEGIN");
  try {
    // Create room
    await pool.query(
      `INSERT INTO group_rooms (id, course_id, name, created_by)
       VALUES ($1, $2, $3, $4)`,
      [roomId, courseId, request.name, createdBy]
    );

    // Add members
    for (const studentId of request.memberStudentIds) {
      await pool.query(
        `INSERT INTO group_room_members (id, room_id, student_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (room_id, student_id) DO NOTHING`,
        [randomUUID(), roomId, studentId]
      );
    }

    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }

  return roomId;
}

/**
 * Get all rooms for a course (with different views for teacher vs student)
 */
export async function getCourseRooms(
  courseId: string,
  userId: string,
  isTeacher: boolean
): Promise<GroupRoomWithSummary[]> {
  const pool = getPostgresPool();

  let query = `
    SELECT
      r.id,
      r.course_id,
      r.name,
      r.created_by,
      r.created_at,
      r.updated_at,
      COUNT(DISTINCT m.student_id) as member_count,
      COUNT(DISTINCT t.id) as task_count,
      SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END) as todo_count,
      SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_count
    FROM group_rooms r
    LEFT JOIN group_room_members m ON r.id = m.room_id
    LEFT JOIN group_room_tasks t ON r.id = t.room_id
    WHERE r.course_id = $1
  `;

  const params: (string)[] = [courseId];

  // If student, only show rooms they're in
  if (!isTeacher) {
    query += ` AND EXISTS (
      SELECT 1 FROM group_room_members
      WHERE room_id = r.id AND student_id = $2
    )`;
    params.push(userId);
  }

  query += ` GROUP BY r.id, r.course_id, r.name, r.created_by, r.created_at, r.updated_at
    ORDER BY r.created_at DESC`;

  const res = await pool.query(query, params);

  return res.rows.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    teacherCanView: true,
    memberCount: parseInt(row.member_count, 10) || 0,
    taskCount: parseInt(row.task_count, 10) || 0,
    tasksByStatus: {
      todo: parseInt(row.todo_count, 10) || 0,
      inProgress: parseInt(row.in_progress_count, 10) || 0,
      done: parseInt(row.done_count, 10) || 0,
    },
  }));
}

/**
 * Get single room details
 */
export async function getGroupRoom(roomId: string): Promise<GroupRoom | null> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT id, course_id, name, created_by, created_at, updated_at
     FROM group_rooms WHERE id = $1`,
    [roomId]
  );

  if (res.rowCount === 0) {
    return null;
  }

  const row = res.rows[0];
  return {
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    teacherCanView: true,
  };
}

/**
 * Get room members
 */
export async function getRoomMembers(roomId: string): Promise<string[]> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT student_id FROM group_room_members WHERE room_id = $1`,
    [roomId]
  );

  return res.rows.map((row) => row.student_id);
}

/**
 * Check if student is a member of room
 */
export async function isRoomMember(
  roomId: string,
  studentId: string
): Promise<boolean> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT 1 FROM group_room_members
     WHERE room_id = $1 AND student_id = $2
     LIMIT 1`,
    [roomId, studentId]
  );

  return (res.rowCount ?? 0) > 0;
}

/**
 * Add or remove room members
 */
export async function updateRoomMembers(
  roomId: string,
  request: UpdateMembersRequest
): Promise<void> {
  const pool = getPostgresPool();

  if (request.action === "add") {
    for (const studentId of request.studentIds) {
      await pool.query(
        `INSERT INTO group_room_members (id, room_id, student_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (room_id, student_id) DO NOTHING`,
        [randomUUID(), roomId, studentId]
      );
    }
  } else if (request.action === "remove") {
    for (const studentId of request.studentIds) {
      await pool.query(
        `DELETE FROM group_room_members
         WHERE room_id = $1 AND student_id = $2`,
        [roomId, studentId]
      );
    }
  }
}

/**
 * Delete a room and all related data
 */
export async function deleteGroupRoom(roomId: string): Promise<void> {
  const pool = getPostgresPool();
  // Cascading delete handled by foreign keys
  await pool.query(`DELETE FROM group_rooms WHERE id = $1`, [roomId]);
}
