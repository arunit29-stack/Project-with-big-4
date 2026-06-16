import cron from "node-cron";
import { notifyUser } from "./service";
import { getPostgresPool } from "../db/postgres";

let started = false;

async function fireUnassessedSubmissionNotifications() {
  const pool = getPostgresPool();
  const result = await pool.query<{
    teacher_id: string;
    course_id: string | null;
    course_name: string | null;
    submission_id: string;
    student_name: string | null;
  }>(
    `
      SELECT
        s.teacher_id,
        s.course_id,
        c.name AS course_name,
        s.id AS submission_id,
        u.name AS student_name
      FROM assignment_submissions s
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN users u ON u.id = s.student_id
      WHERE s.assessed_at IS NULL
        AND s.submission_time < NOW() - INTERVAL '48 hours'
    `,
  );

  for (const row of result.rows) {
    await notifyUser(row.teacher_id, "unassessed_submission_48h", {
      courseId: row.course_id,
      courseName: row.course_name,
      message: `Submission awaiting review in ${row.course_name ?? "a course"}.`,
      navigateTo: row.course_id ? `/dashboard/${row.course_id}` : "/dashboard",
      submissionId: row.submission_id,
      studentName: row.student_name,
    });
  }
}

async function fireGroupInactivityNotifications() {
  const pool = getPostgresPool();
  const result = await pool.query<{
    teacher_id: string;
    course_id: string | null;
    course_name: string | null;
    task_id: string;
  }>(
    `
      SELECT
        t.teacher_id,
        t.course_id,
        c.name AS course_name,
        t.id AS task_id
      FROM task_board_tasks t
      JOIN courses c ON c.id = t.course_id
      WHERE t.status = 'in_progress'
        AND t.last_activity < NOW() - INTERVAL '48 hours'
    `,
  );

  for (const row of result.rows) {
    await notifyUser(row.teacher_id, "group_inactivity_48h", {
      courseId: row.course_id,
      courseName: row.course_name,
      message: `A task has been inactive in ${row.course_name ?? "your course"}.`,
      navigateTo: row.course_id ? `/dashboard/${row.course_id}` : "/dashboard",
      taskId: row.task_id,
    });
  }
}

export function startNotificationCronJobs(): void {
  if (started) return;
  started = true;

  cron.schedule("0 * * * *", async () => {
    await fireUnassessedSubmissionNotifications().catch((error) => {
      console.error("[cron] unassessed submission notifications failed", error);
    });
    await fireGroupInactivityNotifications().catch((error) => {
      console.error("[cron] group inactivity notifications failed", error);
    });
  });
}
