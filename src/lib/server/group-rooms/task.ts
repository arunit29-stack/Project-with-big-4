/**
 * Group Rooms Task & Kanban Service
 */
import { randomUUID } from "crypto";
import { getPostgresPool } from "../db/postgres";
import type {
  GroupRoomTask,
  CreateTaskRequest,
  UpdateTaskRequest,
  KanbanBoard,
  TaskStatus,
  TaskAuditLog,
} from "../../../types/group-rooms";

/**
 * Create a task in a room
 */
export async function createTask(
  roomId: string,
  createdBy: string,
  request: CreateTaskRequest
): Promise<string> {
  const pool = getPostgresPool();
  const taskId = randomUUID();
  const status = request.status || "todo";

  await pool.query(
    `INSERT INTO group_room_tasks (
      id, room_id, title, description, assigned_to, created_by, status, due_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      taskId,
      roomId,
      request.title,
      request.description || null,
      request.assignedToStudentId || null,
      createdBy,
      status,
      request.dueDate || null,
    ]
  );

  return taskId;
}

/**
 * Get single task
 */
export async function getTask(taskId: string): Promise<GroupRoomTask | null> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT id, room_id, title, description, assigned_to, created_by, status, due_date, created_at, updated_at
     FROM group_room_tasks WHERE id = $1`,
    [taskId]
  );

  if (res.rowCount === 0) {
    return null;
  }

  const row = res.rows[0];
  return {
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    description: row.description,
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    status: row.status,
    dueDate: row.due_date ? row.due_date.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Update a task (status change, reassignment, etc.)
 * Logs status changes to task_audit_log
 */
export async function updateTask(
  taskId: string,
  changedBy: string,
  request: UpdateTaskRequest
): Promise<void> {
  const pool = getPostgresPool();

  // Get current task to compare status
  const currentTaskRes = await pool.query(
    `SELECT room_id, status FROM group_room_tasks WHERE id = $1`,
    [taskId]
  );

  if (currentTaskRes.rowCount === 0) {
    throw new Error("task_not_found");
  }

  const currentTask = currentTaskRes.rows[0];
  const oldStatus = currentTask.status;
  const newStatus = request.status || oldStatus;
  const roomId = currentTask.room_id;

  await pool.query("BEGIN");
  try {
    // Build update query
    const updates: string[] = [];
    const values: (string | null | number)[] = [];
    let paramCount = 1;

    if (request.title !== undefined) {
      updates.push(`title = $${paramCount}`);
      values.push(request.title);
      paramCount++;
    }

    if (request.description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(request.description || null);
      paramCount++;
    }

    if (request.assignedToStudentId !== undefined) {
      updates.push(`assigned_to = $${paramCount}`);
      values.push(request.assignedToStudentId || null);
      paramCount++;
    }

    if (request.dueDate !== undefined) {
      updates.push(`due_date = $${paramCount}`);
      values.push(request.dueDate || null);
      paramCount++;
    }

    if (request.status !== undefined) {
      updates.push(`status = $${paramCount}`);
      values.push(request.status);
      paramCount++;
    }

    // Always update updated_at
    updates.push(`updated_at = NOW()`);

    // Update task
    values.push(taskId);
    const sql = `UPDATE group_room_tasks SET ${updates.join(", ")} WHERE id = $${paramCount}`;
    await pool.query(sql, values);

    // Log status change if status changed
    if (newStatus !== oldStatus) {
      await pool.query(
        `INSERT INTO task_audit_log (id, task_id, room_id, changed_by, old_status, new_status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), taskId, roomId, changedBy, oldStatus, newStatus]
      );

      // If task moved to 'done', increment task_completions in contribution_metrics
      if (newStatus === "done") {
        const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
        const assignedTo = currentTask.assigned_to || changedBy;

        await pool.query(
          `INSERT INTO contribution_metrics (id, room_id, student_id, metric_date, task_completions)
           VALUES ($1, $2, $3, $4, 1)
           ON CONFLICT (room_id, student_id, metric_date)
           DO UPDATE SET task_completions = task_completions + 1`,
          [randomUUID(), roomId, assignedTo, today]
        );
      }
    }

    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}

/**
 * Get all tasks for a room, grouped by status (Kanban board)
 */
export async function getRoomKanban(roomId: string): Promise<KanbanBoard> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT id, room_id, title, description, assigned_to, created_by, status, due_date, created_at, updated_at
     FROM group_room_tasks WHERE room_id = $1
     ORDER BY status, created_at ASC`,
    [roomId]
  );

  const tasks: GroupRoomTask[] = res.rows.map((row) => ({
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    description: row.description,
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    status: row.status,
    dueDate: row.due_date ? row.due_date.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));

  return {
    todo: tasks.filter((t) => t.status === "todo"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    done: tasks.filter((t) => t.status === "done"),
  };
}

/**
 * Get task audit log for a task
 */
export async function getTaskAuditLog(taskId: string): Promise<TaskAuditLog[]> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT id, task_id, room_id, changed_by, old_status, new_status, changed_at
     FROM task_audit_log WHERE task_id = $1
     ORDER BY changed_at DESC`,
    [taskId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    roomId: row.room_id,
    changedBy: row.changed_by,
    oldStatus: row.old_status,
    newStatus: row.new_status,
    changedAt: row.changed_at.toISOString(),
  }));
}

/**
 * Get all tasks for a room (flat list)
 */
export async function getRoomTasks(roomId: string): Promise<GroupRoomTask[]> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT id, room_id, title, description, assigned_to, created_by, status, due_date, created_at, updated_at
     FROM group_room_tasks WHERE room_id = $1
     ORDER BY created_at ASC`,
    [roomId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    description: row.description,
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    status: row.status,
    dueDate: row.due_date ? row.due_date.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string): Promise<void> {
  const pool = getPostgresPool();
  // Cascading delete handled by foreign keys
  await pool.query(`DELETE FROM group_room_tasks WHERE id = $1`, [taskId]);
}
