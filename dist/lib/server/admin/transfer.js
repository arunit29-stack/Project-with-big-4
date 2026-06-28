"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferCourse = transferCourse;
/**
 * Course Transfer Service
 * Transfer all course assets from one teacher to another (atomic transaction)
 */
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
/**
 * Transfer entire course to new teacher
 * CRITICAL: Atomic transaction - all or nothing
 */
async function transferCourse(courseId, newTeacherId, adminId, institutionId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Get course and old teacher
        const courseRes = await client.query(`SELECT created_by FROM courses WHERE id = $1`, [courseId]);
        if (courseRes.rows.length === 0) {
            throw new Error("course_not_found");
        }
        const oldTeacherId = courseRes.rows[0].created_by;
        // Verify new teacher exists
        const newTeacherRes = await client.query(`SELECT id FROM users WHERE id = $1 AND role = 'teacher'`, [newTeacherId]);
        if (newTeacherRes.rows.length === 0) {
            throw new Error("teacher_not_found");
        }
        // Transfer course ownership
        await client.query(`UPDATE courses SET created_by = $1, updated_at = NOW() WHERE id = $2`, [newTeacherId, courseId]);
        // Transfer assignments and their submissions
        const assignmentsRes = await client.query(`UPDATE assignments SET created_by = $1 WHERE course_id = $2
       RETURNING id`, [newTeacherId, courseId]);
        const assignmentCount = assignmentsRes.rowCount || 0;
        // Transfer quizzes
        const quizzesRes = await client.query(`UPDATE quizzes SET created_by = $1 WHERE course_id = $2
       RETURNING id`, [newTeacherId, courseId]);
        const quizCount = quizzesRes.rowCount || 0;
        // Transfer group rooms
        const groupRoomsRes = await client.query(`UPDATE group_rooms SET created_by = $1 WHERE course_id = $2
       RETURNING id`, [newTeacherId, courseId]);
        const groupRoomCount = groupRoomsRes.rowCount || 0;
        // Transfer video library items (if applicable)
        const videoRes = await client.query(`UPDATE video_library SET created_by = $1 WHERE course_id = $2
       RETURNING id`, [newTeacherId, courseId]);
        const videoCount = videoRes.rowCount || 0;
        // Transfer DM threads (creator)
        const dmRes = await client.query(`UPDATE direct_messages SET created_by = $1 WHERE course_id = $2
       RETURNING id`, [newTeacherId, courseId]);
        const dmCount = dmRes.rowCount || 0;
        // Create audit log
        await client.query(`INSERT INTO course_transfer_audit (
        id, course_id, old_teacher_id, new_teacher_id, transferred_by, 
        institution_id, assets_transferred
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            (0, crypto_1.randomUUID)(),
            courseId,
            oldTeacherId,
            newTeacherId,
            adminId,
            institutionId,
            JSON.stringify({
                assignments: assignmentCount,
                quizzes: quizCount,
                groupRooms: groupRoomCount,
                videoLibraryItems: videoCount,
                dmThreads: dmCount,
            }),
        ]);
        await client.query("COMMIT");
        // TODO: Send notifications to old and new teacher
        return {
            courseId,
            oldTeacherId,
            newTeacherId,
            assetsTransferred: {
                assignments: assignmentCount,
                quizzes: quizCount,
                groupRooms: groupRoomCount,
                videoLibraryItems: videoCount,
                dmThreads: dmCount,
            },
        };
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
