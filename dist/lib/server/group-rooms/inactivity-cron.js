"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectInactiveStudents = detectInactiveStudents;
exports.startInactivityDetectionCron = startInactivityDetectionCron;
exports.stopInactivityDetectionCron = stopInactivityDetectionCron;
/**
 * Inactivity Detection Cron Job
 * Runs every hour to detect students inactive for 48+ hours on tasks
 */
const postgres_1 = require("../db/postgres");
const contribution_1 = require("./contribution");
/**
 * Check for inactive students on 48+ hour old tasks
 * Runs every hour via cron job
 */
async function detectInactiveStudents() {
    const pool = (0, postgres_1.getPostgresPool)();
    try {
        // Find all in_progress tasks that haven't been updated for 48+ hours
        const tasksRes = await pool.query(`SELECT t.id as task_id, t.room_id, t.assigned_to, t.title, r.name as room_name
       FROM group_room_tasks t
       JOIN group_rooms r ON t.room_id = r.id
       WHERE t.status = 'in_progress'
         AND t.assigned_to IS NOT NULL
         AND t.updated_at < NOW() - INTERVAL '48 hours'
       ORDER BY t.room_id, t.assigned_to`);
        const inactiveTasks = tasksRes.rows.map((row) => ({
            taskId: row.task_id,
            roomId: row.room_id,
            assignedTo: row.assigned_to,
            taskTitle: row.title,
            roomName: row.room_name,
            updatedAt: row.updated_at || '',
        }));
        // For each task, check if student has any activity in last 48 hours
        for (const task of inactiveTasks) {
            const hasActivity = await (0, contribution_1.hasRecentActivity)(task.roomId, task.assignedTo, 48);
            if (!hasActivity) {
                // Student has been inactive on this task for 48+ hours
                // Fire notification to teacher
                console.log(`Inactivity detected: Student ${task.assignedTo} inactive on task "${task.taskTitle}" in room "${task.roomName}"`);
                // TODO: Call notification service
                // notifyUser(teacher_id, 'group_inactivity_48h', {
                //   studentName: task.assigned_to,
                //   roomName: task.room_name,
                //   taskTitle: task.title,
                // });
            }
        }
    }
    catch (err) {
        console.error("Error in inactivity detection:", err);
    }
}
/**
 * Initialize cron job (runs every hour)
 * Call this from app startup
 */
function startInactivityDetectionCron() {
    // Run immediately on startup
    detectInactiveStudents().catch(console.error);
    // Then run every hour
    return setInterval(() => {
        detectInactiveStudents().catch(console.error);
    }, 60 * 60 * 1000); // 1 hour
}
/**
 * Stop cron job (for graceful shutdown)
 */
function stopInactivityDetectionCron(intervalId) {
    clearInterval(intervalId);
}
