"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAssignment = createAssignment;
exports.listStudentAssignments = listStudentAssignments;
exports.listTeacherSubmissions = listTeacherSubmissions;
exports.assessSubmission = assessSubmission;
exports.unlockSubmission = unlockSubmission;
exports.createSubmissionPresign = createSubmissionPresign;
exports.confirmSubmission = confirmSubmission;
exports.listTeacherAssignments = listTeacherAssignments;
exports.attachSolutionsToAssignment = attachSolutionsToAssignment;
const crypto_1 = require("crypto");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const postgres_1 = require("../db/postgres");
const r2_1 = require("../library/r2");
const service_1 = require("../notifications/service");
function toAssignment(row) {
    var _a, _b, _c, _d, _e;
    const latePenaltyPercent = row.late_policy.type === "percentage_per_day"
        ? (_a = row.late_policy.deductionPercent) !== null && _a !== void 0 ? _a : 0
        : 100;
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        deadline: row.deadline_utc,
        rubric: row.rubric,
        latePenaltyPercent,
        fileKey: (_b = row.file_key) !== null && _b !== void 0 ? _b : undefined,
        fileName: (_c = row.file_name) !== null && _c !== void 0 ? _c : undefined,
        fileUrl: row.file_key ? fileUrl(row.file_key) : undefined,
        solutionKey: (_d = row.solution_key) !== null && _d !== void 0 ? _d : undefined,
        solutionName: (_e = row.solution_name) !== null && _e !== void 0 ? _e : undefined,
        solutionUrl: row.solution_key ? fileUrl(row.solution_key) : undefined,
    };
}
function fileUrl(fileKey) {
    var _a;
    return `${(_a = process.env.NEXT_PUBLIC_API_URL) !== null && _a !== void 0 ? _a : ""}/api/mock-files/${fileKey}`;
}
function computeLatePenalty(deadlineUtc, submittedAt, latePolicy) {
    var _a;
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
        latePenaltyApplied: daysLate * ((_a = latePolicy.deductionPercent) !== null && _a !== void 0 ? _a : 0),
    };
}
async function getAssignmentRow(courseId, assignmentId) {
    var _a;
    const result = await (0, postgres_1.getPostgresPool)().query(`SELECT * FROM assignments WHERE course_id = $1 AND id = $2 LIMIT 1`, [courseId, assignmentId]);
    return (_a = result.rows[0]) !== null && _a !== void 0 ? _a : null;
}
async function ensureTeacherOwnsCourse(userId, courseId) {
    var _a, _b;
    const result = await (0, postgres_1.getPostgresPool)().query(`SELECT COUNT(*)::text AS count FROM teacher_courses WHERE teacher_id = $1 AND course_id = $2`, [userId, courseId]);
    return Number((_b = (_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0) > 0;
}
async function ensureStudentEnrollment(userId, courseId) {
    var _a, _b;
    const result = await (0, postgres_1.getPostgresPool)().query(`SELECT COUNT(*)::text AS count FROM course_enrollments WHERE user_id = $1 AND course_id = $2`, [userId, courseId]);
    return Number((_b = (_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0) > 0;
}
async function createAssignment(input) {
    var _a, _b, _c, _d, _e;
    if (!(await ensureTeacherOwnsCourse(input.teacherId, input.courseId))) {
        throw new Error("forbidden");
    }
    const id = (0, crypto_1.randomUUID)();
    await (0, postgres_1.getPostgresPool)().query(`
      INSERT INTO assignments (
        id, course_id, title, description, deadline_utc, rubric, late_policy, created_by, file_key, file_name
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [
        id,
        input.courseId,
        input.title,
        input.description,
        input.deadlineUtc,
        JSON.stringify(input.rubric),
        JSON.stringify(input.latePolicy),
        input.teacherId,
        (_a = input.fileKey) !== null && _a !== void 0 ? _a : null,
        (_b = input.fileName) !== null && _b !== void 0 ? _b : null,
    ]);
    return {
        id,
        title: input.title,
        description: input.description,
        deadline: input.deadlineUtc,
        rubric: input.rubric,
        latePenaltyPercent: input.latePolicy.type === "percentage_per_day"
            ? (_c = input.latePolicy.deductionPercent) !== null && _c !== void 0 ? _c : 0
            : 100,
        fileKey: (_d = input.fileKey) !== null && _d !== void 0 ? _d : undefined,
        fileName: (_e = input.fileName) !== null && _e !== void 0 ? _e : undefined,
        fileUrl: input.fileKey ? fileUrl(input.fileKey) : undefined,
    };
}
async function listStudentAssignments(courseId, studentId) {
    if (!(await ensureStudentEnrollment(studentId, courseId))) {
        throw new Error("forbidden");
    }
    const [assignmentsResult, submissionsResult] = await Promise.all([
        (0, postgres_1.getPostgresPool)().query(`SELECT * FROM assignments WHERE course_id = $1 ORDER BY deadline_utc DESC`, [courseId]),
        (0, postgres_1.getPostgresPool)().query(`SELECT * FROM assignment_submissions WHERE course_id = $1 AND student_id = $2 ORDER BY version DESC`, [courseId, studentId]),
    ]);
    return assignmentsResult.rows.map((assignmentRow) => {
        var _a, _b;
        const assignment = toAssignment(assignmentRow);
        const submissions = submissionsResult.rows.filter((row) => row.assignment_id === assignmentRow.id);
        const latest = (_a = submissions[0]) !== null && _a !== void 0 ? _a : null;
        return {
            assignmentId: assignmentRow.id,
            assignment,
            currentVersion: (_b = latest === null || latest === void 0 ? void 0 : latest.version) !== null && _b !== void 0 ? _b : null,
            status: latest
                ? latest.status === "assessed"
                    ? "assessed"
                    : latest.is_locked
                        ? "not_submitted"
                        : latest.late_penalty_applied > 0
                            ? "late"
                            : "submitted"
                : "not_submitted",
            versions: submissions.map((row) => {
                var _a, _b, _c;
                return ({
                    version: row.version,
                    submittedAt: row.submitted_at,
                    fileName: row.file_name,
                    fileUrl: fileUrl(row.file_key),
                    isLate: row.late_penalty_applied > 0,
                    status: row.status,
                    assessment: row.rubric_scores
                        ? {
                            criteriaScores: row.rubric_scores,
                            overallFeedback: (_a = row.overall_feedback) !== null && _a !== void 0 ? _a : "",
                            totalMarks: (_b = row.score) !== null && _b !== void 0 ? _b : 0,
                            maxMarks: assignment.rubric.reduce((sum, criterion) => sum + criterion.maxMarks, 0),
                            assessedAt: (_c = row.assessed_at) !== null && _c !== void 0 ? _c : row.submitted_at,
                        }
                        : undefined,
                });
            }),
        };
    });
}
async function listTeacherSubmissions(courseId, assignmentId) {
    const result = await (0, postgres_1.getPostgresPool)().query(`
      SELECT *
      FROM assignment_submissions
      WHERE course_id = $1 AND assignment_id = $2
      ORDER BY submitted_at DESC
    `, [courseId, assignmentId]);
    return result.rows.map((row) => {
        var _a, _b, _c, _d;
        return ({
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
                    overallFeedback: (_a = row.overall_feedback) !== null && _a !== void 0 ? _a : "",
                    totalMarks: (_b = row.score) !== null && _b !== void 0 ? _b : 0,
                    maxMarks: (_c = row.score) !== null && _c !== void 0 ? _c : 0,
                    assessedAt: (_d = row.assessed_at) !== null && _d !== void 0 ? _d : row.submitted_at,
                }
                : undefined,
        });
    });
}
async function assessSubmission(input) {
    if (!(await ensureTeacherOwnsCourse(input.teacherId, input.courseId))) {
        throw new Error("forbidden");
    }
    const submissionResult = await (0, postgres_1.getPostgresPool)().query(`SELECT * FROM assignment_submissions WHERE id = $1 AND course_id = $2 AND assignment_id = $3 LIMIT 1`, [input.submissionId, input.courseId, input.assignmentId]);
    const submission = submissionResult.rows[0];
    if (!submission)
        return false;
    const assignment = await getAssignmentRow(input.courseId, input.assignmentId);
    if (!assignment)
        return false;
    const rubric = assignment.rubric;
    const totalMarks = input.rubricScores.reduce((sum, scoreRow) => sum + scoreRow.score, 0);
    const maxMarks = rubric.reduce((sum, c) => sum + c.maxMarks, 0);
    await (0, postgres_1.getPostgresPool)().query(`
      UPDATE assignment_submissions
      SET status = 'assessed',
          assessed_at = NOW(),
          rubric_scores = $2,
          overall_feedback = $3,
          score = $4,
          late_penalty_waived = $5
      WHERE id = $1
    `, [
        input.submissionId,
        JSON.stringify(input.rubricScores),
        input.overallFeedback,
        totalMarks,
        input.waiveLate,
    ]);
    await (0, service_1.notifyUser)(submission.student_id, "grade_released", {
        courseId: input.courseId,
        courseName: null,
        message: `Grade released for ${assignment.title}`,
        navigateTo: `/class/${input.courseId}`,
        assignmentId: input.assignmentId,
        submissionId: input.submissionId,
    });
    return true;
}
async function unlockSubmission(input) {
    var _a;
    if (!(await ensureTeacherOwnsCourse(input.teacherId, input.courseId))) {
        throw new Error("forbidden");
    }
    const result = await (0, postgres_1.getPostgresPool)().query(`
      UPDATE assignment_submissions
      SET unlocked_until = NOW() + INTERVAL '24 hours'
      WHERE id = $1 AND course_id = $2 AND assignment_id = $3
    `, [input.submissionId, input.courseId, input.assignmentId]);
    return ((_a = result.rowCount) !== null && _a !== void 0 ? _a : 0) > 0;
}
async function createSubmissionPresign(input) {
    if (input.contentType !== "application/pdf") {
        throw new Error("invalid");
    }
    const assignment = await getAssignmentRow(input.courseId, input.assignmentId);
    if (!assignment) {
        throw new Error("not_found");
    }
    const token = (0, crypto_1.randomUUID)();
    const fileKey = `assignments/${input.courseId}/${input.assignmentId}/${input.studentId}/${Date.now()}-${input.fileName}`;
    const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)((0, r2_1.getR2Client)(), new client_s3_1.PutObjectCommand({
        Bucket: (0, r2_1.getR2Bucket)(),
        Key: fileKey,
        ContentType: "application/pdf",
    }), { expiresIn: 15 * 60 });
    await (0, postgres_1.getPostgresPool)().query(`INSERT INTO assignment_submission_tokens (id, course_id, assignment_id, student_id, file_key, created_at) VALUES ($1,$2,$3,$4,$5,NOW())`, [token, input.courseId, input.assignmentId, input.studentId, fileKey]);
    return { uploadUrl, fileKey, submissionToken: token };
}
async function confirmSubmission(input) {
    var _a, _b, _c, _d;
    const tokenRow = await (0, postgres_1.getPostgresPool)().query(`SELECT file_key FROM assignment_submission_tokens WHERE id = $1 AND course_id = $2 AND assignment_id = $3 AND student_id = $4 LIMIT 1`, [input.submissionToken, input.courseId, input.assignmentId, input.studentId]);
    const token = tokenRow.rows[0];
    if (!token)
        throw new Error("invalid");
    const assignment = await getAssignmentRow(input.courseId, input.assignmentId);
    if (!assignment)
        throw new Error("not_found");
    const now = new Date();
    const late = computeLatePenalty(assignment.deadline_utc, now, assignment.late_policy);
    if (late.isLate && assignment.late_policy.type === "hard_cutoff") {
        const unlocked = await (0, postgres_1.getPostgresPool)().query(`SELECT COUNT(*)::text AS count FROM assignment_submissions WHERE course_id = $1 AND assignment_id = $2 AND student_id = $3 AND unlocked_until > NOW()`, [input.courseId, input.assignmentId, input.studentId]);
        if (Number((_b = (_a = unlocked.rows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0) === 0) {
            throw new Error("deadline_passed");
        }
    }
    const versionResult = await (0, postgres_1.getPostgresPool)().query(`SELECT COALESCE(MAX(version),0)+1 AS version FROM assignment_submissions WHERE course_id = $1 AND assignment_id = $2 AND student_id = $3`, [input.courseId, input.assignmentId, input.studentId]);
    const version = Number((_d = (_c = versionResult.rows[0]) === null || _c === void 0 ? void 0 : _c.version) !== null && _d !== void 0 ? _d : 1);
    await (0, postgres_1.getPostgresPool)().query(`
      INSERT INTO assignment_submissions (
        id, course_id, assignment_id, student_id, student_name, version,
        submitted_at, file_key, file_name, status, late_penalty_applied,
        late_penalty_waived, rubric_scores, overall_feedback, score, unlocked_until, is_locked
      ) VALUES (
        $1,$2,$3,$4,$5,$6,NOW(),$7,$8,'pending_review',$9,FALSE,NULL,NULL,NULL,NULL,FALSE
      )
    `, [
        (0, crypto_1.randomUUID)(),
        input.courseId,
        input.assignmentId,
        input.studentId,
        input.studentName,
        version,
        token.file_key,
        input.fileName,
        late.latePenaltyApplied,
    ]);
    return { version };
}
async function listTeacherAssignments(courseId, teacherId) {
    if (!(await ensureTeacherOwnsCourse(teacherId, courseId)))
        throw new Error("forbidden");
    const result = await (0, postgres_1.getPostgresPool)().query(`SELECT * FROM assignments WHERE course_id = $1 ORDER BY created_at DESC`, [courseId]);
    return result.rows.map(toAssignment);
}
async function attachSolutionsToAssignment(input) {
    var _a;
    if (!(await ensureTeacherOwnsCourse(input.teacherId, input.courseId))) {
        throw new Error("forbidden");
    }
    const result = await (0, postgres_1.getPostgresPool)().query(`
      UPDATE assignments
      SET solution_key = $1, solution_name = $2
      WHERE course_id = $3 AND id = $4
    `, [input.solutionKey, input.solutionName, input.courseId, input.assignmentId]);
    return ((_a = result.rowCount) !== null && _a !== void 0 ? _a : 0) > 0;
}
