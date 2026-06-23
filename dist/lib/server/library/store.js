"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyStudentEnrollment = verifyStudentEnrollment;
exports.createPdfDraft = createPdfDraft;
exports.confirmPdfFile = confirmPdfFile;
exports.markLibraryFileFailed = markLibraryFileFailed;
exports.softDeleteLibraryFile = softDeleteLibraryFile;
exports.listLibraryFiles = listLibraryFiles;
exports.createTusSession = createTusSession;
exports.updateVideoStatus = updateVideoStatus;
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
async function verifyStudentEnrollment(userId, courseId) {
    var _a, _b;
    const result = await (0, postgres_1.getPostgresPool)().query(`SELECT COUNT(*)::text AS count FROM course_enrollments WHERE user_id = $1 AND course_id = $2`, [userId, courseId]);
    return Number((_b = (_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0) > 0;
}
async function createPdfDraft(input) {
    const fileId = (0, crypto_1.randomUUID)();
    await (0, postgres_1.getPostgresPool)().query(`
      INSERT INTO course_library_files (
        id, course_id, week_number, topic_name, file_name, file_key,
        type, mime_type, size, status, deleted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'pdf',$7,$8,'uploading',NULL)
    `, [
        fileId,
        input.courseId,
        input.week,
        input.topic,
        input.fileName,
        input.fileKey,
        input.mimeType,
        input.size,
    ]);
    return { fileId };
}
async function confirmPdfFile(input) {
    var _a;
    const result = await (0, postgres_1.getPostgresPool)().query(`
      UPDATE course_library_files
      SET status = 'processing',
          file_name = $4,
          week_number = $3,
          topic_name = $5,
          updated_at = NOW()
      WHERE id = $1
        AND course_id = $2
        AND deleted_at IS NULL
        AND type = 'pdf'
    `, [input.fileId, input.courseId, input.week, input.fileName, input.topic]);
    return ((_a = result.rowCount) !== null && _a !== void 0 ? _a : 0) > 0;
}
async function markLibraryFileFailed(input) {
    await (0, postgres_1.getPostgresPool)().query(`
      UPDATE course_library_files
      SET status = 'failed',
          ingestion_error = $3,
          updated_at = NOW()
      WHERE id = $1 AND course_id = $2
    `, [input.fileId, input.courseId, input.error.slice(0, 4000)]);
}
async function softDeleteLibraryFile(courseId, fileId) {
    var _a;
    const result = await (0, postgres_1.getPostgresPool)().query(`
      UPDATE course_library_files
      SET deleted_at = COALESCE(deleted_at, NOW())
      WHERE id = $1 AND course_id = $2 AND deleted_at IS NULL
    `, [fileId, courseId]);
    return ((_a = result.rowCount) !== null && _a !== void 0 ? _a : 0) > 0;
}
async function listLibraryFiles(courseId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const result = await pool.query(`
      SELECT
        course_id,
        week_number,
        topic_name,
        id,
        file_name,
        type,
        created_at AS upload_date,
        size,
        status,
        file_key
      FROM course_library_files
      WHERE course_id = $1
        AND deleted_at IS NULL
      ORDER BY week_number ASC, topic_name ASC, created_at DESC
    `, [courseId]);
    return result.rows;
}
async function createTusSession(input) {
    const uploadId = (0, crypto_1.randomUUID)();
    await (0, postgres_1.getPostgresPool)().query(`
      INSERT INTO course_library_video_uploads (
        id, course_id, file_hash, file_name, size, status
      ) VALUES ($1,$2,$3,$4,$5,'uploading')
    `, [uploadId, input.courseId, input.fileHash, input.fileName, input.size]);
    return { uploadId };
}
async function updateVideoStatus(input) {
    var _a;
    const result = await (0, postgres_1.getPostgresPool)().query(`
      UPDATE course_library_videos
      SET status = $3, updated_at = NOW()
      WHERE id = $1 AND course_id = $2
    `, [input.videoId, input.courseId, input.status]);
    return ((_a = result.rowCount) !== null && _a !== void 0 ? _a : 0) > 0;
}
