import type {
  Assessment,
  Assignment,
  StudentAssignmentListItem,
  SubmissionVersion,
  TeacherAssignmentListItem,
  TeacherSubmissionRow,
} from "@/types/assignment";

const assignmentsByCourse = new Map<string, Assignment[]>();
const studentSubmissions = new Map<string, SubmissionVersion[]>();
const teacherRows = new Map<string, TeacherSubmissionRow[]>();
const uploadBuffers = new Map<string, Buffer>();

function studentKey(courseId: string, userId: string, assignmentId: string) {
  return `${courseId}:${userId}:${assignmentId}`;
}

function teacherKey(courseId: string, assignmentId: string) {
  return `${courseId}:${assignmentId}`;
}

function defaultAssignments(): Assignment[] {
  const future = new Date();
  future.setDate(future.getDate() + 14);

  const past = new Date();
  past.setDate(past.getDate() - 3);

  return [
    {
      id: "asn-lab-1",
      title: "Lab report 1",
      description:
        "Submit a PDF report covering the cell observation lab. Include labelled diagrams and a short discussion.",
      deadline: future.toISOString(),
      latePenaltyPercent: 10,
      rubric: [
        {
          id: "c1",
          title: "Methodology",
          descriptor: "Clear description of methods and materials used.",
          maxMarks: 25,
        },
        {
          id: "c2",
          title: "Analysis",
          descriptor: "Accurate interpretation of observations with supporting evidence.",
          maxMarks: 50,
        },
        {
          id: "c3",
          title: "Presentation",
          descriptor: "Well-structured PDF with correct citations and formatting.",
          maxMarks: 25,
        },
      ],
    },
    {
      id: "asn-essay-1",
      title: "Essay: DNA replication",
      description:
        "Write a 1500-word essay on the mechanisms of DNA replication. PDF submission only.",
      deadline: past.toISOString(),
      latePenaltyPercent: 15,
      rubric: [
        {
          id: "c1",
          title: "Content accuracy",
          descriptor: "Demonstrates correct understanding of replication processes.",
          maxMarks: 60,
        },
        {
          id: "c2",
          title: "Argument & structure",
          descriptor: "Logical flow with introduction, body, and conclusion.",
          maxMarks: 40,
        },
      ],
    },
  ];
}

function ensureCourse(courseId: string) {
  if (!assignmentsByCourse.has(courseId)) {
    assignmentsByCourse.set(courseId, defaultAssignments());
    seedTeacherSubmissions(courseId);
    seedStudentSubmission(courseId, "u-student-1");
  }
}

function seedStudentSubmission(courseId: string, userId: string) {
  const key = studentKey(courseId, userId, "asn-lab-1");
  studentSubmissions.set(key, [
    {
      version: 1,
      submittedAt: new Date(Date.now() - 86400000).toISOString(),
      fileName: "lab-report-v1.pdf",
      fileUrl: "/api/mock-files/sample.pdf",
      isLate: false,
      status: "pending_review",
    },
  ]);
}

function seedTeacherSubmissions(courseId: string) {
  const rows: TeacherSubmissionRow[] = [
    {
      id: "sub-1",
      studentId: "u-student-1",
      studentName: "Alex Student",
      assignmentId: "asn-lab-1",
      version: 1,
      submittedAt: new Date(Date.now() - 86400000).toISOString(),
      fileName: "lab-report-v1.pdf",
      fileUrl: "/api/mock-files/sample.pdf",
      isLate: false,
      latePenaltyPercent: 10,
      latePenaltyWaived: false,
      status: "pending_review",
    },
    {
      id: "sub-2",
      studentId: "u-student-2",
      studentName: "Jordan Lee",
      assignmentId: "asn-lab-1",
      version: 1,
      submittedAt: new Date(Date.now() - 3600000).toISOString(),
      fileName: "lab-report-jordan.pdf",
      fileUrl: "/api/mock-files/sample.pdf",
      isLate: true,
      latePenaltyPercent: 10,
      latePenaltyWaived: false,
      status: "pending_review",
    },
    {
      id: "sub-3",
      studentId: "u-student-3",
      studentName: "Sam Rivera",
      assignmentId: "asn-essay-1",
      version: 2,
      submittedAt: new Date(Date.now() - 172800000).toISOString(),
      fileName: "dna-essay-v2.pdf",
      fileUrl: "/api/mock-files/sample.pdf",
      isLate: true,
      latePenaltyPercent: 15,
      latePenaltyWaived: false,
      status: "assessed",
      assessment: {
        criteriaScores: [
          { criterionId: "c1", score: 52, comment: "Strong content." },
          { criterionId: "c2", score: 30, comment: "Good structure." },
        ],
        overallFeedback: "Well done overall.",
        totalMarks: 82,
        maxMarks: 100,
        assessedAt: new Date().toISOString(),
      },
    },
  ];
  teacherRows.set(teacherKey(courseId, "asn-lab-1"), rows.filter((r) => r.assignmentId === "asn-lab-1"));
  teacherRows.set(teacherKey(courseId, "asn-essay-1"), rows.filter((r) => r.assignmentId === "asn-essay-1"));
}

export function parseUserId(auth: string | null): string {
  if (!auth?.startsWith("Bearer ")) return "anonymous";
  const token = auth.slice(7);
  try {
    if (token.startsWith("cbb.mock.")) {
      const payload = token.slice("cbb.mock.".length);
      const json = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as { sub?: string };
      return json.sub ?? "user-unknown";
    }
  } catch {
    /* ignore */
  }
  return "user-unknown";
}

function deriveStudentStatus(
  assignment: Assignment,
  versions: SubmissionVersion[],
): StudentAssignmentListItem["status"] {
  if (versions.length === 0) return "not_submitted";
  const latest = versions[versions.length - 1];
  if (latest.status === "assessed") return "assessed";
  if (latest.isLate) return "late";
  if (latest.status === "pending_review") return "pending_review";
  return "submitted";
}

export function getStudentAssignments(
  courseId: string,
  userId: string,
): StudentAssignmentListItem[] {
  ensureCourse(courseId);
  return (assignmentsByCourse.get(courseId) ?? []).map((assignment) => {
    const versions =
      studentSubmissions.get(
        studentKey(courseId, userId, assignment.id),
      ) ?? [];
    return {
      assignment,
      status: deriveStudentStatus(assignment, versions),
      currentVersion: versions.length ? versions[versions.length - 1].version : null,
      versions: [...versions],
    };
  });
}

export function getStudentAssignment(
  courseId: string,
  userId: string,
  assignmentId: string,
): StudentAssignmentListItem | null {
  return (
    getStudentAssignments(courseId, userId).find(
      (a) => a.assignment.id === assignmentId,
    ) ?? null
  );
}

export function getTeacherAssignments(
  courseId: string,
): TeacherAssignmentListItem[] {
  ensureCourse(courseId);
  return (assignmentsByCourse.get(courseId) ?? []).map((assignment) => {
    const rows = teacherRows.get(teacherKey(courseId, assignment.id)) ?? [];
    const pendingCount = rows.filter((r) => r.status === "pending_review").length;
    return {
      assignment,
      pendingCount,
      totalSubmissions: rows.length,
    };
  });
}

export function getTeacherUnassessedCount(courseId: string): number {
  ensureCourse(courseId);
  let count = 0;
  for (const a of assignmentsByCourse.get(courseId) ?? []) {
    const rows = teacherRows.get(teacherKey(courseId, a.id)) ?? [];
    count += rows.filter((r) => r.status === "pending_review").length;
  }
  return count;
}

export function getTeacherSubmissions(
  courseId: string,
  assignmentId: string,
  pendingOnly: boolean,
): TeacherSubmissionRow[] {
  ensureCourse(courseId);
  let rows = [...(teacherRows.get(teacherKey(courseId, assignmentId)) ?? [])];
  if (pendingOnly) {
    rows = rows.filter((r) => r.status === "pending_review");
  }
  return rows;
}

export function createPresign(fileKey: string): { uploadUrl: string; token: string } {
  const token = `upload-${Date.now()}`;
  uploadBuffers.set(token, Buffer.alloc(0));
  return {
    uploadUrl: `/api/mock-s3/upload?token=${token}&key=${encodeURIComponent(fileKey)}`,
    token,
  };
}

export function storeUploadChunk(token: string, data: Buffer): void {
  const prev = uploadBuffers.get(token) ?? Buffer.alloc(0);
  uploadBuffers.set(token, Buffer.concat([prev, data]));
}

export function confirmStudentSubmission(
  courseId: string,
  userId: string,
  assignmentId: string,
  fileName: string,
  uploadToken: string,
  studentName: string,
): SubmissionVersion {
  ensureCourse(courseId);
  const assignment = assignmentsByCourse
    .get(courseId)!
    .find((a) => a.id === assignmentId)!;
  const key = studentKey(courseId, userId, assignmentId);
  const existing = studentSubmissions.get(key) ?? [];
  const isLate = Date.now() > new Date(assignment.deadline).getTime();
  const version: SubmissionVersion = {
    version: existing.length + 1,
    submittedAt: new Date().toISOString(),
    fileName,
    fileUrl: `/api/mock-files/${uploadToken}.pdf`,
    isLate,
    status: "pending_review",
  };
  studentSubmissions.set(key, [...existing, version]);
  uploadBuffers.delete(uploadToken);

  const rows = teacherRows.get(teacherKey(courseId, assignmentId)) ?? [];
  rows.push({
    id: `sub-${Date.now()}`,
    studentId: userId,
    studentName,
    assignmentId,
    version: version.version,
    submittedAt: version.submittedAt,
    fileName,
    fileUrl: version.fileUrl,
    isLate,
    latePenaltyPercent: assignment.latePenaltyPercent,
    latePenaltyWaived: false,
    status: "pending_review",
  });
  teacherRows.set(teacherKey(courseId, assignmentId), rows);

  return version;
}

export function assessSubmission(
  courseId: string,
  assignmentId: string,
  submissionId: string,
  assessment: Assessment,
  waiveLatePenalty: boolean,
): void {
  const rows = teacherRows.get(teacherKey(courseId, assignmentId)) ?? [];
  const row = rows.find((r) => r.id === submissionId);
  if (!row) return;
  row.status = "assessed";
  row.assessment = assessment;
  row.latePenaltyWaived = waiveLatePenalty;
  teacherRows.set(teacherKey(courseId, assignmentId), rows);

  const key = studentKey(courseId, row.studentId, assignmentId);
  const versions = studentSubmissions.get(key) ?? [];
  const v = versions.find((ver) => ver.version === row.version);
  if (v) {
    v.status = "assessed";
    v.assessment = assessment;
  }
}

export function getAssignment(
  courseId: string,
  assignmentId: string,
): Assignment | null {
  ensureCourse(courseId);
  return (
    assignmentsByCourse
      .get(courseId)
      ?.find((a) => a.id === assignmentId) ?? null
  );
}
