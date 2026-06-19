export interface RubricCriterion {
  id: string;
  title: string;
  descriptor: string;
  maxMarks: number;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  deadline: string;
  rubric: RubricCriterion[];
  latePenaltyPercent: number;
  fileKey?: string;
  fileName?: string;
  fileUrl?: string;
  solutionKey?: string;
  solutionName?: string;
  solutionUrl?: string;
}

export type StudentSubmissionStatus =
  | "not_submitted"
  | "submitted"
  | "late"
  | "pending_review"
  | "assessed";

export interface CriterionScore {
  criterionId: string;
  score: number;
  comment: string;
}

export interface Assessment {
  criteriaScores: CriterionScore[];
  overallFeedback: string;
  totalMarks: number;
  maxMarks: number;
  assessedAt: string;
}

export interface SubmissionVersion {
  version: number;
  submittedAt: string;
  fileName: string;
  fileUrl: string;
  isLate: boolean;
  status: "pending_review" | "assessed";
  assessment?: Assessment;
}

export interface StudentAssignmentListItem {
  assignment: Assignment;
  status: StudentSubmissionStatus;
  currentVersion: number | null;
  versions: SubmissionVersion[];
}

export interface TeacherAssignmentListItem {
  assignment: Assignment;
  pendingCount: number;
  totalSubmissions: number;
}

export interface TeacherSubmissionRow {
  id: string;
  studentId: string;
  studentName: string;
  assignmentId: string;
  version: number;
  submittedAt: string;
  fileName: string;
  fileUrl: string;
  isLate: boolean;
  latePenaltyPercent: number;
  latePenaltyWaived: boolean;
  status: "pending_review" | "assessed";
  assessment?: Assessment;
}

export interface PresignResponse {
  uploadUrl: string;
  fileKey: string;
  submissionToken: string;
}
