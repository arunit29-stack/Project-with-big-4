/**
 * Admin Dashboard Types
 */

/**
 * Admin user (institution-level superuser)
 */
export interface AdminUser {
  id: string;
  institutionId: string;
  email: string;
  name: string;
  role: "admin";
  createdAt: string;
}

/**
 * Bulk enrol request
 */
export interface BulkEnrolRequest {
  csv: string; // CSV file content: email,role,courseCode
}

/**
 * Bulk enrol row
 */
export interface BulkEnrolRow {
  email: string;
  role: "teacher" | "student";
  courseCode: string;
}

/**
 * Bulk enrol response
 */
export interface BulkEnrolResponse {
  success: number;
  failed: Array<{
    row: number;
    email?: string;
    reason: string;
  }>;
}

/**
 * Create user request
 */
export interface CreateUserRequest {
  email: string;
  name: string;
  role: "teacher" | "student";
}

/**
 * Create user response
 */
export interface CreateUserResponse {
  userId: string;
  email: string;
  tempPassword: string;
}

/**
 * Reset password request
 */
export interface ResetPasswordRequest {
  // Empty body, generates temp password
}

/**
 * Reset password response
 */
export interface ResetPasswordResponse {
  email: string;
  tempPassword: string;
}

/**
 * Course transfer request
 */
export interface CourseTransferRequest {
  newTeacherUserId: string;
}

/**
 * Course transfer response
 */
export interface CourseTransferResponse {
  courseId: string;
  oldTeacherId: string;
  newTeacherId: string;
  assetsTransferred: {
    assignments: number;
    quizzes: number;
    groupRooms: number;
    videoLibraryItems: number;
    dmThreads: number;
  };
}

/**
 * Grades export record
 */
export interface GradesExportRecord {
  studentEmail: string;
  studentName: string;
  courseCode: string;
  courseName: string;
  assignmentTitle: string;
  assignmentGrade: number;
  quizXP: number;
}

/**
 * GDPR purge request
 */
export interface GDPRPurgeRequest {
  // Empty body, requires admin auth and userId in path
}

/**
 * GDPR purge response
 */
export interface GDPRPurgeResponse {
  userId: string;
  tablesAffected: string[];
  recordsAnonymised: number;
  filesDeleted: number;
  vectorEmbeddingsRemoved: number;
  purgeId: string; // Audit log reference
  purgedAt: string;
}

/**
 * GDPR purge audit log
 */
export interface GDPRPurgeAuditLog {
  id: string;
  adminId: string;
  userId: string;
  institutionId: string;
  action: "full_pii_purge";
  tablesAffected: string[];
  recordsAnonymised: number;
  filesDeleted: number;
  vectorEmbeddingsRemoved: number;
  reason?: string;
  createdAt: string;
  // Immutable record - never updated
}

/**
 * Institution settings
 */
export interface InstitutionSettings {
  id: string;
  institutionId: string;
  ssoEnabled: boolean;
  ssoOAuth2ClientId?: string;
  ssoDiscoveryUrl?: string;
  institutionName: string;
  logoUrl?: string;
  customDomain?: string;
  features: {
    peerReview: boolean;
    groupRooms: boolean;
    aiQuizGeneration: boolean;
    liveSession: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Update institution settings request
 */
export interface UpdateInstitutionSettingsRequest {
  institutionName?: string;
  logoUrl?: string;
  ssoEnabled?: boolean;
  ssoOAuth2ClientId?: string;
  ssoDiscoveryUrl?: string;
  customDomain?: string;
  features?: {
    peerReview?: boolean;
    groupRooms?: boolean;
    aiQuizGeneration?: boolean;
    liveSession?: boolean;
  };
}

/**
 * User deletion event (for audit trail)
 */
export interface UserDeletionEvent {
  id: string;
  userId: string;
  deletedBy: string; // admin ID
  deletedAt: string;
  reason?: string;
  cascadeResults: {
    enrollmentsRemoved: number;
    sessionsInvalidated: number;
  };
}

/**
 * Course transfer audit
 */
export interface CourseTransferAudit {
  id: string;
  courseId: string;
  oldTeacherId: string;
  newTeacherId: string;
  transferredBy: string; // admin ID
  transferredAt: string;
  assetsTransferred: {
    assignments: number;
    quizzes: number;
    groupRooms: number;
    videoLibraryItems: number;
    dmThreads: number;
  };
}
