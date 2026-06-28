"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportGradesAsCSV = exportGradesAsCSV;
exports.getExportSummary = getExportSummary;
/**
 * Data Export Service
 * CSV export of grades across all students and courses
 */
const postgres_1 = require("../db/postgres");
/**
 * Export grades for institution as CSV
 */
async function exportGradesAsCSV(institutionId) {
    const pool = (0, postgres_1.getPostgresPool)();
    // Query all grades across institution
    const gradesRes = await pool.query(`SELECT 
      u.email as student_email,
      u.name as student_name,
      c.code as course_code,
      c.title as course_name,
      a.title as assignment_title,
      COALESCE(ar.final_grade, 0) as assignment_grade,
      COALESCE(SUM(xp.xp_amount), 0) as quiz_xp
     FROM users u
     JOIN course_enrollments ce ON u.id = ce.user_id
     JOIN courses c ON ce.course_id = c.id
     LEFT JOIN assignments a ON c.id = a.course_id
     LEFT JOIN assignment_results ar ON a.id = ar.assignment_id AND u.id = ar.submitter_id
     LEFT JOIN student_xp_ledger xp ON u.id = xp.user_id AND c.id = xp.course_id
     WHERE c.institution_id = $1 AND u.deleted_at IS NULL
     GROUP BY u.id, u.email, u.name, c.id, c.code, c.title, a.id, a.title, ar.final_grade
     ORDER BY u.email, c.code, a.title`, [institutionId]);
    // Generate CSV
    let csv = "Student Email,Student Name,Course Code,Course Name,Assignment Title,Assignment Grade,Quiz XP\n";
    for (const row of gradesRes.rows) {
        const email = escapeCSVField(row.student_email);
        const name = escapeCSVField(row.student_name || "");
        const courseCode = escapeCSVField(row.course_code);
        const courseName = escapeCSVField(row.course_name);
        const assignmentTitle = escapeCSVField(row.assignment_title || "");
        const grade = row.assignment_grade || 0;
        const xp = row.quiz_xp || 0;
        csv += `${email},${name},${courseCode},${courseName},${assignmentTitle},${grade},${xp}\n`;
    }
    return csv;
}
/**
 * Escape CSV field (handle commas and quotes)
 */
function escapeCSVField(field) {
    if (!field)
        return '""';
    if (field.includes(",") || field.includes('"') || field.includes("\n")) {
        return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
}
/**
 * Get summary statistics
 */
async function getExportSummary(institutionId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const studentsRes = await pool.query(`SELECT COUNT(DISTINCT u.id) as count
     FROM users u
     JOIN course_enrollments ce ON u.id = ce.user_id
     JOIN courses c ON ce.course_id = c.id
     WHERE c.institution_id = $1 AND u.role = 'student' AND u.deleted_at IS NULL`, [institutionId]);
    const coursesRes = await pool.query(`SELECT COUNT(*) as count FROM courses WHERE institution_id = $1`, [institutionId]);
    const assignmentsRes = await pool.query(`SELECT COUNT(*) as count 
     FROM assignments a
     JOIN courses c ON a.course_id = c.id
     WHERE c.institution_id = $1`, [institutionId]);
    const recordsRes = await pool.query(`SELECT COUNT(*) as count
     FROM assignment_results ar
     JOIN assignments a ON ar.assignment_id = a.id
     JOIN courses c ON a.course_id = c.id
     WHERE c.institution_id = $1`, [institutionId]);
    return {
        totalStudents: parseInt(studentsRes.rows[0].count, 10),
        totalCourses: parseInt(coursesRes.rows[0].count, 10),
        totalAssignments: parseInt(assignmentsRes.rows[0].count, 10),
        totalRecords: parseInt(recordsRes.rows[0].count, 10),
    };
}
