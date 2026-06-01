import type { StudentCourse } from "@/types/course";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function getStudentCardSubtitle(
  course: StudentCourse,
): { type: "deadline"; dueAt: string; title: string } | { type: "content"; title: string } | null {
  if (course.nextDeadline) {
    const due = new Date(course.nextDeadline.dueAt).getTime();
    const now = Date.now();
    if (due >= now && due - now <= SEVEN_DAYS_MS) {
      return {
        type: "deadline",
        dueAt: course.nextDeadline.dueAt,
        title: course.nextDeadline.title,
      };
    }
  }

  if (course.recentContent) {
    return { type: "content", title: course.recentContent.title };
  }

  return null;
}

export function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
