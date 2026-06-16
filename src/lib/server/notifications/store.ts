import { getPostgresPool } from "../db/postgres";
import type { NotificationDTO, NotificationRow, NotificationType } from "./types";

export type NotificationInsertInput = {
  userId: string;
  type: NotificationType;
  courseId?: string | null;
  courseName?: string | null;
  message: string;
  navigateTo?: string | null;
  payload?: Record<string, unknown>;
};

function toDto(row: NotificationRow): NotificationDTO {
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

export async function insertNotification(
  input: NotificationInsertInput,
): Promise<NotificationDTO> {
  const pool = getPostgresPool();
  const result = await pool.query<NotificationRow>(
    `
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
    `,
    [
      input.userId,
      input.type,
      input.courseId ?? null,
      input.courseName ?? null,
      input.message,
      input.navigateTo ?? null,
      JSON.stringify(input.payload ?? {}),
    ],
  );

  return toDto(result.rows[0]);
}

export async function getNotificationsPage(input: {
  userId: string;
  page: number;
  limit: number;
}): Promise<{ items: NotificationDTO[]; total: number }> {
  const pool = getPostgresPool();
  const offset = (input.page - 1) * input.limit;

  const [rowsResult, countResult] = await Promise.all([
    pool.query<NotificationRow>(
      `
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
      `,
      [input.userId, input.limit, offset],
    ),
    pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM notifications
        WHERE user_id = $1
          AND deleted_at IS NULL
      `,
      [input.userId],
    ),
  ]);

  return {
    items: rowsResult.rows.map(toDto),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await getPostgresPool().query(
    `
      UPDATE notifications
      SET read_at = COALESCE(read_at, NOW())
      WHERE user_id = $1
        AND deleted_at IS NULL
        AND read_at IS NULL
    `,
    [userId],
  );
}

export async function softDeleteNotification(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const result = await getPostgresPool().query(
    `
      UPDATE notifications
      SET deleted_at = COALESCE(deleted_at, NOW())
      WHERE user_id = $1
        AND id = $2
        AND deleted_at IS NULL
      RETURNING id
    `,
    [userId, notificationId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const result = await getPostgresPool().query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM notifications
      WHERE user_id = $1
        AND deleted_at IS NULL
        AND read_at IS NULL
    `,
    [userId],
  );

  return Number(result.rows[0]?.count ?? 0);
}
