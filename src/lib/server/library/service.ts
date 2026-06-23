import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { getRedisClient } from "../auth/redis";
import { archiveRagFile, queueRagIngestion } from "../ai/service";
import { getR2Bucket, getR2Client } from "./r2";
import {
  confirmPdfFile,
  createPdfDraft,
  createTusSession,
  listLibraryFiles,
  markLibraryFileFailed,
  softDeleteLibraryFile,
  updateVideoStatus,
  verifyStudentEnrollment,
} from "./store";
import type { Role } from "../auth/types";

const PDF_MAX_SIZE = 50 * 1024 * 1024;

function sanitizeTopic(topic: string): string {
  return topic.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
}

export async function presignPdfUpload(input: {
  courseId: string;
  week: number;
  topic: string;
  fileName: string;
  size: number;
  mimeType: string;
}): Promise<{ uploadUrl: string; fileKey: string; fileId: string }> {
  if (input.mimeType !== "application/pdf") {
    throw new Error("invalid_type");
  }
  if (input.size > PDF_MAX_SIZE) {
    throw new Error("file_too_large");
  }

  const fileId = randomUUID();
  const fileKey = `courses/${input.courseId}/week-${input.week}/${sanitizeTopic(
    input.topic,
  )}/${fileId}-${input.fileName}`;

  await createPdfDraft({
    courseId: input.courseId,
    week: input.week,
    topic: input.topic,
    fileName: input.fileName,
    fileKey,
    size: input.size,
    mimeType: input.mimeType,
  });

  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: fileKey,
      ContentType: input.mimeType,
    }),
    { expiresIn: 15 * 60 },
  );

  return { uploadUrl, fileKey, fileId };
}

export async function confirmPdfUpload(input: {
  courseId: string;
  fileId: string;
  week: number;
  topic: string;
  fileName: string;
}): Promise<boolean> {
  const confirmed = await confirmPdfFile(input);
  if (!confirmed) {
    return false;
  }
  try {
    await queueRagIngestion({
      courseId: input.courseId,
      fileId: input.fileId,
    });
  } catch (error) {
    await markLibraryFileFailed({
      courseId: input.courseId,
      fileId: input.fileId,
      error: error instanceof Error ? error.message : "rag_ingestion_queue_failed",
    });
    throw error;
  }
  return true;
}

export async function buildLibraryTree(courseId: string, role: Role, userId: string) {
  if (role === "student" && !(await verifyStudentEnrollment(userId, courseId))) {
    throw new Error("forbidden");
  }

  const rows = await listLibraryFiles(courseId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weeks = new Map<number, Map<string, any[]>>();
  for (const row of rows) {
    if (role === "student" && row.status !== "ready") continue;
    if (!weeks.has(row.week_number)) weeks.set(row.week_number, new Map());
    const topics = weeks.get(row.week_number)!;
    if (!topics.has(row.topic_name)) topics.set(row.topic_name, []);
    const files = topics.get(row.topic_name)!;
    const presignedGetUrl =
      row.status === "ready" ? await presignLibraryGetUrl(row.file_key) : null;
    files.push({
      id: row.id,
      name: row.file_name,
      title: row.file_name,
      type: row.type,
      uploadDate: row.upload_date,
      size: row.size,
      presignedGetUrl,
      pdfUrl: row.type === "pdf" ? presignedGetUrl : undefined,
      downloadUrl: row.type === "pdf" ? presignedGetUrl : undefined,
      hlsUrl: row.type === "video" ? presignedGetUrl : undefined,
      chapters: [],
      transcript: [],
      uploadProgress: row.status === "uploading" ? 0 : undefined,
      status: row.status,
    });
  }

  return [...weeks.entries()].map(([weekNumber, topics]) => {
    const topicEntries = [...topics.entries()].map(([name, files], index) => ({
      id: `week-${weekNumber}-topic-${index + 1}`,
      name,
      title: name,
      files,
      items: files,
    }));

    return {
      id: `week-${weekNumber}`,
      title: `Week ${weekNumber}`,
      weekNumber,
      topics: topicEntries,
    };
  });
}

export async function deleteLibraryFile(courseId: string, fileId: string) {
  const deleted = await softDeleteLibraryFile(courseId, fileId);
  if (deleted) {
    await archiveRagFile({ courseId, fileId });
  }
  return deleted;
}

export async function createVideoTusSession(input: {
  courseId: string;
  fileHash: string;
  fileName: string;
  size: number;
}) {
  const session = await createTusSession(input);
  const redis = await getRedisClient();
  if (redis) {
    await redis.set(`cbb:tus:${input.fileHash}`, JSON.stringify(session), {
      EX: 60 * 60,
    });
  }
  return session;
}

export async function setVideoStatus(input: {
  courseId: string;
  videoId: string;
  status: "uploading" | "processing" | "ready" | "failed";
}) {
  return updateVideoStatus(input);
}

export async function presignLibraryGetUrl(fileKey: string) {
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: fileKey,
    }),
    { expiresIn: 15 * 60 },
  );
}
