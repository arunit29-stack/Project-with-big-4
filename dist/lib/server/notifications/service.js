"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyUser = notifyUser;
const redis_1 = require("./redis");
const store_1 = require("./store");
function buildEnvelope(notification, userId) {
    return Object.assign({ userId }, notification);
}
async function notifyUser(userId, type, payload) {
    const notification = await (0, store_1.insertNotification)({
        userId,
        type,
        courseId: typeof payload.courseId === "string" ? payload.courseId : null,
        courseName: typeof payload.courseName === "string" ? payload.courseName : null,
        message: typeof payload.message === "string" ? payload.message : "New notification",
        navigateTo: typeof payload.navigateTo === "string" ? payload.navigateTo : null,
        payload,
    });
    const publisher = await (0, redis_1.getRedisPublisher)();
    if (publisher) {
        await publisher.publish(`notifications:${userId}`, JSON.stringify(buildEnvelope(notification, userId)));
    }
    return notification;
}
