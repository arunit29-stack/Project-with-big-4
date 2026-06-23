import { getPostgresPool } from "../db/postgres";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  response: string;
  sources: Array<{
    fileName: string;
    uploadDate: string;
    pageNumber: number | null;
  }>;
  lockModeActive: boolean;
};

export type QueryLogsPage = {
  items: Array<{
    id: string;
    studentId: string;
    courseId: string;
    queryText: string;
    aiResponse: string;
    sourceChunkIds: string[];
    lockModeActive: boolean;
    createdAt: string;
  }>;
  total: number;
  page: number;
  limit: number;
};

function getAiServiceBaseUrl(): string {
  return (
    process.env.AI_SERVICE_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_AI_URL ??
    "http://ai-service:8000"
  ).replace(/\/$/, "");
}

function getInternalApiKey(): string {
  const key = process.env.INTERNAL_SERVICE_API_KEY;
  if (!key) {
    throw new Error("INTERNAL_SERVICE_API_KEY is required");
  }
  return key;
}

async function aiServiceFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${getAiServiceBaseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-internal-api-key": getInternalApiKey(),
      ...(init.headers ?? {}),
    },
  });
}

export async function ensureStudentEnrollment(
  userId: string,
  courseId: string,
): Promise<boolean> {
  const result = await getPostgresPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM course_enrollments WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId],
  );
  return Number(result.rows[0]?.count ?? 0) > 0;
}

export async function ensureTeacherOwnsCourse(
  userId: string,
  courseId: string,
): Promise<boolean> {
  const result = await getPostgresPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM teacher_courses WHERE teacher_id = $1 AND course_id = $2`,
    [userId, courseId],
  );
  return Number(result.rows[0]?.count ?? 0) > 0;
}

export async function askCourseAi(input: {
  studentId: string;
  courseId: string;
  message: string;
  conversationHistory: ChatMessage[];
}): Promise<ChatResponse> {
  const response = await aiServiceFetch(`/internal/courses/${input.courseId}/ai/chat`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`ai_chat_failed:${response.status}`);
  }
  return (await response.json()) as ChatResponse;
}

export async function queueRagIngestion(input: {
  courseId: string;
  fileId: string;
}): Promise<{ ok: boolean; taskId: string; status: string }> {
  const response = await aiServiceFetch("/pipeline/ingest", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`rag_ingestion_queue_failed:${response.status}`);
  }
  return (await response.json()) as { ok: boolean; taskId: string; status: string };
}

export async function archiveRagFile(input: {
  courseId: string;
  fileId: string;
}): Promise<void> {
  const response = await aiServiceFetch(`/pipeline/archive/${input.fileId}`, {
    method: "POST",
    body: JSON.stringify({ courseId: input.courseId }),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`rag_archive_failed:${response.status}`);
  }
}

export async function listCourseAiQueryLogs(input: {
  courseId: string;
  studentId?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
}): Promise<QueryLogsPage> {
  const params = new URLSearchParams();
  if (input.studentId) params.set("studentId", input.studentId);
  if (input.startDate) params.set("startDate", input.startDate);
  if (input.endDate) params.set("endDate", input.endDate);
  params.set("page", String(input.page));
  params.set("limit", String(input.limit));

  const response = await aiServiceFetch(
    `/internal/courses/${input.courseId}/ai/query-logs?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    throw new Error(`ai_query_logs_failed:${response.status}`);
  }
  return (await response.json()) as QueryLogsPage;
}
