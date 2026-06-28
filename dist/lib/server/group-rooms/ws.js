"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachGroupRoomsChatServer = attachGroupRoomsChatServer;
exports.notifyTeachersInRoom = notifyTeachersInRoom;
const chat_1 = require("./chat");
const room_1 = require("./room");
const contribution_1 = require("./contribution");
function attachGroupRoomsChatServer(io) {
    // Namespace pattern: /group-rooms/:roomId/chat
    io.of(/^\/group-rooms\/[a-f0-9-]+\/chat$/i).on("connection", async (socket) => {
        var _a, _b, _c;
        // Extract roomId from namespace
        const namespace = socket.nsp.name; // e.g., /group-rooms/abc-123/chat
        const roomId = (_a = namespace.match(/\/group-rooms\/([a-f0-9-]+)\/chat/i)) === null || _a === void 0 ? void 0 : _a[1];
        if (!roomId) {
            socket.disconnect();
            return;
        }
        const userId = (_b = socket.handshake.auth) === null || _b === void 0 ? void 0 : _b.userId;
        const userRole = (_c = socket.handshake.auth) === null || _c === void 0 ? void 0 : _c.role;
        // Check authorization: user must be room member or teacher
        let isAuthorized = false;
        if (userRole === "teacher") {
            isAuthorized = true; // Teachers can view all rooms
        }
        else {
            isAuthorized = await (0, room_1.isRoomMember)(roomId, userId);
        }
        if (!isAuthorized) {
            socket.disconnect();
            return;
        }
        // Subscribe to room's chat channel
        socket.join(`room:${roomId}:chat`);
        // Send existing messages (last 50)
        try {
            const messages = await (0, chat_1.getRoomMessages)(roomId, 50, 0);
            socket.emit("message_history", {
                messages: messages.map((msg) => ({
                    id: msg.id,
                    senderId: msg.senderId,
                    text: msg.text,
                    createdAt: msg.createdAt,
                })),
            });
        }
        catch (err) {
            console.error("Error fetching message history:", err);
        }
        /**
         * Handle incoming chat message
         * Only actual room members (not teachers) can send messages
         */
        socket.on("send_message", async (data, callback) => {
            // Teachers cannot send messages (observer only)
            if (userRole === "teacher") {
                callback === null || callback === void 0 ? void 0 : callback({ error: "teachers_cannot_send_messages" });
                return;
            }
            if (!data.text || typeof data.text !== "string") {
                callback === null || callback === void 0 ? void 0 : callback({ error: "invalid_message" });
                return;
            }
            try {
                const messageId = await (0, chat_1.saveChatMessage)(roomId, userId, data.text.trim());
                // Increment messages_sent metric
                await (0, contribution_1.incrementMessagesSent)(roomId, userId);
                // Broadcast message to all in room
                const messageEvent = {
                    id: messageId,
                    senderId: userId,
                    senderName: userId, // TODO: fetch from user table
                    text: data.text.trim(),
                    createdAt: new Date().toISOString(),
                };
                io.of(`/group-rooms/${roomId}/chat`).emit("new_message", messageEvent);
                callback === null || callback === void 0 ? void 0 : callback({ ok: true, messageId });
            }
            catch (err) {
                console.error("Error saving message:", err);
                callback === null || callback === void 0 ? void 0 : callback({ error: err.message });
            }
        });
        /**
         * Handle user typing indicator
         */
        socket.on("user_typing", (data) => {
            // Broadcast to all in room EXCEPT sender
            socket.broadcast.emit("user_typing", {
                userId,
                isTyping: data.isTyping,
            });
        });
        /**
         * Cleanup on disconnect
         */
        socket.on("disconnect", () => {
            socket.leave(`room:${roomId}:chat`);
        });
    });
}
/**
 * Emit notification to teachers in a room
 * Used for teacher-visible events (inactivity alerts, reports, etc.)
 */
function notifyTeachersInRoom(io, roomId, event, data) {
    // Broadcast to a specific channel for teachers
    io.emit(`room:${roomId}:teacher_notification`, {
        event,
        data,
    });
}
