"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCSV = parseCSV;
exports.bulkEnrolUsers = bulkEnrolUsers;
exports.createUser = createUser;
exports.deleteUser = deleteUser;
exports.resetUserPassword = resetUserPassword;
/**
 * Admin User Management Service
 * Bulk enrol, create, delete, password reset
 */
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
/**
 * Generate secure temporary password
 */
function generateTempPassword() {
    const length = 16;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}
/**
 * Parse CSV content into rows
 */
function parseCSV(csvContent) {
    const lines = csvContent.trim().split("\n");
    const rows = [];
    // Skip header if present
    let startIdx = 0;
    if (lines[0].toLowerCase().includes("email") ||
        lines[0].toLowerCase().includes("role")) {
        startIdx = 1;
    }
    for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].split(",").map((p) => p.trim());
        if (parts.length >= 3) {
            rows.push({
                email: parts[0],
                role: parts[1].toLowerCase() || "student",
                courseCode: parts[2],
            });
        }
    }
    return rows;
}
/**
 * Bulk enrol users from CSV
 */
async function bulkEnrolUsers(institutionId, csvContent) {
    const pool = (0, postgres_1.getPostgresPool)();
    const rows = parseCSV(csvContent);
    const response = {
        success: 0,
        failed: [],
    };
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        try {
            const { email, role, courseCode } = row;
            if (!email || !role || !courseCode) {
                throw new Error("missing_required_fields");
            }
            // Find or create user
            const userRes = await pool.query(`SELECT id FROM users WHERE email = $1 AND institution_id = $2`, [email, institutionId]);
            let userId;
            let tempPassword = null;
            if (userRes.rows.length > 0) {
                userId = userRes.rows[0].id;
            }
            else {
                // Create new user
                userId = (0, crypto_1.randomUUID)();
                tempPassword = generateTempPassword();
                await pool.query(`INSERT INTO users (id, institution_id, email, name, role, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`, [userId, institutionId, email, email.split("@")[0], role]);
                // TODO: Send welcome email with temp password
                console.log(`[Enrol] New user created: ${email}, temp password: ${tempPassword}`);
            }
            // Find course
            const courseRes = await pool.query(`SELECT id FROM courses WHERE code = $1 AND institution_id = $2`, [courseCode, institutionId]);
            if (courseRes.rows.length === 0) {
                throw new Error(`course_not_found: ${courseCode}`);
            }
            const courseId = courseRes.rows[0].id;
            // Enrol user in course
            const enrollRes = await pool.query(`INSERT INTO course_enrollments (user_id, course_id, role, enrolled_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, course_id) DO NOTHING`, [userId, courseId, role]);
            response.success++;
        }
        catch (err) {
            response.failed.push({
                row: rowIdx + 1,
                email: row.email,
                reason: err.message,
            });
        }
    }
    return response;
}
/**
 * Create single user
 */
async function createUser(institutionId, request) {
    const pool = (0, postgres_1.getPostgresPool)();
    // Check if user already exists
    const existingRes = await pool.query(`SELECT id FROM users WHERE email = $1 AND institution_id = $2`, [request.email, institutionId]);
    if (existingRes.rows.length > 0) {
        throw new Error("user_already_exists");
    }
    const userId = (0, crypto_1.randomUUID)();
    const tempPassword = generateTempPassword();
    await pool.query(`INSERT INTO users (id, institution_id, email, name, role, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`, [userId, institutionId, request.email, request.name, request.role]);
    // TODO: Send welcome email with temp password
    return {
        userId,
        email: request.email,
        tempPassword,
    };
}
/**
 * Delete user (soft delete)
 */
async function deleteUser(userId, adminId, institutionId, reason) {
    const pool = (0, postgres_1.getPostgresPool)();
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Soft delete user
        await client.query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [userId]);
        // Remove from all course enrollments
        const enrollRes = await client.query(`DELETE FROM course_enrollments WHERE user_id = $1`, [userId]);
        const enrollmentsRemoved = enrollRes.rowCount || 0;
        // Invalidate sessions in Redis
        const redis = require("redis").getClient();
        if (redis) {
            const sessionKeys = await redis.keys(`session:${userId}:*`);
            if (sessionKeys.length > 0) {
                await redis.del(...sessionKeys);
            }
        }
        // Create audit log
        await client.query(`INSERT INTO user_deletion_audit (id, user_id, deleted_by, institution_id, reason, cascade_results)
       VALUES ($1, $2, $3, $4, $5, $6)`, [
            (0, crypto_1.randomUUID)(),
            userId,
            adminId,
            institutionId,
            reason,
            JSON.stringify({
                enrollmentsRemoved,
                sessionsInvalidated: 0, // Redis doesn't track count
            }),
        ]);
        await client.query("COMMIT");
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
 * Reset user password
 */
async function resetUserPassword(userId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const tempPassword = generateTempPassword();
    await pool.query(`UPDATE users SET password_hash = NULL, updated_at = NOW()
     WHERE id = $1`, [userId]);
    // TODO: Send email with temp password
    return tempPassword;
}
