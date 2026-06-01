"use client";

import { CourseBreadcrumb } from "@/components/course-shell/CourseBreadcrumb";
import { CourseSidebar } from "@/components/course-shell/CourseSidebar";
import { CourseTabPanel } from "@/components/course-shell/CourseTabPanel";
import { AuthenticatedShell } from "@/components/layout/AuthenticatedShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { authFetcher } from "@/lib/api/fetcher";
import { DEFAULT_TAB, isPhase2Tab, isValidTab } from "@/lib/courses/tabs";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { CourseDetail, CourseTabId } from "@/types/course";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import useSWR from "swr";

interface CourseViewShellProps {
  courseId: string;
  basePath: "class" | "dashboard";
  role: "student" | "teacher";
}

function ShellSkeleton() {
  return (
    <AuthenticatedShell wide>
      <Skeleton className="mb-6 h-4 w-2/3 max-w-md" />
      <div className="flex flex-col gap-6 lg:flex-row">
        <Skeleton className="h-64 w-full lg:w-56" />
        <Skeleton className="h-96 flex-1" />
      </div>
    </AuthenticatedShell>
  );
}

function CourseViewShellInner({
  courseId,
  basePath,
  role,
}: CourseViewShellProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: CourseTabId = isValidTab(rawTab) ? rawTab : DEFAULT_TAB;

  const { data, isLoading, error } = useSWR<{ course: CourseDetail }>(
    token ? [`/api/courses/${courseId}?role=${role}`, token] : null,
    ([url, tkn]) =>
      authFetcher<{ course: CourseDetail }>(url as string, tkn as string),
  );

  const homeHref = basePath === "class" ? "/class" : "/dashboard";

  if (isLoading) return <ShellSkeleton />;

  if (error || !data?.course) {
    return (
      <AuthenticatedShell wide>
        <p className="text-center text-slate-600">{t("courseShell.notFound")}</p>
      </AuthenticatedShell>
    );
  }

  const { course } = data;

  return (
    <AuthenticatedShell wide>
      <CourseBreadcrumb
        homeHref={homeHref}
        courseName={course.name}
        activeTab={activeTab}
      />
      <div className="flex flex-col gap-8 lg:flex-row">
        <CourseSidebar />
        <div className="min-h-[320px] flex-1">
          {isPhase2Tab(activeTab) ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <h3 className="text-lg font-semibold text-slate-900">
                {t("courseShell.aiComingSoonTitle")}
              </h3>
              <p className="mt-2 max-w-sm text-sm text-slate-600">
                {t("courseShell.aiComingSoonDescription")}
              </p>
              <span className="mt-4 rounded bg-slate-200 px-2 py-1 text-xs font-semibold uppercase text-slate-500">
                {t("common.comingSoon")}
              </span>
            </div>
          ) : (
            <CourseTabPanel
              tab={activeTab}
              courseId={courseId}
              role={role}
            />
          )}
        </div>
      </div>
    </AuthenticatedShell>
  );
}

export function CourseViewShell(props: CourseViewShellProps) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <CourseViewShellInner {...props} />
    </Suspense>
  );
}
