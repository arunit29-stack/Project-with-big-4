"use client";

import {
  formatDueDate,
  getStudentCardSubtitle,
} from "@/lib/courses/deadlineDisplay";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { StudentCourse } from "@/types/course";
import Link from "next/link";

interface StudentCourseCardProps {
  course: StudentCourse;
}

export function StudentCourseCard({ course }: StudentCourseCardProps) {
  const { t } = useTranslation();
  const subtitle = getStudentCardSubtitle(course);

  return (
    <Link
      href={`/class/${course.id}`}
      className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <h3 className="text-lg font-semibold text-slate-900 group-hover:text-brand-700">
        {course.name}
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        {t("student.card.teacher")}: {course.teacherName}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        {t("student.card.code")}: {course.code}
      </p>
      {subtitle && (
        <p className="mt-3 text-sm font-medium text-brand-700">
          {subtitle.type === "deadline"
            ? t("student.card.dueSoon", {
                title: subtitle.title,
                date: formatDueDate(subtitle.dueAt),
              })
            : t("student.card.recentContent", { title: subtitle.title })}
        </p>
      )}
    </Link>
  );
}
