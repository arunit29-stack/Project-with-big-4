export interface CourseDeadline {
  title: string;
  dueAt: string;
}

export interface CourseRecentContent {
  title: string;
  addedAt: string;
}

export interface StudentCourse {
  id: string;
  name: string;
  teacherName: string;
  code: string;
  nextDeadline: CourseDeadline | null;
  recentContent: CourseRecentContent | null;
}

export interface TeacherCourse {
  id: string;
  name: string;
  code: string;
  description: string;
  enrolmentOpen: boolean;
  studentCount: number;
  pendingSubmissions: number;
  hasUpcomingQuiz: boolean;
}

export interface CourseDetail {
  id: string;
  name: string;
  code: string;
  description: string;
  role: "student" | "teacher";
}

export type CourseTabId =
  | "content-library"
  | "assignments"
  | "quizzes"
  | "live-session"
  | "group-rooms"
  | "ai-assistant";

export const COURSE_TAB_IDS: CourseTabId[] = [
  "content-library",
  "assignments",
  "quizzes",
  "live-session",
  "group-rooms",
  "ai-assistant",
];

export const PHASE2_TABS: CourseTabId[] = ["ai-assistant"];
