import { getPostgresPool } from "../db/postgres";

export async function initQuizDatabase(): Promise<void> {
  const pool = getPostgresPool();
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id UUID PRIMARY KEY,
      course_id VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'draft' NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
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
      voided BOOLEAN DEFAULT FALSE,
      status VARCHAR(50) DEFAULT 'draft' NOT NULL,
      generated_by_ai BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
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

  // Group Rooms Schema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_rooms (
      id UUID PRIMARY KEY,
      course_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_by VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS group_room_members (
      id UUID PRIMARY KEY,
      room_id UUID NOT NULL REFERENCES group_rooms(id) ON DELETE CASCADE,
      student_id VARCHAR(255) NOT NULL,
      joined_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(room_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS room_chat_messages (
      id UUID PRIMARY KEY,
      room_id UUID NOT NULL REFERENCES group_rooms(id) ON DELETE CASCADE,
      sender_id VARCHAR(255) NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '2 years'
    );

    CREATE TABLE IF NOT EXISTS group_room_tasks (
      id UUID PRIMARY KEY,
      room_id UUID NOT NULL REFERENCES group_rooms(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      assigned_to VARCHAR(255),
      created_by VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'todo' NOT NULL,
      due_date TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_audit_log (
      id UUID PRIMARY KEY,
      task_id UUID NOT NULL REFERENCES group_room_tasks(id) ON DELETE CASCADE,
      room_id UUID NOT NULL REFERENCES group_rooms(id) ON DELETE CASCADE,
      changed_by VARCHAR(255) NOT NULL,
      old_status VARCHAR(50),
      new_status VARCHAR(50),
      changed_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contribution_metrics (
      id UUID PRIMARY KEY,
      room_id UUID NOT NULL REFERENCES group_rooms(id) ON DELETE CASCADE,
      student_id VARCHAR(255) NOT NULL,
      metric_date DATE NOT NULL,
      messages_sent INT DEFAULT 0,
      task_completions INT DEFAULT 0,
      document_edit_events INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(room_id, student_id, metric_date)
    );

    CREATE TABLE IF NOT EXISTS inactivity_reports (
      id UUID PRIMARY KEY,
      room_id UUID NOT NULL REFERENCES group_rooms(id) ON DELETE CASCADE,
      reporter_id VARCHAR(255) NOT NULL,
      reported_student_id VARCHAR(255) NOT NULL,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS peer_review_configs (
      id UUID PRIMARY KEY,
      assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      reviewers_per_submission INT DEFAULT 2,
      rubric JSONB NOT NULL,
      review_deadline_utc TIMESTAMP NOT NULL,
      grade_contribution_percent INT DEFAULT 50,
      outlier_z_score_threshold NUMERIC DEFAULT 2.0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS review_tokens (
      token VARCHAR(255) PRIMARY KEY,
      assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      reviewer_id VARCHAR(255) NOT NULL,
      submitter_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS peer_review_assignments (
      id UUID PRIMARY KEY,
      assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      reviewer_id VARCHAR(255) NOT NULL,
      submitter_id VARCHAR(255) NOT NULL,
      submission_id UUID NOT NULL,
      review_token VARCHAR(255) NOT NULL UNIQUE REFERENCES review_tokens(token) ON DELETE CASCADE,
      status VARCHAR(50) DEFAULT 'pending' NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(assignment_id, reviewer_id, submission_id)
    );

    CREATE TABLE IF NOT EXISTS peer_review_scores (
      id UUID PRIMARY KEY,
      assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      submission_id UUID NOT NULL,
      review_token VARCHAR(255) NOT NULL REFERENCES review_tokens(token) ON DELETE CASCADE,
      criterion VARCHAR(255) NOT NULL,
      score NUMERIC NOT NULL,
      justification TEXT,
      is_overridden BOOLEAN DEFAULT FALSE,
      overridden_score NUMERIC,
      z_score NUMERIC,
      is_outlier BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(submission_id, review_token, criterion)
    );

    CREATE TABLE IF NOT EXISTS peer_review_overrides (
      id UUID PRIMARY KEY,
      assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      submission_id UUID NOT NULL,
      review_token VARCHAR(255) NOT NULL,
      criterion VARCHAR(255) NOT NULL,
      original_score NUMERIC NOT NULL,
      overridden_score NUMERIC NOT NULL,
      reason TEXT,
      created_by VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS peer_review_discards (
      id UUID PRIMARY KEY,
      assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      review_token VARCHAR(255) NOT NULL,
      submission_id UUID NOT NULL,
      reason TEXT,
      created_by VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS peer_review_results (
      id UUID PRIMARY KEY,
      assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      submission_id UUID NOT NULL,
      submitter_id VARCHAR(255) NOT NULL,
      peer_score NUMERIC,
      peer_grade_contribution NUMERIC,
      teacher_rubric_score NUMERIC,
      final_grade_contribution NUMERIC,
      final_grade NUMERIC,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS peer_review_audit_log (
      id UUID PRIMARY KEY,
      assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      action VARCHAR(100) NOT NULL,
      review_token VARCHAR(255),
      submission_id UUID,
      details JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      created_by VARCHAR(255)
    );

    CREATE TABLE IF NOT EXISTS peer_review_outlier_flags (
      id UUID PRIMARY KEY,
      assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      review_token VARCHAR(255) NOT NULL,
      submission_id UUID NOT NULL,
      criterion VARCHAR(255) NOT NULL,
      score NUMERIC NOT NULL,
      z_score NUMERIC NOT NULL,
      threshold NUMERIC NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP,
      resolution_action VARCHAR(50),
      resolved_by VARCHAR(255)
    );

    CREATE TABLE IF NOT EXISTS institutions (
      id UUID PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255),
      role VARCHAR(50) NOT NULL,
      password_hash VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP,
      anonymised_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS institution_settings (
      id UUID PRIMARY KEY,
      institution_id UUID NOT NULL UNIQUE REFERENCES institutions(id) ON DELETE CASCADE,
      sso_enabled BOOLEAN DEFAULT FALSE,
      sso_oauth2_client_id VARCHAR(255),
      sso_discovery_url VARCHAR(255),
      institution_name VARCHAR(255),
      logo_url VARCHAR(255),
      custom_domain VARCHAR(255),
      features JSONB DEFAULT '{"peerReview": true, "groupRooms": true, "aiQuizGeneration": true, "liveSession": true}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_deletion_audit (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      deleted_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
      institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      reason TEXT,
      cascade_results JSONB,
      deleted_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS course_transfer_audit (
      id UUID PRIMARY KEY,
      course_id UUID NOT NULL,
      old_teacher_id VARCHAR(255),
      new_teacher_id VARCHAR(255),
      transferred_by UUID NOT NULL,
      institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      assets_transferred JSONB,
      transferred_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gdpr_purge_audit_log (
      id UUID PRIMARY KEY,
      admin_id UUID NOT NULL,
      user_id UUID NOT NULL,
      institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      action VARCHAR(100) DEFAULT 'full_pii_purge',
      tables_affected TEXT[],
      records_anonymised INT,
      files_deleted INT,
      vector_embeddings_removed INT,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      -- Immutable record - never updated
      CONSTRAINT gdpr_purge_immutable CHECK (created_at IS NOT NULL)
    );
  `);
}
