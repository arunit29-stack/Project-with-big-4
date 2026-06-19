import { getQuizState, setQuizState, clearLobbyStudents, QuizState } from "./redis-state";
import { getQuizQuestions, finishQuizScoring } from "./service";
import { publishQuizEvent } from "./ws";

const timers = new Map<string, NodeJS.Timeout>();

export async function launchQuizLobby(quizId: string): Promise<string> {
  const lobbyEndsAt = new Date(Date.now() + 60 * 1000).toISOString();
  const state: QuizState = {
    status: "lobby",
    currentQuestionIndex: -1,
    lobbyEndsAt,
    extensionsCount: 0,
  };
  await setQuizState(quizId, state);
  await clearLobbyStudents(quizId);

  // Set timeout to automatically start the quiz after 60s
  scheduleNextTransition(quizId, 60 * 1000, -1);

  return lobbyEndsAt;
}

export async function extendQuizLobby(quizId: string): Promise<string | null> {
  const state = await getQuizState(quizId);
  if (!state || state.status !== "lobby" || !state.lobbyEndsAt) {
    return null;
  }
  if (state.extensionsCount >= 5) {
    return state.lobbyEndsAt;
  }

  const currentEnds = new Date(state.lobbyEndsAt).getTime();
  const newEnds = new Date(currentEnds + 30 * 1000).toISOString();
  
  state.lobbyEndsAt = newEnds;
  state.extensionsCount += 1;
  await setQuizState(quizId, state);

  // Clear existing lobby transition and reschedule
  clearQuizTimer(quizId);
  const remainingTime = new Date(newEnds).getTime() - Date.now();
  scheduleNextTransition(quizId, Math.max(0, remainingTime), -1);

  // Broadcast lobby update
  await publishQuizEvent(quizId, {
    type: "lobby_update",
    payload: { lobbyEndsAt: newEnds },
  });

  return newEnds;
}

export async function startQuiz(quizId: string): Promise<void> {
  clearQuizTimer(quizId);
  await transitionToQuestion(quizId, 0);
}

export async function transitionToQuestion(quizId: string, questionIndex: number): Promise<void> {
  const questions = await getQuizQuestions(quizId);
  if (questionIndex >= questions.length) {
    // End Quiz
    await endQuiz(quizId);
    return;
  }

  const question = questions[questionIndex];
  const startsAt = new Date().toISOString();
  const durationMs = question.time_limit_seconds * 1000;
  const endsAt = new Date(Date.now() + durationMs).toISOString();

  const state: QuizState = {
    status: "active",
    currentQuestionIndex: questionIndex,
    currentQuestionStartsAt: startsAt,
    currentQuestionEndsAt: endsAt,
    extensionsCount: 0,
  };
  await setQuizState(quizId, state);

  // Broadcast question to all students
  const questionPayload = {
    id: question.id,
    type: question.type,
    text: question.text,
    options: question.options,
    timeLimitSeconds: question.time_limit_seconds,
    pointValue: question.point_value,
  };

  await publishQuizEvent(quizId, {
    type: "question",
    payload: {
      questionIndex,
      question: questionPayload,
      startsAt,
    },
  });

  // Schedule transition to the next question (timeLimitSeconds + 500ms buffer)
  scheduleNextTransition(quizId, durationMs + 500, questionIndex);
}

export async function endQuiz(quizId: string): Promise<void> {
  clearQuizTimer(quizId);
  const state: QuizState = {
    status: "ended",
    currentQuestionIndex: -1,
    extensionsCount: 0,
  };
  await setQuizState(quizId, state);

  // Run final scoring and XP updates
  await finishQuizScoring(quizId);

  // Broadcast quiz ended
  await publishQuizEvent(quizId, {
    type: "quiz_ended",
    payload: {},
  });
}

function scheduleNextTransition(quizId: string, delayMs: number, fromQuestionIndex: number) {
  clearQuizTimer(quizId);
  const timer = setTimeout(async () => {
    try {
      const state = await getQuizState(quizId);
      if (!state) return;

      if (fromQuestionIndex === -1 && state.status === "lobby") {
        // Lobby countdown expired -> start quiz
        await startQuiz(quizId);
      } else if (state.status === "active" && state.currentQuestionIndex === fromQuestionIndex) {
        // Question timer expired -> transition to next question
        await transitionToQuestion(quizId, fromQuestionIndex + 1);
      }
    } catch (err) {
      console.error(`Error in quiz transition timer for quiz ${quizId}`, err);
    }
  }, delayMs);

  timers.set(quizId, timer);
}

export function clearQuizTimer(quizId: string) {
  const existing = timers.get(quizId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(quizId);
  }
}
