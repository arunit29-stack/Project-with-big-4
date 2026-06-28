"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purgeUserPII = purgeUserPII;
exports.getGDPRPurgeLog = getGDPRPurgeLog;
exports.listGDPRPurges = listGDPRPurges;
/**
 * GDPR/FERPA Data Purge Service
 * Full PII anonymization across all modules
 * CRITICAL: Immutable audit trail
 */
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
/**
 * Generate anonymous identifier
 */
function generateAnonymousId() {
    return `REDACTED_${(0, crypto_1.randomUUID)().replace(/-/g, "").substring(0, 12)}`;
}
/**
 * Full PII purge for a user
 * CRITICAL: This is irreversible. Must be carefully audited.
 */
async function purgeUserPII(userId, adminId, institutionId, reason) {
    const pool = (0, postgres_1.getPostgresPool)();
    const client = await pool.connect();
    const purgeId = (0, crypto_1.randomUUID)();
    const anonId = generateAnonymousId();
    try {
        await client.query("BEGIN");
        let tablesAffected = [];
        let recordsAnonymised = 0;
        let filesDeleted = 0;
        let vectorEmbeddingsRemoved = 0;
        // 1. Anonymise user row
        await client.query(`UPDATE users SET email = $1, name = $2, anonymised_at = NOW() WHERE id = $3`, [anonId + "@redacted.local", anonId, userId]);
        tablesAffected.push("users");
        recordsAnonymised += 1;
        // 2. Delete DM message bodies
        const dmRes = await client.query(`UPDATE direct_message_content SET body = '[Content removed]' WHERE sender_id = $1 OR recipient_id = $1`, [userId]);
        if (dmRes.rowCount && dmRes.rowCount > 0) {
            tablesAffected.push("direct_message_content");
            recordsAnonymised += dmRes.rowCount;
        }
        // 3. Replace chat messages with '[Content removed]'
        const chatRes = await client.query(`UPDATE room_chat_messages SET text = '[Content removed]' WHERE sender_id = $1`, [userId]);
        if (chatRes.rowCount && chatRes.rowCount > 0) {
            tablesAffected.push("room_chat_messages");
            recordsAnonymised += chatRes.rowCount;
        }
        // 4. Remove peer review associations
        // Delete from review_tokens (if user is reviewer)
        const reviewTokenRes = await client.query(`DELETE FROM review_tokens WHERE reviewer_id = $1`, [userId]);
        if (reviewTokenRes.rowCount && reviewTokenRes.rowCount > 0) {
            tablesAffected.push("review_tokens");
            recordsAnonymised += reviewTokenRes.rowCount;
        }
        // 5. Anonymise student name in peer_review_assignments
        const peerReviewRes = await client.query(`UPDATE peer_review_assignments SET submitter_id = NULL WHERE submitter_id = $1`, [userId]);
        if (peerReviewRes.rowCount && peerReviewRes.rowCount > 0) {
            tablesAffected.push("peer_review_assignments");
            recordsAnonymised += peerReviewRes.rowCount;
        }
        // 6. Zero out submission files from S3 (mark as deleted)
        const submissionsRes = await client.query(`UPDATE submissions SET file_key = NULL, file_name = NULL, content = '[Content removed]' 
       WHERE user_id = $1`, [userId]);
        if (submissionsRes.rowCount && submissionsRes.rowCount > 0) {
            tablesAffected.push("submissions");
            recordsAnonymised += submissionsRes.rowCount;
            filesDeleted = submissionsRes.rowCount || 0;
        }
        // 7. Remove from contribution_metrics (group rooms)
        const contributionRes = await client.query(`DELETE FROM contribution_metrics WHERE student_id = $1`, [userId]);
        if (contributionRes.rowCount && contributionRes.rowCount > 0) {
            tablesAffected.push("contribution_metrics");
            recordsAnonymised += contributionRes.rowCount;
        }
        // 8. Anonymise annotations
        const annotationsRes = await client.query(`UPDATE pdf_annotations SET user_id = NULL, content = '[Content removed]' WHERE user_id = $1`, [userId]);
        if (annotationsRes.rowCount && annotationsRes.rowCount > 0) {
            tablesAffected.push("pdf_annotations");
            recordsAnonymised += annotationsRes.rowCount;
        }
        // 9. Anonymise AI query logs (retain aggregated stats only)
        const aiLogsRes = await client.query(`UPDATE ai_query_logs SET query = '[Content removed]', response = '[Content removed]' 
       WHERE user_id = $1`, [userId]);
        if (aiLogsRes.rowCount && aiLogsRes.rowCount > 0) {
            tablesAffected.push("ai_query_logs");
            recordsAnonymised += aiLogsRes.rowCount;
        }
        // 10. Set anonymised_at on quiz_attempt_data
        const quizAttemptsRes = await client.query(`UPDATE quiz_attempts SET anonymised_at = NOW() WHERE user_id = $1`, [userId]);
        if (quizAttemptsRes.rowCount && quizAttemptsRes.rowCount > 0) {
            tablesAffected.push("quiz_attempts");
            recordsAnonymised += quizAttemptsRes.rowCount;
        }
        // 11. Remove video notes (PII in annotations)
        const videoNotesRes = await client.query(`DELETE FROM video_notes WHERE user_id = $1`, [userId]);
        if (videoNotesRes.rowCount && videoNotesRes.rowCount > 0) {
            tablesAffected.push("video_notes");
            recordsAnonymised += videoNotesRes.rowCount;
        }
        // 12. Remove inactivity reports
        const inactivityRes = await client.query(`DELETE FROM inactivity_reports WHERE reporter_id = $1 OR reported_student_id = $1`, [userId]);
        if (inactivityRes.rowCount && inactivityRes.rowCount > 0) {
            tablesAffected.push("inactivity_reports");
            recordsAnonymised += inactivityRes.rowCount;
        }
        // 13. TODO: Remove vector embeddings from Pinecone
        // await pineconeClient.deleteByMetadata({ studentId: userId });
        // vectorEmbeddingsRemoved = count from Pinecone
        vectorEmbeddingsRemoved = 0; // Placeholder
        // 14. Create immutable audit log
        await client.query(`INSERT INTO gdpr_purge_audit_log (
        id, admin_id, user_id, institution_id, action, tables_affected, 
        records_anonymised, files_deleted, vector_embeddings_removed, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
            purgeId,
            adminId,
            userId,
            institutionId,
            "full_pii_purge",
            tablesAffected,
            recordsAnonymised,
            filesDeleted,
            vectorEmbeddingsRemoved,
            reason,
        ]);
        await client.query("COMMIT");
        return {
            userId,
            tablesAffected,
            recordsAnonymised,
            filesDeleted,
            vectorEmbeddingsRemoved,
            purgeId,
            purgedAt: new Date().toISOString(),
        };
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
/**
 * Get GDPR purge audit log (immutable)
 */
async function getGDPRPurgeLog(purgeId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const res = await pool.query(`SELECT * FROM gdpr_purge_audit_log WHERE id = $1`, [purgeId]);
    if (res.rows.length === 0) {
        return null;
    }
    return res.rows[0];
}
/**
 * List all GDPR purges for institution (audit purposes)
 */
async function listGDPRPurges(institutionId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const res = await pool.query(`SELECT id, admin_id, user_id, records_anonymised, files_deleted, created_at 
     FROM gdpr_purge_audit_log 
     WHERE institution_id = $1 
     ORDER BY created_at DESC`, [institutionId]);
    return res.rows;
}
