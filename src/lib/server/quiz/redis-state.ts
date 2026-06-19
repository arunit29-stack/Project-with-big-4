import { getRedisPublisher } from "../notifications/redis";

export interface QuizState {
  status: "lobby" | "active" | "ended";
  currentQuestionIndex: number;
  lobbyEndsAt?: string;
  extensionsCount: number;
  currentQuestionStartsAt?: string;
  currentQuestionEndsAt?: string;
}

export interface StudentInfo {
  userId: string;
  email: string;
}

function getQuizStateKey(quizId: string): string {
  return `quiz:${quizId}:state`;
}

function getActiveSessionKey(quizId: string, userId: string): string {
  return `quiz:${quizId}:active_session:${userId}`;
}

function getLobbyStudentsKey(quizId: string): string {
  return `quiz:${quizId}:lobby_students`;
}

export async function getQuizState(quizId: string): Promise<QuizState | null> {
  const redis = await getRedisPublisher();
  if (!redis) return null;
  const val = await redis.get(getQuizStateKey(quizId));
  if (!val) return null;
  try {
    return JSON.parse(val) as QuizState;
  } catch {
    return null;
  }
}

export async function setQuizState(quizId: string, state: QuizState): Promise<void> {
  const redis = await getRedisPublisher();
  if (!redis) return;
  await redis.set(getQuizStateKey(quizId), JSON.stringify(state));
}

export async function getActiveSession(quizId: string, userId: string): Promise<string | null> {
  const redis = await getRedisPublisher();
  if (!redis) return null;
  return await redis.get(getActiveSessionKey(quizId, userId));
}

export async function setActiveSession(quizId: string, userId: string, attemptId: string): Promise<void> {
  const redis = await getRedisPublisher();
  if (!redis) return;
  await redis.set(getActiveSessionKey(quizId, userId), attemptId);
}

export async function addLobbyStudent(quizId: string, userId: string, email: string): Promise<void> {
  const redis = await getRedisPublisher();
  if (!redis) return;
  const student: StudentInfo = { userId, email };
  await redis.hSet(getLobbyStudentsKey(quizId), userId, JSON.stringify(student));
}

export async function getLobbyStudents(quizId: string): Promise<StudentInfo[]> {
  const redis = await getRedisPublisher();
  if (!redis) return [];
  const fields = await redis.hGetAll(getLobbyStudentsKey(quizId));
  const students: StudentInfo[] = [];
  for (const k of Object.keys(fields)) {
    try {
      students.push(JSON.parse(fields[k]) as StudentInfo);
    } catch {}
  }
  return students;
}

export async function clearLobbyStudents(quizId: string): Promise<void> {
  const redis = await getRedisPublisher();
  if (!redis) return;
  await redis.del(getLobbyStudentsKey(quizId));
}
