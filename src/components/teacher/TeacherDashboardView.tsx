"use client";

import { CreateCourseModal } from "@/components/courses/CreateCourseModal";
import { TeacherCourseCard } from "@/components/courses/TeacherCourseCard";
import { BooksIllustration } from "@/components/illustrations/EmptyIllustrations";
import { CourseGridSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTeacherCourses } from "@/hooks/useTeacherCourses";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useState } from "react";

export function TeacherDashboardView() {
  const { t } = useTranslation();
  const { courses, isLoading } = useTeacherCourses();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("teacher.dashboardTitle")}
        </h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          {t("teacher.createCourse")}
        </button>
      </div>

      {isLoading ? (
        <CourseGridSkeleton />
      ) : courses.length === 0 ? (
        <EmptyState
          illustration={<BooksIllustration />}
          title={t("teacher.emptyTitle")}
          description={t("teacher.emptyDescription")}
          cta={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              {t("teacher.emptyCta")}
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <TeacherCourseCard key={course.id} course={course} />
          ))}
        </div>
      )}

      <CreateCourseModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
