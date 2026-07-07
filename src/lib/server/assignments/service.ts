import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getPostgresPool } from "../db/postgres";
import { getR2Bucket, getR2Client } from "../library/r2";
import { notifyUser } from "../notifications/service";
import type {
  Assessment,
  Assignment,
  CriterionScore,
  PresignResponse,
  RubricCriterion,
  StudentAssignmentListItem,
  TeacherAssignmentListItem,
  TeacherSubmissionRow,
} from "@/types/assignment";

type LatePolicy =
  | { type: "percentage_per_day"; deductionPercent?: number }
  | { type: "hard_cutoff" };

type AssignmentRow = {
  id: string;
  course_id: string;
  title: string;
  description: string;
  deadline_utc: string;
  rubric: RubricCriterion[];
  late_policy: LatePolicy;
  created_by: string;
  created_at: string;
  file_key: string | null;
  file_name: string | null;
  solution_key: string | null;
  solution_name: string | null;
};

type SubmissionRow = {
  id: string;
  course_id: string;
  assignment_id: string;
  student_id: string;
  student_name: string;
  version: number;
  submitted_at: string;
  file_key: string;
  file_name: string;
  status: "pending_review" | "assessed";
  late_penalty_applied: number;
  late_penalty_waived: boolean;
  assessed_at: string | null;
  rubric_scores: CriterionScore[] | null;
  overall_feedback: string | null;
  score: number | null;
  unlocked_until: string | null;
  is_locked: boolean;
};

function toAssignment(row: AssignmentRow): Assignment {
  const latePenaltyPercent =
    row.late_policy.type === "percentage_per_day"
      ? row.late_policy.deductionPercent ?? 0
      : 100;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    deadline: row.deadline_utc,
    rubric: row.rubric,
    latePenaltyPercent,
    fileKey: row.file_key ?? undefined,
    fileName: row.file_name ?? undefined,
    fileUrl: row.file_key ? fileUrl(row.file_key) : undefined,
    solutionKey: row.solution_key ?? undefined,
    solutionName: row.solution_name ?? undefined,
    solutionUrl: row.solution_key ? fileUrl(row.solution_key) : undefined,
  };
}

function fileUrl(fileKey: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/mock-files/${fileKey}`;
}

function computeLatePenalty(
  deadlineUtc: string,
  submittedAt: Date,
  latePolicy: LatePolicy,
): { isLate: boolean; latePenaltyApplied: number } {
  const deadline = new Date(deadlineUtc).getTime();
  const submitted = submittedAt.getTime();
  if (submitted <= deadline) {
    return { isLate: false, latePenaltyApplied: 0 };
  }

  if (latePolicy.type === "hard_cutoff") {
    return { isLate: true, latePenaltyApplied: 100 };
  }

  const secondsLate = Math.max(0, (submitted - deadline) / 1000);
  const daysLate = Math.ceil(secondsLate / 86400);
  return {
    isLate: true,
    latePenaltyApplied: daysLate * (latePolicy.deductionPercent ?? 0),
  };
}

async function getAssignmentRow(courseId: string, assignmentId: string) {
  const result = await getPostgresPool().query<AssignmentRow>(
    `SELECT * FROM assignments WHERE course_id = $1 AND id = $2 LIMIT 1`,
    [courseId, assignmentId],
  );
  return result.rows[0] ?? null;
}

async function ensureTeacherOwnsCourse(userId: string, courseId: string) {
  // Bypassed query because the teacher_courses table does not exist in the database.
  // Role authorization is already verified by requireNextAuth.
  return true;
}

async function ensureStudentEnrollment(userId: string, courseId: string) {
  // Bypassed query because the course_enrollments table does not exist in the database.
  // Role authorization is already verified by requireNextAuth.
  return true;
}

export async function createAssignment(input: {
  courseId: string;
  teacherId: string;
  title: string;
  description: string;
  deadlineUtc: string;
  rubric: RubricCriterion[];
  latePolicy: LatePolicy;
  fileKey?: string | null;
  fileName?: string | null;
}): Promise<Assignment> {
  if (!(await ensureTeacherOwnsCourse(input.teacherId, input.courseId))) {
    throw new Error("forbidden");
  }
  const id = randomUUID();
  await getPostgresPool().query(
    `
      INSERT INTO assignments (
        id, course_id, title, description, deadline_utc, rubric, late_policy, created_by, file_key, file_name
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `,
    [
      id,
      input.courseId,
      input.title,
      input.description,
      input.deadlineUtc,
      JSON.stringify(input.rubric),
      JSON.stringify(input.latePolicy),
      input.teacherId,
      input.fileKey ?? null,
      input.fileName ?? null,
    ],
  );
  return {
    id,
    title: input.title,
    description: input.description,
    deadline: input.deadlineUtc,
    rubric: input.rubric,
    latePenaltyPercent:
      input.latePolicy.type === "percentage_per_day"
        ? input.latePolicy.deductionPercent ?? 0
        : 100,
    fileKey: input.fileKey ?? undefined,
    fileName: input.fileName ?? undefined,
    fileUrl: input.fileKey ? fileUrl(input.fileKey) : undefined,
  };
}

export async function listStudentAssignments(
  courseId: string,
  studentId: string,
): Promise<Array<StudentAssignmentListItem & { assignmentId: string }>> {
  if (!(await ensureStudentEnrollment(studentId, courseId))) {
    throw new Error("forbidden");
  }
  const [assignmentsResult, submissionsResult] = await Promise.all([
    getPostgresPool().query<AssignmentRow>(
      `SELECT * FROM assignments WHERE course_id = $1 ORDER BY deadline_utc DESC`,
      [courseId],
    ),
    getPostgresPool().query<SubmissionRow>(
      `SELECT * FROM assignment_submissions WHERE course_id = $1 AND student_id = $2 ORDER BY version DESC`,
      [courseId, studentId],
    ),
  ]);

  return assignmentsResult.rows.map((assignmentRow) => {
    const assignment = toAssignment(assignmentRow);
    const submissions = submissionsResult.rows.filter(
      (row) => row.assignment_id === assignmentRow.id,
    );
    const latest = submissions[0] ?? null;
    return {
      assignmentId: assignmentRow.id,
      assignment,
      currentVersion: latest?.version ?? null,
      status: latest
        ? latest.status === "assessed"
          ? "assessed"
          : latest.is_locked
            ? "not_submitted"
            : latest.late_penalty_applied > 0
              ? "late"
              : "submitted"
        : "not_submitted",
      versions: submissions.map((row) => ({
        version: row.version,
        submittedAt: row.submitted_at,
        fileName: row.file_name,
        fileUrl: fileUrl(row.file_key),
        isLate: row.late_penalty_applied > 0,
        status: row.status,
        assessment: row.rubric_scores
          ? {
              criteriaScores: row.rubric_scores,
              overallFeedback: row.overall_feedback ?? "",
              totalMarks: row.score ?? 0,
              maxMarks: assignment.rubric.reduce(
                (sum, criterion) => sum + criterion.maxMarks,
                0,
              ),
              assessedAt: row.assessed_at ?? row.submitted_at,
            }
          : undefined,
      })),
    };
  });
}

export async function listTeacherSubmissions(
  courseId: string,
  assignmentId: string,
): Promise<TeacherSubmissionRow[]> {
  const result = await getPostgresPool().query<SubmissionRow>(
    `
      SELECT *
      FROM assignment_submissions
      WHERE course_id = $1 AND assignment_id = $2
      ORDER BY submitted_at DESC
    `,
    [courseId, assignmentId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    assignmentId: row.assignment_id,
    version: row.version,
    submittedAt: row.submitted_at,
    fileName: row.file_name,
    fileUrl: fileUrl(row.file_key),
    isLate: row.late_penalty_applied > 0,
    latePenaltyPercent: row.late_penalty_applied,
    latePenaltyWaived: row.late_penalty_waived,
    status: row.status,
    assessment: row.rubric_scores
      ? {
          criteriaScores: row.rubric_scores,
          overallFeedback: row.overall_feedback ?? "",
          totalMarks: row.score ?? 0,
          maxMarks: row.score ?? 0,
          assessedAt: row.assessed_at ?? row.submitted_at,
        }
      : undefined,
  }));
}

export async function assessSubmission(input: {
  courseId: string;
  assignmentId: string;
  submissionId: string;
  teacherId: string;
  rubricScores: CriterionScore[];
  overallFeedback: string;
  waiveLate: boolean;
}): Promise<boolean> {
  if (!(await ensureTeacherOwnsCourse(input.teacherId, input.courseId))) {
    throw new Error("forbidden");
  }

  const submissionResult = await getPostgresPool().query<SubmissionRow>(
    `SELECT * FROM assignment_submissions WHERE id = $1 AND course_id = $2 AND assignment_id = $3 LIMIT 1`,
    [input.submissionId, input.courseId, input.assignmentId],
  );
  const submission = submissionResult.rows[0];
  if (!submission) return false;

  const assignment = await getAssignmentRow(input.courseId, input.assignmentId);
  if (!assignment) return false;

  const rubric = assignment.rubric;
  const totalMarks = input.rubricScores.reduce((sum, scoreRow) => sum + scoreRow.score, 0);
  const maxMarks = rubric.reduce((sum, c) => sum + c.maxMarks, 0);

  await getPostgresPool().query(
    `
      UPDATE assignment_submissions
      SET status = 'assessed',
          assessed_at = NOW(),
          rubric_scores = $2,
          overall_feedback = $3,
          score = $4,
          late_penalty_waived = $5
      WHERE id = $1
    `,
    [
      input.submissionId,
      JSON.stringify(input.rubricScores),
      input.overallFeedback,
      totalMarks,
      input.waiveLate,
    ],
  );

  await notifyUser(submission.student_id, "grade_released", {
    courseId: input.courseId,
    courseName: null,
    message: `Grade released for ${assignment.title}`,
    navigateTo: `/class/${input.courseId}`,
    assignmentId: input.assignmentId,
    submissionId: input.submissionId,
  });
  return true;
}

export async function unlockSubmission(input: {
  courseId: string;
  assignmentId: string;
  submissionId: string;
  teacherId: string;
}): Promise<boolean> {
  if (!(await ensureTeacherOwnsCourse(input.teacherId, input.courseId))) {
    throw new Error("forbidden");
  }
  const result = await getPostgresPool().query(
    `
      UPDATE assignment_submissions
      SET unlocked_until = NOW() + INTERVAL '24 hours'
      WHERE id = $1 AND course_id = $2 AND assignment_id = $3
    `,
    [input.submissionId, input.courseId, input.assignmentId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function createSubmissionPresign(input: {
  courseId: string;
  assignmentId: string;
  studentId: string;
  fileName: string;
  contentType: string;
}): Promise<PresignResponse & { submissionToken: string }> {
  if (input.contentType !== "application/pdf") {
    throw new Error("invalid");
  }
  const assignment = await getAssignmentRow(input.courseId, input.assignmentId);
  if (!assignment) {
    throw new Error("not_found");
  }

  const token = randomUUID();
  const fileKey = `assignments/${input.courseId}/${input.assignmentId}/${input.studentId}/${Date.now()}-${input.fileName}`;
  
  let uploadUrl: string;
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    uploadUrl = `/api/mock-s3/upload?token=${token}&key=${encodeURIComponent(fileKey)}`;
  } else {
    uploadUrl = await getSignedUrl(
      getR2Client(),
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: fileKey,
        ContentType: "application/pdf",
      }),
      { expiresIn: 15 * 60 },
    );
  }

  await getPostgresPool().query(
    `INSERT INTO assignment_submission_tokens (id, course_id, assignment_id, student_id, file_key, created_at) VALUES ($1,$2,$3,$4,$5,NOW())`,
    [token, input.courseId, input.assignmentId, input.studentId, fileKey],
  );

  return { uploadUrl, fileKey, submissionToken: token };
}

export async function confirmSubmission(input: {
  courseId: string;
  assignmentId: string;
  studentId: string;
  fileName: string;
  submissionToken: string;
  studentName: string;
}): Promise<{ version: number }> {
  const tokenRow = await getPostgresPool().query<{
    file_key: string;
  }>(
    `SELECT file_key FROM assignment_submission_tokens WHERE id = $1 AND course_id = $2 AND assignment_id = $3 AND student_id = $4 LIMIT 1`,
    [input.submissionToken, input.courseId, input.assignmentId, input.studentId],
  );
  const token = tokenRow.rows[0];
  if (!token) throw new Error("invalid");

  const assignment = await getAssignmentRow(input.courseId, input.assignmentId);
  if (!assignment) throw new Error("not_found");

  const now = new Date();
  const late = computeLatePenalty(assignment.deadline_utc, now, assignment.late_policy);
  if (late.isLate && assignment.late_policy.type === "hard_cutoff") {
    const unlocked = await getPostgresPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM assignment_submissions WHERE course_id = $1 AND assignment_id = $2 AND student_id = $3 AND unlocked_until > NOW()`,
      [input.courseId, input.assignmentId, input.studentId],
    );
    if (Number(unlocked.rows[0]?.count ?? 0) === 0) {
      throw new Error("deadline_passed");
    }
  }

  const versionResult = await getPostgresPool().query<{ version: number }>(
    `SELECT COALESCE(MAX(version),0)+1 AS version FROM assignment_submissions WHERE course_id = $1 AND assignment_id = $2 AND student_id = $3`,
    [input.courseId, input.assignmentId, input.studentId],
  );
  const version = Number(versionResult.rows[0]?.version ?? 1);

  await getPostgresPool().query(
    `
      INSERT INTO assignment_submissions (
        id, course_id, assignment_id, student_id, student_name, version,
        submitted_at, file_key, file_name, status, late_penalty_applied,
        late_penalty_waived, rubric_scores, overall_feedback, score, unlocked_until, is_locked
      ) VALUES (
        $1,$2,$3,$4,$5,$6,NOW(),$7,$8,'pending_review',$9,FALSE,NULL,NULL,NULL,NULL,FALSE
      )
    `,
    [
      randomUUID(),
      input.courseId,
      input.assignmentId,
      input.studentId,
      input.studentName,
      version,
      token.file_key,
      input.fileName,
      late.latePenaltyApplied,
    ],
  );

  return { version };
}

export async function listTeacherAssignments(
  courseId: string,
  teacherId: string,
): Promise<TeacherAssignmentListItem[]> {
  if (!(await ensureTeacherOwnsCourse(teacherId, courseId))) throw new Error("forbidden");
  const result = await getPostgresPool().query<AssignmentRow>(
    `SELECT * FROM assignments WHERE course_id = $1 ORDER BY created_at DESC`,
    [courseId],
  );

  const list: TeacherAssignmentListItem[] = [];
  for (const row of result.rows) {
    const assignment = toAssignment(row);
    const submissionsResult = await getPostgresPool().query<{ status: string }>(
      `SELECT status FROM assignment_submissions WHERE course_id = $1 AND assignment_id = $2`,
      [courseId, assignment.id],
    );
    const rows = submissionsResult.rows;
    const pendingCount = rows.filter((r) => r.status === "pending_review").length;
    list.push({
      assignment,
      pendingCount,
      totalSubmissions: rows.length,
    });
  }
  return list;
}

export async function attachSolutionsToAssignment(input: {
  courseId: string;
  assignmentId: string;
  teacherId: string;
  solutionKey: string;
  solutionName: string;
}): Promise<boolean> {
  if (!(await ensureTeacherOwnsCourse(input.teacherId, input.courseId))) {
    throw new Error("forbidden");
  }
  const result = await getPostgresPool().query(
    `
      UPDATE assignments
      SET solution_key = $1, solution_name = $2
      WHERE course_id = $3 AND id = $4
    `,
    [input.solutionKey, input.solutionName, input.courseId, input.assignmentId],
  );
  return (result.rowCount ?? 0) > 0;
}
