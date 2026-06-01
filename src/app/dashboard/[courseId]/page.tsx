"use client";

import { withAuth } from "@/components/auth/withAuth";
import { withRole } from "@/components/auth/withRole";
import { CourseViewShell } from "@/components/course-shell/CourseViewShell";
import { use } from "react";

function TeacherCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  return (
    <CourseViewShell
      courseId={courseId}
      basePath="dashboard"
      role="teacher"
    />
  );
}

export default withAuth(withRole(["teacher"], TeacherCoursePage));
