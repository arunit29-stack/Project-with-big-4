import { getPostgresPool } from "../src/lib/server/db/postgres";
import { initQuizDatabase } from "../src/lib/server/quiz/init-db";
import { randomUUID } from "crypto";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("Initializing database schema...");
  await initQuizDatabase();
  console.log("Schema initialized successfully.");

  const pool = getPostgresPool();
  
  // Check if institution exists, otherwise create a default one
  const res = await pool.query(`SELECT id FROM institutions WHERE name = 'Default Institution'`);
  if (res.rows.length === 0) {
    console.log("Creating default institution...");
    const instId = randomUUID();
    await pool.query(
      `INSERT INTO institutions (id, name) VALUES ($1, $2)`,
      [instId, 'Default Institution']
    );
    console.log(`Default institution created with ID: ${instId}`);
  } else {
    console.log(`Default institution already exists with ID: ${res.rows[0].id}`);
  }

  await pool.end();
}

main().catch(console.error);
