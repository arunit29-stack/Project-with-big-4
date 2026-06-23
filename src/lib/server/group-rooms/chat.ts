/**
 * Room Chat Message Service
 * Messages stored in PostgreSQL with 2-year retention
 */
import { randomUUID } from "crypto";
import { getPostgresPool } from "../db/postgres";
import type { RoomChatMessage } from "../../types/group-rooms";

/**
 * Save a chat message
 */
export async function saveChatMessage(
  roomId: string,
  senderId: string,
  text: string
): Promise<string> {
  const pool = getPostgresPool();
  const messageId = randomUUID();

  await pool.query(
    `INSERT INTO room_chat_messages (id, room_id, sender_id, text)
     VALUES ($1, $2, $3, $4)`,
    [messageId, roomId, senderId, text]
  );

  return messageId;
}

/**
 * Get chat messages for a room (paginated)
 */
export async function getRoomMessages(
  roomId: string,
  limit: number = 50,
  offset: number = 0
): Promise<RoomChatMessage[]> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT id, room_id, sender_id, text, created_at, expires_at
     FROM room_chat_messages
     WHERE room_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [roomId, limit, offset]
  );

  return res.rows.map((row) => ({
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    text: row.text,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  }));
}

/**
 * Get message count for room
 */
export async function getRoomMessageCount(roomId: string): Promise<number> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT COUNT(*) as count FROM room_chat_messages WHERE room_id = $1`,
    [roomId]
  );

  return parseInt(res.rows[0].count, 10);
}

/**
 * Delete expired messages (2-year retention)
 * Should be run periodically (e.g., daily cron)
 */
export async function deleteExpiredMessages(): Promise<number> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `DELETE FROM room_chat_messages
     WHERE expires_at < NOW()`
  );

  return res.rowCount || 0;
}

/**
 * Delete all messages for a room
 * (Used when room is deleted)
 */
export async function deleteRoomMessages(roomId: string): Promise<void> {
  const pool = getPostgresPool();
  await pool.query(`DELETE FROM room_chat_messages WHERE room_id = $1`, [
    roomId,
  ]);
}
