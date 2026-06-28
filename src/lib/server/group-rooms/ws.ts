/**
 * Socket.io namespace for group room chat
 * Messages are persisted to PostgreSQL
 * Teacher can view all messages (read-only observer)
 */
import type { Server } from "socket.io";
import {
  saveChatMessage,
  getRoomMessages,
} from "./chat";
import { isRoomMember } from "./room";
import { incrementMessagesSent } from "./contribution";
import type { ChatMessageEvent } from "../../../types/group-rooms";

export function attachGroupRoomsChatServer(io: Server): void {
  // Namespace pattern: /group-rooms/:roomId/chat
  io.of(/^\/group-rooms\/[a-f0-9-]+\/chat$/i).on("connection", async (socket) => {
    // Extract roomId from namespace
    const namespace = socket.nsp.name; // e.g., /group-rooms/abc-123/chat
    const roomId = namespace.match(/\/group-rooms\/([a-f0-9-]+)\/chat/i)?.[1];

    if (!roomId) {
      socket.disconnect();
      return;
    }

    const userId = socket.handshake.auth?.userId as string;
    const userRole = socket.handshake.auth?.role as string;

    // Check authorization: user must be room member or teacher
    let isAuthorized = false;
    if (userRole === "teacher") {
      isAuthorized = true; // Teachers can view all rooms
    } else {
      isAuthorized = await isRoomMember(roomId, userId);
    }

    if (!isAuthorized) {
      socket.disconnect();
      return;
    }

    // Subscribe to room's chat channel
    socket.join(`room:${roomId}:chat`);

    // Send existing messages (last 50)
    try {
      const messages = await getRoomMessages(roomId, 50, 0);
      socket.emit("message_history", {
        messages: messages.map((msg) => ({
          id: msg.id,
          senderId: msg.senderId,
          text: msg.text,
          createdAt: msg.createdAt,
        })),
      });
    } catch (err) {
      console.error("Error fetching message history:", err);
    }

    /**
     * Handle incoming chat message
     * Only actual room members (not teachers) can send messages
     */
    socket.on("send_message", async (data: { text: string }, callback) => {
      // Teachers cannot send messages (observer only)
      if (userRole === "teacher") {
        callback?.({ error: "teachers_cannot_send_messages" });
        return;
      }

      if (!data.text || typeof data.text !== "string") {
        callback?.({ error: "invalid_message" });
        return;
      }

      try {
        const messageId = await saveChatMessage(roomId, userId, data.text.trim());

        // Increment messages_sent metric
        await incrementMessagesSent(roomId, userId);

        // Broadcast message to all in room
        const messageEvent: ChatMessageEvent = {
          id: messageId,
          senderId: userId,
          senderName: userId, // TODO: fetch from user table
          text: data.text.trim(),
          createdAt: new Date().toISOString(),
        };

        io.of(`/group-rooms/${roomId}/chat`).emit("new_message", messageEvent);
        callback?.({ ok: true, messageId });
      } catch (err) {
        console.error("Error saving message:", err);
        callback?.({ error: (err as Error).message });
      }
    });

    /**
     * Handle user typing indicator
     */
    socket.on("user_typing", (data: { isTyping: boolean }) => {
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
export function notifyTeachersInRoom(
  io: Server,
  roomId: string,
  event: string,
  data: unknown
): void {
  // Broadcast to a specific channel for teachers
  io.emit(`room:${roomId}:teacher_notification`, {
    event,
    data,
  });
}
