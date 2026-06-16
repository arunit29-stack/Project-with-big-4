"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNotificationCronJobs = startNotificationCronJobs;
const node_cron_1 = __importDefault(require("node-cron"));
const service_1 = require("./service");
const postgres_1 = require("../db/postgres");
let started = false;
async function fireUnassessedSubmissionNotifications() {
    var _a;
    const pool = (0, postgres_1.getPostgresPool)();
    const result = await pool.query(`
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
    `);
    for (const row of result.rows) {
        await (0, service_1.notifyUser)(row.teacher_id, "unassessed_submission_48h", {
            courseId: row.course_id,
            courseName: row.course_name,
            message: `Submission awaiting review in ${(_a = row.course_name) !== null && _a !== void 0 ? _a : "a course"}.`,
            navigateTo: row.course_id ? `/dashboard/${row.course_id}` : "/dashboard",
            submissionId: row.submission_id,
            studentName: row.student_name,
        });
    }
}
async function fireGroupInactivityNotifications() {
    var _a;
    const pool = (0, postgres_1.getPostgresPool)();
    const result = await pool.query(`
      SELECT
        t.teacher_id,
        t.course_id,
        c.name AS course_name,
        t.id AS task_id
      FROM task_board_tasks t
      JOIN courses c ON c.id = t.course_id
      WHERE t.status = 'in_progress'
        AND t.last_activity < NOW() - INTERVAL '48 hours'
    `);
    for (const row of result.rows) {
        await (0, service_1.notifyUser)(row.teacher_id, "group_inactivity_48h", {
            courseId: row.course_id,
            courseName: row.course_name,
            message: `A task has been inactive in ${(_a = row.course_name) !== null && _a !== void 0 ? _a : "your course"}.`,
            navigateTo: row.course_id ? `/dashboard/${row.course_id}` : "/dashboard",
            taskId: row.task_id,
        });
    }
}
function startNotificationCronJobs() {
    if (started)
        return;
    started = true;
    node_cron_1.default.schedule("0 * * * *", async () => {
        await fireUnassessedSubmissionNotifications().catch((error) => {
            console.error("[cron] unassessed submission notifications failed", error);
        });
        await fireGroupInactivityNotifications().catch((error) => {
            console.error("[cron] group inactivity notifications failed", error);
        });
    });
}
