/**
 * Quiz Types - TypeScript interfaces for quiz generation, editing, and publishing
 */

/**
 * AI-Generated Question (from Claude)
 */
export interface AiGeneratedQuestion {
  questionText: string;
  options: [string, string, string, string]; // Exactly 4 options
  correctOptionIndex: 0 | 1 | 2 | 3;
  difficultyRating: "easy" | "medium" | "hard";
  explanation: string;
  pointValue: 10; // Fixed at 10
  timeLimitSeconds: 30; // Fixed at 30
}

/**
 * Request to generate AI quiz questions
 */
export interface AiQuizGenerationRequest {
  topic: string;
  questionCount?: number; // Default 10, max 30
}

/**
 * Response from AI quiz generation
 */
export interface AiQuizGenerationResponse {
  quizId: string;
  questions: QuizQuestion[];
}

/**
 * Question Status
 */
export type QuestionStatus = "draft" | "published" | "voided";

/**
 * Quiz Question Database Record
 */
export interface QuizQuestion {
  id: string;
  quizId: string;
  type: "mcq" | "true_false" | "short_answer";
  text: string;
  options: string[] | null;
  correctOptionIndex: number | null;
  explanation: string | null;
  pointValue: number;
  timeLimitSeconds: number;
  questionIndex: number;
  voided: boolean;
  status: QuestionStatus;
  generatedByAi: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request to edit a draft question
 */
export interface EditQuestionRequest {
  text?: string;
  options?: [string, string, string, string];
  correctOptionIndex?: 0 | 1 | 2 | 3;
  explanation?: string;
  difficultyRating?: "easy" | "medium" | "hard"; // metadata for teacher
  pointValue?: number;
  timeLimitSeconds?: number;
}

/**
 * Request to add a manual question to a draft quiz
 */
export interface AddQuestionRequest {
  type: "mcq" | "true_false" | "short_answer";
  text: string;
  options?: [string, string, string, string];
  correctOptionIndex?: 0 | 1 | 2 | 3;
  explanation?: string;
  pointValue?: number; // Default 10, range 1-100
  timeLimitSeconds?: number; // Default 30, range 10-120
}

/**
 * Request to publish a drafted quiz
 */
export interface PublishQuizRequest {
  // No body needed - just marks all draft questions as published
}

/**
 * Response from publishing a quiz
 */
export interface PublishQuizResponse {
  quizId: string;
  status: "published";
  questionCount: number;
  publishedAt: string;
}

/**
 * Void Question Response - includes updated scores for all affected attempts
 */
export interface VoidQuestionResponse {
  ok: boolean;
  questionId: string;
  voided: boolean;
  affectedAttempts: Array<{
    attemptId: string;
    userId: string;
    oldScore: number;
    newScore: number;
    pointsRedistributed: number;
  }>;
}

/**
 * Quiz Database Record
 */
export interface Quiz {
  id: string;
  courseId: string;
  title: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
}

/**
 * Quiz Attempt Record
 */
export interface QuizAttempt {
  id: string;
  quizId: string;
  userId: string;
  status: "started" | "completed";
  score: number;
  startedAt: string;
  completedAt: string | null;
}

/**
 * Quiz Attempt Answer
 */
export interface QuizAttemptAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  selectedOption: string;
  submittedAt: string;
  timeRemainingSeconds: number;
  isCorrect: boolean;
  pointsAwarded: number;
}

/**
 * Student XP Ledger Entry
 */
export interface StudentXpLedgerEntry {
  id: string;
  userId: string;
  courseId: string;
  quizId: string;
  xpAmount: number;
  earnedAt: string;
}

/**
 * Quiz State (from Redis for active quiz)
 */
export interface QuizState {
  quizId: string;
  status: "lobby" | "active" | "completed";
  currentQuestionIndex: number;
  lobbyEndsAt?: string;
  currentQuestionEndsAt?: string;
}
