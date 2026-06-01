"use client";

import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TeacherCourse } from "@/types/course";
import Link from "next/link";

interface TeacherCourseCardProps {
  course: TeacherCourse;
}

export function TeacherCourseCard({ course }: TeacherCourseCardProps) {
  const { t } = useTranslation();

  return (
    <Link
      href={`/dashboard/${course.id}`}
      className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900 group-hover:text-brand-700">
          {course.name}
        </h3>
        {course.pendingSubmissions > 0 && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            {course.pendingSubmissions}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {t("teacher.card.students", { count: course.studentCount })}
      </p>
      {course.pendingSubmissions > 0 && (
        <p className="mt-1 text-xs text-amber-700">
          {t("teacher.card.pendingSubmissions", {
            count: course.pendingSubmissions,
          })}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {course.hasUpcomingQuiz
          ? t("teacher.card.upcomingQuiz")
          : t("teacher.card.noUpcomingQuiz")}
      </p>
    </Link>
  );
}
