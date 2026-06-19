"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQuizState = getQuizState;
exports.setQuizState = setQuizState;
exports.getActiveSession = getActiveSession;
exports.setActiveSession = setActiveSession;
exports.addLobbyStudent = addLobbyStudent;
exports.getLobbyStudents = getLobbyStudents;
exports.clearLobbyStudents = clearLobbyStudents;
const redis_1 = require("../notifications/redis");
function getQuizStateKey(quizId) {
    return `quiz:${quizId}:state`;
}
function getActiveSessionKey(quizId, userId) {
    return `quiz:${quizId}:active_session:${userId}`;
}
function getLobbyStudentsKey(quizId) {
    return `quiz:${quizId}:lobby_students`;
}
async function getQuizState(quizId) {
    const redis = await (0, redis_1.getRedisPublisher)();
    if (!redis)
        return null;
    const val = await redis.get(getQuizStateKey(quizId));
    if (!val)
        return null;
    try {
        return JSON.parse(val);
    }
    catch (_a) {
        return null;
    }
}
async function setQuizState(quizId, state) {
    const redis = await (0, redis_1.getRedisPublisher)();
    if (!redis)
        return;
    await redis.set(getQuizStateKey(quizId), JSON.stringify(state));
}
async function getActiveSession(quizId, userId) {
    const redis = await (0, redis_1.getRedisPublisher)();
    if (!redis)
        return null;
    return await redis.get(getActiveSessionKey(quizId, userId));
}
async function setActiveSession(quizId, userId, attemptId) {
    const redis = await (0, redis_1.getRedisPublisher)();
    if (!redis)
        return;
    await redis.set(getActiveSessionKey(quizId, userId), attemptId);
}
async function addLobbyStudent(quizId, userId, email) {
    const redis = await (0, redis_1.getRedisPublisher)();
    if (!redis)
        return;
    const student = { userId, email };
    await redis.hSet(getLobbyStudentsKey(quizId), userId, JSON.stringify(student));
}
async function getLobbyStudents(quizId) {
    const redis = await (0, redis_1.getRedisPublisher)();
    if (!redis)
        return [];
    const fields = await redis.hGetAll(getLobbyStudentsKey(quizId));
    const students = [];
    for (const k of Object.keys(fields)) {
        try {
            students.push(JSON.parse(fields[k]));
        }
        catch (_a) { }
    }
    return students;
}
async function clearLobbyStudents(quizId) {
    const redis = await (0, redis_1.getRedisPublisher)();
    if (!redis)
        return;
    await redis.del(getLobbyStudentsKey(quizId));
}
