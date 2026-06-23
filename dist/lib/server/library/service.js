"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.presignPdfUpload = presignPdfUpload;
exports.confirmPdfUpload = confirmPdfUpload;
exports.buildLibraryTree = buildLibraryTree;
exports.deleteLibraryFile = deleteLibraryFile;
exports.createVideoTusSession = createVideoTusSession;
exports.setVideoStatus = setVideoStatus;
exports.presignLibraryGetUrl = presignLibraryGetUrl;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const crypto_1 = require("crypto");
const redis_1 = require("../auth/redis");
const service_1 = require("../ai/service");
const r2_1 = require("./r2");
const store_1 = require("./store");
const PDF_MAX_SIZE = 50 * 1024 * 1024;
function sanitizeTopic(topic) {
    return topic.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
}
async function presignPdfUpload(input) {
    if (input.mimeType !== "application/pdf") {
        throw new Error("invalid_type");
    }
    if (input.size > PDF_MAX_SIZE) {
        throw new Error("file_too_large");
    }
    const fileId = (0, crypto_1.randomUUID)();
    const fileKey = `courses/${input.courseId}/week-${input.week}/${sanitizeTopic(input.topic)}/${fileId}-${input.fileName}`;
    await (0, store_1.createPdfDraft)({
        courseId: input.courseId,
        week: input.week,
        topic: input.topic,
        fileName: input.fileName,
        fileKey,
        size: input.size,
        mimeType: input.mimeType,
    });
    const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)((0, r2_1.getR2Client)(), new client_s3_1.PutObjectCommand({
        Bucket: (0, r2_1.getR2Bucket)(),
        Key: fileKey,
        ContentType: input.mimeType,
    }), { expiresIn: 15 * 60 });
    return { uploadUrl, fileKey, fileId };
}
async function confirmPdfUpload(input) {
    const confirmed = await (0, store_1.confirmPdfFile)(input);
    if (!confirmed) {
        return false;
    }
    try {
        await (0, service_1.queueRagIngestion)({
            courseId: input.courseId,
            fileId: input.fileId,
        });
    }
    catch (error) {
        await (0, store_1.markLibraryFileFailed)({
            courseId: input.courseId,
            fileId: input.fileId,
            error: error instanceof Error ? error.message : "rag_ingestion_queue_failed",
        });
        throw error;
    }
    return true;
}
async function buildLibraryTree(courseId, role, userId) {
    if (role === "student" && !(await (0, store_1.verifyStudentEnrollment)(userId, courseId))) {
        throw new Error("forbidden");
    }
    const rows = await (0, store_1.listLibraryFiles)(courseId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weeks = new Map();
    for (const row of rows) {
        if (role === "student" && row.status !== "ready")
            continue;
        if (!weeks.has(row.week_number))
            weeks.set(row.week_number, new Map());
        const topics = weeks.get(row.week_number);
        if (!topics.has(row.topic_name))
            topics.set(row.topic_name, []);
        const files = topics.get(row.topic_name);
        const presignedGetUrl = row.status === "ready" ? await presignLibraryGetUrl(row.file_key) : null;
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
async function deleteLibraryFile(courseId, fileId) {
    const deleted = await (0, store_1.softDeleteLibraryFile)(courseId, fileId);
    if (deleted) {
        await (0, service_1.archiveRagFile)({ courseId, fileId });
    }
    return deleted;
}
async function createVideoTusSession(input) {
    const session = await (0, store_1.createTusSession)(input);
    const redis = await (0, redis_1.getRedisClient)();
    if (redis) {
        await redis.set(`cbb:tus:${input.fileHash}`, JSON.stringify(session), {
            EX: 60 * 60,
        });
    }
    return session;
}
async function setVideoStatus(input) {
    return (0, store_1.updateVideoStatus)(input);
}
async function presignLibraryGetUrl(fileKey) {
    return (0, s3_request_presigner_1.getSignedUrl)((0, r2_1.getR2Client)(), new client_s3_1.GetObjectCommand({
        Bucket: (0, r2_1.getR2Bucket)(),
        Key: fileKey,
    }), { expiresIn: 15 * 60 });
}
