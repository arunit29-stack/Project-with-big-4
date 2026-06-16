export type NotificationType =
  | "new_assignment_posted"
  | "quiz_starting_soon"
  | "new_content_uploaded"
  | "grade_released"
  | "course_announcement"
  | "peer_review_assigned"
  | "student_submitted_assignment"
  | "unassessed_submission_48h"
  | "quiz_question_flagged"
  | "group_inactivity_48h"
  | "course_ownership_transferred";

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  course_id: string | null;
  course_name: string | null;
  message: string;
  navigate_to: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  courseId: string | null;
  courseName: string | null;
  message: string;
  navigateTo: string | null;
  createdAt: string;
}

export interface NotificationEnvelope extends NotificationDTO {
  userId: string;
}
