"use client";

import { JoinClassModal } from "@/components/courses/JoinClassModal";
import { StudentCourseCard } from "@/components/courses/StudentCourseCard";
import { BooksIllustration } from "@/components/illustrations/EmptyIllustrations";
import { CourseGridSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useStudentCourses } from "@/hooks/useStudentCourses";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useState } from "react";

export function StudentClassView() {
  const { t } = useTranslation();
  const { courses, isLoading } = useStudentCourses();
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("student.classTitle")}
        </h1>
        <button
          type="button"
          onClick={() => setJoinOpen(true)}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          {t("student.joinClass")}
        </button>
      </div>

      {isLoading ? (
        <CourseGridSkeleton />
      ) : courses.length === 0 ? (
        <EmptyState
          illustration={<BooksIllustration />}
          title={t("student.emptyTitle")}
          description={t("student.emptyDescription")}
          cta={
            <button
              type="button"
              onClick={() => setJoinOpen(true)}
              className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              {t("student.emptyCta")}
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <StudentCourseCard key={course.id} course={course} />
          ))}
        </div>
      )}

      <JoinClassModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}
