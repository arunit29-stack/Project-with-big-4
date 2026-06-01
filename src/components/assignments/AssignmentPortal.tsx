"use client";

import { StudentAssignmentDetail } from "@/components/assignments/StudentAssignmentDetail";
import { StudentAssignmentList } from "@/components/assignments/StudentAssignmentList";
import { TeacherAssignmentList } from "@/components/assignments/TeacherAssignmentList";
import { TeacherSubmissionInbox } from "@/components/assignments/TeacherSubmissionInbox";
import { useAuth } from "@/contexts/AuthContext";
import { authFetcher } from "@/lib/api/fetcher";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Assignment } from "@/types/assignment";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import useSWR from "swr";

interface AssignmentPortalProps {
  courseId: string;
  role: "student" | "teacher";
  basePath: "class" | "dashboard";
}

function AssignmentPortalInner({
  courseId,
  role,
  basePath,
}: AssignmentPortalProps) {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("assignmentId");
  const { token } = useAuth();
  const isTeacher = role === "teacher";

  const { data: teacherData, isLoading: teacherLoading } = useSWR<{
    assignment: Assignment;
  }>(
    isTeacher && assignmentId && token
      ? [
          `/api/courses/${courseId}/assignments/${assignmentId}?role=teacher`,
          token,
        ]
      : null,
    ([url, tk]: [string, string]) =>
      authFetcher<{ assignment: Assignment }>(url, tk),
  );

  if (assignmentId) {
    if (isTeacher) {
      if (teacherLoading || !teacherData?.assignment) {
        return <p className="text-sm text-slate-500">{t("common.loading")}</p>;
      }
      return (
        <TeacherSubmissionInbox
          courseId={courseId}
          assignment={teacherData.assignment}
          basePath={basePath}
        />
      );
    }
    return (
      <StudentAssignmentDetail
        courseId={courseId}
        assignmentId={assignmentId}
        basePath={basePath}
      />
    );
  }

  if (isTeacher) {
    return (
      <TeacherAssignmentList courseId={courseId} basePath={basePath} />
    );
  }

  return <StudentAssignmentList courseId={courseId} basePath={basePath} />;
}

export function AssignmentPortal(props: AssignmentPortalProps) {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">{t("common.loading")}</p>}>
      <AssignmentPortalInner {...props} />
    </Suspense>
  );
}
