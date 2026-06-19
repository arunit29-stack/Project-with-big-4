"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.launchQuizLobby = launchQuizLobby;
exports.extendQuizLobby = extendQuizLobby;
exports.startQuiz = startQuiz;
exports.transitionToQuestion = transitionToQuestion;
exports.endQuiz = endQuiz;
exports.clearQuizTimer = clearQuizTimer;
const redis_state_1 = require("./redis-state");
const service_1 = require("./service");
const ws_1 = require("./ws");
const timers = new Map();
async function launchQuizLobby(quizId) {
    const lobbyEndsAt = new Date(Date.now() + 60 * 1000).toISOString();
    const state = {
        status: "lobby",
        currentQuestionIndex: -1,
        lobbyEndsAt,
        extensionsCount: 0,
    };
    await (0, redis_state_1.setQuizState)(quizId, state);
    await (0, redis_state_1.clearLobbyStudents)(quizId);
    // Set timeout to automatically start the quiz after 60s
    scheduleNextTransition(quizId, 60 * 1000, -1);
    return lobbyEndsAt;
}
async function extendQuizLobby(quizId) {
    const state = await (0, redis_state_1.getQuizState)(quizId);
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
    await (0, redis_state_1.setQuizState)(quizId, state);
    // Clear existing lobby transition and reschedule
    clearQuizTimer(quizId);
    const remainingTime = new Date(newEnds).getTime() - Date.now();
    scheduleNextTransition(quizId, Math.max(0, remainingTime), -1);
    // Broadcast lobby update
    await (0, ws_1.publishQuizEvent)(quizId, {
        type: "lobby_update",
        payload: { lobbyEndsAt: newEnds },
    });
    return newEnds;
}
async function startQuiz(quizId) {
    clearQuizTimer(quizId);
    await transitionToQuestion(quizId, 0);
}
async function transitionToQuestion(quizId, questionIndex) {
    const questions = await (0, service_1.getQuizQuestions)(quizId);
    if (questionIndex >= questions.length) {
        // End Quiz
        await endQuiz(quizId);
        return;
    }
    const question = questions[questionIndex];
    const startsAt = new Date().toISOString();
    const durationMs = question.time_limit_seconds * 1000;
    const endsAt = new Date(Date.now() + durationMs).toISOString();
    const state = {
        status: "active",
        currentQuestionIndex: questionIndex,
        currentQuestionStartsAt: startsAt,
        currentQuestionEndsAt: endsAt,
        extensionsCount: 0,
    };
    await (0, redis_state_1.setQuizState)(quizId, state);
    // Broadcast question to all students
    const questionPayload = {
        id: question.id,
        type: question.type,
        text: question.text,
        options: question.options,
        timeLimitSeconds: question.time_limit_seconds,
        pointValue: question.point_value,
    };
    await (0, ws_1.publishQuizEvent)(quizId, {
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
async function endQuiz(quizId) {
    clearQuizTimer(quizId);
    const state = {
        status: "ended",
        currentQuestionIndex: -1,
        extensionsCount: 0,
    };
    await (0, redis_state_1.setQuizState)(quizId, state);
    // Run final scoring and XP updates
    await (0, service_1.finishQuizScoring)(quizId);
    // Broadcast quiz ended
    await (0, ws_1.publishQuizEvent)(quizId, {
        type: "quiz_ended",
        payload: {},
    });
}
function scheduleNextTransition(quizId, delayMs, fromQuestionIndex) {
    clearQuizTimer(quizId);
    const timer = setTimeout(async () => {
        try {
            const state = await (0, redis_state_1.getQuizState)(quizId);
            if (!state)
                return;
            if (fromQuestionIndex === -1 && state.status === "lobby") {
                // Lobby countdown expired -> start quiz
                await startQuiz(quizId);
            }
            else if (state.status === "active" && state.currentQuestionIndex === fromQuestionIndex) {
                // Question timer expired -> transition to next question
                await transitionToQuestion(quizId, fromQuestionIndex + 1);
            }
        }
        catch (err) {
            console.error(`Error in quiz transition timer for quiz ${quizId}`, err);
        }
    }, delayMs);
    timers.set(quizId, timer);
}
function clearQuizTimer(quizId) {
    const existing = timers.get(quizId);
    if (existing) {
        clearTimeout(existing);
        timers.delete(quizId);
    }
}
