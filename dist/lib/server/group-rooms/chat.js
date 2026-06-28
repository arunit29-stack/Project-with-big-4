"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveChatMessage = saveChatMessage;
exports.getRoomMessages = getRoomMessages;
exports.getRoomMessageCount = getRoomMessageCount;
exports.deleteExpiredMessages = deleteExpiredMessages;
exports.deleteRoomMessages = deleteRoomMessages;
/**
 * Room Chat Message Service
 * Messages stored in PostgreSQL with 2-year retention
 */
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
/**
 * Save a chat message
 */
async function saveChatMessage(roomId, senderId, text) {
    const pool = (0, postgres_1.getPostgresPool)();
    const messageId = (0, crypto_1.randomUUID)();
    await pool.query(`INSERT INTO room_chat_messages (id, room_id, sender_id, text)
     VALUES ($1, $2, $3, $4)`, [messageId, roomId, senderId, text]);
    return messageId;
}
/**
 * Get chat messages for a room (paginated)
 */
async function getRoomMessages(roomId, limit = 50, offset = 0) {
    const pool = (0, postgres_1.getPostgresPool)();
    const res = await pool.query(`SELECT id, room_id, sender_id, text, created_at, expires_at
     FROM room_chat_messages
     WHERE room_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`, [roomId, limit, offset]);
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
async function getRoomMessageCount(roomId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const res = await pool.query(`SELECT COUNT(*) as count FROM room_chat_messages WHERE room_id = $1`, [roomId]);
    return parseInt(res.rows[0].count, 10);
}
/**
 * Delete expired messages (2-year retention)
 * Should be run periodically (e.g., daily cron)
 */
async function deleteExpiredMessages() {
    const pool = (0, postgres_1.getPostgresPool)();
    const res = await pool.query(`DELETE FROM room_chat_messages
     WHERE expires_at < NOW()`);
    return res.rowCount || 0;
}
/**
 * Delete all messages for a room
 * (Used when room is deleted)
 */
async function deleteRoomMessages(roomId) {
    const pool = (0, postgres_1.getPostgresPool)();
    await pool.query(`DELETE FROM room_chat_messages WHERE room_id = $1`, [
        roomId,
    ]);
}
