"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureStudentEnrollment = ensureStudentEnrollment;
exports.ensureTeacherOwnsCourse = ensureTeacherOwnsCourse;
exports.askCourseAi = askCourseAi;
exports.queueRagIngestion = queueRagIngestion;
exports.archiveRagFile = archiveRagFile;
exports.listCourseAiQueryLogs = listCourseAiQueryLogs;
const postgres_1 = require("../db/postgres");
function getAiServiceBaseUrl() {
    var _a, _b;
    return ((_b = (_a = process.env.AI_SERVICE_INTERNAL_URL) !== null && _a !== void 0 ? _a : process.env.NEXT_PUBLIC_AI_URL) !== null && _b !== void 0 ? _b : "http://ai-service:8000").replace(/\/$/, "");
}
function getInternalApiKey() {
    const key = process.env.INTERNAL_SERVICE_API_KEY;
    if (!key) {
        throw new Error("INTERNAL_SERVICE_API_KEY is required");
    }
    return key;
}
async function aiServiceFetch(path, init) {
    var _a;
    return fetch(`${getAiServiceBaseUrl()}${path}`, Object.assign(Object.assign({}, init), { headers: Object.assign({ "content-type": "application/json", "x-internal-api-key": getInternalApiKey() }, ((_a = init.headers) !== null && _a !== void 0 ? _a : {})) }));
}
async function ensureStudentEnrollment(userId, courseId) {
    var _a, _b;
    const result = await (0, postgres_1.getPostgresPool)().query(`SELECT COUNT(*)::text AS count FROM course_enrollments WHERE user_id = $1 AND course_id = $2`, [userId, courseId]);
    return Number((_b = (_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0) > 0;
}
async function ensureTeacherOwnsCourse(userId, courseId) {
    var _a, _b;
    const result = await (0, postgres_1.getPostgresPool)().query(`SELECT COUNT(*)::text AS count FROM teacher_courses WHERE teacher_id = $1 AND course_id = $2`, [userId, courseId]);
    return Number((_b = (_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0) > 0;
}
async function askCourseAi(input) {
    const response = await aiServiceFetch(`/internal/courses/${input.courseId}/ai/chat`, {
        method: "POST",
        body: JSON.stringify(input),
    });
    if (!response.ok) {
        throw new Error(`ai_chat_failed:${response.status}`);
    }
    return (await response.json());
}
async function queueRagIngestion(input) {
    const response = await aiServiceFetch("/pipeline/ingest", {
        method: "POST",
        body: JSON.stringify(input),
    });
    if (!response.ok) {
        throw new Error(`rag_ingestion_queue_failed:${response.status}`);
    }
    return (await response.json());
}
async function archiveRagFile(input) {
    const response = await aiServiceFetch(`/pipeline/archive/${input.fileId}`, {
        method: "POST",
        body: JSON.stringify({ courseId: input.courseId }),
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`rag_archive_failed:${response.status}`);
    }
}
async function listCourseAiQueryLogs(input) {
    const params = new URLSearchParams();
    if (input.studentId)
        params.set("studentId", input.studentId);
    if (input.startDate)
        params.set("startDate", input.startDate);
    if (input.endDate)
        params.set("endDate", input.endDate);
    params.set("page", String(input.page));
    params.set("limit", String(input.limit));
    const response = await aiServiceFetch(`/internal/courses/${input.courseId}/ai/query-logs?${params.toString()}`, { method: "GET" });
    if (!response.ok) {
        throw new Error(`ai_query_logs_failed:${response.status}`);
    }
    return (await response.json());
}
