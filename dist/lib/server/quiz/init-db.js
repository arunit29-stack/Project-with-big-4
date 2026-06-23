"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initQuizDatabase = initQuizDatabase;
const postgres_1 = require("../db/postgres");
async function initQuizDatabase() {
    const pool = (0, postgres_1.getPostgresPool)();
    await pool.query(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id UUID PRIMARY KEY,
      course_id VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id UUID PRIMARY KEY,
      quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      text TEXT NOT NULL,
      options JSONB,
      correct_option_index INT,
      explanation TEXT,
      point_value INT DEFAULT 10,
      time_limit_seconds INT DEFAULT 30,
      question_index INT NOT NULL,
      voided BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id UUID PRIMARY KEY,
      quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      status VARCHAR(50) DEFAULT 'started',
      score NUMERIC DEFAULT 0,
      started_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
      id UUID PRIMARY KEY,
      attempt_id UUID REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      question_id UUID REFERENCES quiz_questions(id) ON DELETE CASCADE,
      selected_option VARCHAR(255),
      submitted_at TIMESTAMP DEFAULT NOW(),
      time_remaining_seconds INT,
      is_correct BOOLEAN DEFAULT FALSE,
      points_awarded NUMERIC DEFAULT 0,
      UNIQUE (attempt_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS student_xp_ledger (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      course_id VARCHAR(255) NOT NULL,
      quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
      xp_amount INT NOT NULL,
      earned_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quiz_integrity_log (
      id UUID PRIMARY KEY,
      quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      timestamp TIMESTAMP DEFAULT NOW(),
      user_agent TEXT,
      ip_address VARCHAR(50)
    );
  `);
    await pool.query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id UUID PRIMARY KEY,
      course_id VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      deadline_utc TIMESTAMP NOT NULL,
      rubric JSONB,
      late_policy JSONB,
      created_by VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE assignments ADD COLUMN IF NOT EXISTS file_key VARCHAR(255) DEFAULT NULL;
    ALTER TABLE assignments ADD COLUMN IF NOT EXISTS file_name VARCHAR(255) DEFAULT NULL;
    ALTER TABLE assignments ADD COLUMN IF NOT EXISTS solution_key VARCHAR(255) DEFAULT NULL;
    ALTER TABLE assignments ADD COLUMN IF NOT EXISTS solution_name VARCHAR(255) DEFAULT NULL;
  `);
}
