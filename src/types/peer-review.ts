/**
 * Peer Review Types - Double-blind peer grading system
 */

/**
 * Peer review configuration (per assignment)
 */
export interface PeerReviewConfig {
  id: string;
  assignmentId: string;
  reviewersPerSubmission: number;
  rubric: ReviewCriterion[];
  reviewDeadlineUtc: string; // ISO 8601
  gradeContributionPercent: number; // 0-100
  outlierZScoreThreshold: number; // e.g., 2.0
  createdAt: string;
  updatedAt: string;
}

/**
 * Rubric criterion (part of config)
 */
export interface ReviewCriterion {
  criterion: string; // e.g., "Clarity"
  descriptor: string; // e.g., "Code is well-structured and commented"
  maxMarks: number; // e.g., 10
}

/**
 * Configure peer review request
 */
export interface ConfigurePeerReviewRequest {
  reviewersPerSubmission?: number;
  rubric: ReviewCriterion[];
  reviewDeadlineUtc: string;
  gradeContributionPercent?: number;
  outlierZScoreThreshold?: number;
}

/**
 * Peer review assignment (reviewer → submission)
 * CRITICAL: reviewer_id NEVER returned to students
 */
export interface PeerReviewAssignment {
  id: string;
  assignmentId: string;
  reviewerId: string; // HIDDEN from students
  submitterId: string; // HIDDEN from students
  submissionId: string;
  reviewToken: string; // OPAQUE, unrecoverable token
  status: "pending" | "submitted" | "discarded";
  createdAt: string;
  updatedAt: string;
}

/**
 * Review token (server-side only, maps token to reviewer)
 */
export interface ReviewToken {
  token: string;
  assignmentId: string;
  reviewerId: string; // NEVER exposed to students
  submitterId: string; // NEVER exposed to students
  createdAt: string;
}

/**
 * Individual review score
 */
export interface PeerReviewScore {
  id: string;
  assignmentId: string;
  submissionId: string;
  reviewToken: string; // Not reviewer_id
  criterion: string;
  score: number;
  justification: string;
  isOverridden: boolean;
  overriddenScore?: number;
  zScore?: number; // Calculated after submission
  isOutlier?: boolean; // |zScore| > threshold
  createdAt: string;
  updatedAt: string;
}

/**
 * Submit review request
 */
export interface SubmitPeerReviewRequest {
  scores: {
    criterion: string;
    score: number;
    justification: string;
  }[];
}

/**
 * Override outlier score
 */
export interface OverrideOutlierScoreRequest {
  newScore: number; // Must be within maxMarks
}

/**
 * Discard all scores from reviewer
 */
export interface DiscardReviewerRequest {
  reason: string; // For audit trail
}

/**
 * Outlier detection result
 */
export interface OutlierDetection {
  reviewToken: string;
  submissionId: string;
  criterion: string;
  score: number;
  mean: number;
  stdDev: number;
  zScore: number;
  isOutlier: boolean;
  threshold: number;
}

/**
 * Per-submission review results (teacher view)
 */
export interface SubmissionReviewResults {
  submissionId: string;
  submitterId: string;
  submitterName: string;
  reviewCount: number;
  reviewsReceived: ReviewSummaryPerCriterion[];
  outlierFlags: OutlierFlag[];
  discardedReviewers: string[]; // count of discarded
  peerScore: number; // Average across criteria
  peerGradeContribution: number; // peer score × gradeContributionPercent
  teacherRubricScore: number; // Teacher's own grading
  finalGradeContribution: number; // Total from peer + teacher
  finalGrade: number; // 0-100 scale
  auditTrail: AuditLogEntry[];
}

/**
 * Summary per criterion (for teacher report)
 */
export interface ReviewSummaryPerCriterion {
  criterion: string;
  maxMarks: number;
  scores: ReviewScoreDetail[];
  mean: number;
  stdDev: number;
  finalScore: number; // After outlier exclusion & overrides
}

/**
 * Individual score detail in summary
 */
export interface ReviewScoreDetail {
  reviewToken: string;
  score: number;
  overriddenScore?: number;
  justification: string;
  zScore: number;
  isOutlier: boolean;
  isDiscarded: boolean;
}

/**
 * Outlier flag (for teacher notification)
 */
export interface OutlierFlag {
  id: string;
  reviewToken: string;
  submissionId: string;
  criterion: string;
  score: number;
  zScore: number;
  threshold: number;
  createdAt: string;
  resolvedAt?: string;
  resolutionAction?: "overridden" | "discarded";
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  assignmentId: string;
  action: string; // "score_submitted", "outlier_flagged", "score_overridden", "reviewer_discarded"
  reviewToken: string;
  submissionId: string;
  details: Record<string, unknown>;
  createdAt: string;
  createdBy?: string; // For teacher actions
}

/**
 * Assignment results (all submissions in assignment)
 */
export interface AssignmentReviewResults {
  assignmentId: string;
  submissionResults: SubmissionReviewResults[];
  reviewStats: {
    totalSubmissions: number;
    totalReviewsAssigned: number;
    reviewsCompleted: number;
    reviewsOutstanding: number;
    outlierCount: number;
  };
}

/**
 * Reviewer dashboard (from reviewer perspective)
 * CRITICAL: No reviewer identity information exposed
 */
export interface ReviewerDashboard {
  reviewToken: string;
  assignmentId: string;
  assignmentTitle: string;
  rubric: ReviewCriterion[];
  reviewDeadline: string;
  submissionToReview: {
    submissionId: string;
    // NEVER include submitter name or ID
    content: string; // Submission content (file URL, text, etc.)
  };
  alreadySubmitted: boolean;
  submittedAt?: string;
}
