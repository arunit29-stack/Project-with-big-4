"use client";

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
import type { TeacherAssignmentListItem } from "@/types/assignment";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";

interface TeacherAssignmentListProps {
  courseId: string;
  basePath: string;
}

export function TeacherAssignmentList({
  courseId,
  basePath,
}: TeacherAssignmentListProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tz = getUserTimeZone();

  const { data, isLoading } = useSWR<{
    assignments: TeacherAssignmentListItem[];
  }>(
    token
      ? [`/api/courses/${courseId}/assignments?role=teacher`, token]
      : null,
    ([url, tk]: [string, string]) =>
      authFetcher<{ assignments: TeacherAssignmentListItem[] }>(url, tk),
  );

  const { data: countData } = useSWR<{ count: number }>(
    token
      ? [`/api/courses/${courseId}/assignments/unassessed-count`, token]
      : null,
    ([url, tk]: [string, string]) =>
      authFetcher<{ count: number }>(url, tk),
    { refreshInterval: 5000 },
  );

  const assignments = data?.assignments ?? [];
  const unassessedTotal = countData?.count ?? 0;

  function openInbox(assignmentId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "assignments");
    params.set("assignmentId", assignmentId);
    router.push(`/${basePath}/${courseId}?${params.toString()}`);
  }

  if (isLoading) return <CourseGridSkeleton count={3} />;

  return (
    <div>
      {unassessedTotal > 0 && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900">
          {t("assignments.teacher.unassessedBadge", { count: unassessedTotal })}
        </div>
      )}

      {assignments.length === 0 ? (
        <EmptyState
          illustration={<ClipboardIllustration />}
          title={t("courseShell.empty.assignmentsTitle")}
          description={t("courseShell.empty.assignmentsDescription")}
        />
      ) : (
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
                  onClick={() => openInbox(item.assignment.id)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-brand-500 hover:shadow-md"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {item.assignment.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">{due.label}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("assignments.teacher.submissionCount", {
                        count: item.totalSubmissions,
                      })}
                    </p>
                  </div>
                  {item.pendingCount > 0 && (
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-red-600 px-2 text-sm font-bold text-white">
                      {item.pendingCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
