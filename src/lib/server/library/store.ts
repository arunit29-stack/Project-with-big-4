import { randomUUID } from "crypto";
import { getPostgresPool } from "../db/postgres";
import type { Role } from "../auth/types";

export type LibraryFileType = "pdf" | "video";
export type LibraryFileStatus = "uploading" | "processing" | "ready" | "failed";

export interface LibraryPdfRecord {
  id: string;
  course_id: string;
  file_key: string;
}

export interface LibraryFileRow {
  id: string;
  type: LibraryFileType;
  course_id: string;
  week_number: number;
  topic_name: string;
  file_name: string;
  file_key: string;
  upload_date: string;
  size: number;
  status: LibraryFileStatus;
}

export interface LibraryTreeTopic {
  name: string;
  files: Array<{
    id: string;
    name: string;
    type: LibraryFileType;
    uploadDate: string;
    size: number;
    presignedGetUrl: string | null;
    status: LibraryFileStatus;
  }>;
}

export interface LibraryTreeWeek {
  weekNumber: number;
  topics: LibraryTreeTopic[];
}

export async function verifyStudentEnrollment(
  userId: string,
  courseId: string,
): Promise<boolean> {
  const result = await getPostgresPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM course_enrollments WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId],
  );
  return Number(result.rows[0]?.count ?? 0) > 0;
}

export async function createPdfDraft(input: {
  courseId: string;
  week: number;
  topic: string;
  fileName: string;
  fileKey: string;
  size: number;
  mimeType: string;
}): Promise<{ fileId: string }> {
  const fileId = randomUUID();
  await getPostgresPool().query(
    `
      INSERT INTO course_library_files (
        id, course_id, week_number, topic_name, file_name, file_key,
        type, mime_type, size, status, deleted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'pdf',$7,$8,'uploading',NULL)
    `,
    [
      fileId,
      input.courseId,
      input.week,
      input.topic,
      input.fileName,
      input.fileKey,
      input.mimeType,
      input.size,
    ],
  );
  return { fileId };
}

export async function confirmPdfFile(input: {
  courseId: string;
  fileId: string;
  week: number;
  topic: string;
  fileName: string;
}): Promise<boolean> {
  const result = await getPostgresPool().query(
    `
      UPDATE course_library_files
      SET status = 'ready',
          file_name = $4,
          week_number = $3,
          topic_name = $5,
          updated_at = NOW()
      WHERE id = $1
        AND course_id = $2
        AND deleted_at IS NULL
        AND type = 'pdf'
    `,
    [input.fileId, input.courseId, input.week, input.fileName, input.topic],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function softDeleteLibraryFile(
  courseId: string,
  fileId: string,
): Promise<boolean> {
  const result = await getPostgresPool().query(
    `
      UPDATE course_library_files
      SET deleted_at = COALESCE(deleted_at, NOW())
      WHERE id = $1 AND course_id = $2 AND deleted_at IS NULL
    `,
    [fileId, courseId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listLibraryFiles(courseId: string): Promise<LibraryFileRow[]> {
  const pool = getPostgresPool();
  const result = await pool.query<LibraryFileRow>(
    `
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
    `,
    [courseId],
  );
  return result.rows;
}

export async function createTusSession(input: {
  courseId: string;
  fileHash: string;
  fileName: string;
  size: number;
}): Promise<{ uploadId: string }> {
  const uploadId = randomUUID();
  await getPostgresPool().query(
    `
      INSERT INTO course_library_video_uploads (
        id, course_id, file_hash, file_name, size, status
      ) VALUES ($1,$2,$3,$4,$5,'uploading')
    `,
    [uploadId, input.courseId, input.fileHash, input.fileName, input.size],
  );
  return { uploadId };
}

export async function updateVideoStatus(input: {
  courseId: string;
  videoId: string;
  status: LibraryFileStatus;
}): Promise<boolean> {
  const result = await getPostgresPool().query(
    `
      UPDATE course_library_videos
      SET status = $3, updated_at = NOW()
      WHERE id = $1 AND course_id = $2
    `,
    [input.videoId, input.courseId, input.status],
  );
  return (result.rowCount ?? 0) > 0;
}
