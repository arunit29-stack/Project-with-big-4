"use client";

import { SubmissionStatusChip } from "@/components/assignments/SubmissionStatusChip";
import { ClipboardIllustration } from "@/components/illustrations/EmptyIllustrations";
import { CourseGridSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { authFetcher } from "@/lib/api/fetcher";
import {
  formatAssignmentDeadline,
  getUserTimeZone,
} from "@/lib/assignments/formatDeadline";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { StudentAssignmentListItem } from "@/types/assignment";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";

interface StudentAssignmentListProps {
  courseId: string;
  basePath: string;
}

export function StudentAssignmentList({
  courseId,
  basePath,
}: StudentAssignmentListProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tz = getUserTimeZone();

  const { data, isLoading } = useSWR<{ assignments: StudentAssignmentListItem[] }>(
    token ? [`/api/courses/${courseId}/assignments`, token] : null,
    ([url, tk]: [string, string]) =>
      authFetcher<{ assignments: StudentAssignmentListItem[] }>(url, tk),
  );

  const assignments = data?.assignments ?? [];

  function openAssignment(assignmentId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "assignments");
    params.set("assignmentId", assignmentId);
    router.push(`/${basePath}/${courseId}?${params.toString()}`);
  }

  if (isLoading) return <CourseGridSkeleton count={3} />;

  if (assignments.length === 0) {
    return (
      <EmptyState
        illustration={<ClipboardIllustration />}
        title={t("courseShell.empty.assignmentsTitle")}
        description={t("courseShell.empty.assignmentsDescription")}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {assignments.map((item) => {
        const due = formatAssignmentDeadline(
          item.assignment.deadline,
          t("assignments.duePrefix"),
          t("assignments.yourTime"),
          tz,
        );
        return (
          <li key={item.assignment.id}>
            <button
              type="button"
              onClick={() => openAssignment(item.assignment.id)}
              className="w-full rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-brand-500 hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900">
                  {item.assignment.title}
                </h3>
                <SubmissionStatusChip
                  status={item.status}
                  version={item.currentVersion}
                />
              </div>
              <p className="mt-2 text-sm font-medium text-slate-700">{due.label}</p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
