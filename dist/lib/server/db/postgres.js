"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPostgresPool = getPostgresPool;
exports.closePostgresPool = closePostgresPool;
const pg_1 = require("pg");
let pool = null;
function getPostgresPool() {
    if (!pool) {
        if (!process.env.DATABASE_URL) {
            throw new Error("DATABASE_URL is required");
        }
        pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
        });
    }
    return pool;
}
async function closePostgresPool() {
    if (!pool) {
        return;
    }
    await pool.end();
    pool = null;
}
