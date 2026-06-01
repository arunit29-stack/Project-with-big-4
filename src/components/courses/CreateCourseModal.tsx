"use client";

import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/contexts/AuthContext";
import { TEACHER_COURSES_KEY } from "@/hooks/useTeacherCourses";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TeacherCourse } from "@/types/course";
import { FormEvent, useEffect, useState } from "react";
import { useSWRConfig } from "swr";

interface CreateCourseModalProps {
  open: boolean;
  onClose: () => void;
}

function randomCode(): string {
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CBB-${seg()}-${seg()}`;
}

export function CreateCourseModal({ open, onClose }: CreateCourseModalProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { mutate } = useSWRConfig();
  const [name, setName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [description, setDescription] = useState("");
  const [enrolmentOpen, setEnrolmentOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setCourseCode(randomCode());
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const cacheKey = token ? [TEACHER_COURSES_KEY, token] : null;

    const payload = {
      name: name.trim(),
      code: courseCode.trim(),
      description: description.trim(),
      enrolmentOpen,
    };

    try {
      await mutate(
        cacheKey,
        async (current: { courses: TeacherCourse[] } | undefined) => {
          const res = await fetch(TEACHER_COURSES_KEY, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error("create_failed");
          const { course } = (await res.json()) as { course: TeacherCourse };
          return { courses: [course, ...(current?.courses ?? [])] };
        },
        {
          optimisticData: (current) => {
            const placeholder: TeacherCourse = {
              id: `optimistic-${Date.now()}`,
              name: payload.name,
              code: payload.code,
              description: payload.description,
              enrolmentOpen: payload.enrolmentOpen,
              studentCount: 0,
              pendingSubmissions: 0,
              hasUpcomingQuiz: false,
            };
            return { courses: [placeholder, ...(current?.courses ?? [])] };
          },
          rollbackOnError: true,
          revalidate: true,
        },
      );
      setName("");
      setDescription("");
      setEnrolmentOpen(true);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("teacher.createModalTitle")}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="create-course-form"
            disabled={submitting || !name.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? t("common.loading") : t("teacher.createSubmit")}
          </button>
        </>
      }
    >
      <form id="create-course-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="course-name" className="mb-1 block text-sm font-medium text-slate-700">
            {t("teacher.courseNameLabel")}
          </label>
          <input
            id="course-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("teacher.courseNamePlaceholder")}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label htmlFor="course-code" className="mb-1 block text-sm font-medium text-slate-700">
            {t("teacher.courseCodeLabel")}
          </label>
          <input
            id="course-code"
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-slate-500">{t("teacher.courseCodeHint")}</p>
        </div>
        <div>
          <label htmlFor="course-desc" className="mb-1 block text-sm font-medium text-slate-700">
            {t("teacher.descriptionLabel")}
          </label>
          <textarea
            id="course-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("teacher.descriptionPlaceholder")}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={enrolmentOpen}
            onChange={(e) => setEnrolmentOpen(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            <span className="block text-sm font-medium text-slate-700">
              {t("teacher.enrolmentOpenLabel")}
            </span>
            <span className="block text-xs text-slate-500">
              {t("teacher.enrolmentOpenHint")}
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}
