"use client";

import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/contexts/AuthContext";
import { STUDENT_COURSES_KEY } from "@/hooks/useStudentCourses";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { StudentCourse } from "@/types/course";
import { FormEvent, useState } from "react";
import { useSWRConfig } from "swr";

interface JoinClassModalProps {
  open: boolean;
  onClose: () => void;
  onJoined?: (course: StudentCourse) => void;
}

export function JoinClassModal({ open, onClose, onJoined }: JoinClassModalProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { mutate } = useSWRConfig();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const trimmed = code.trim();
    const cacheKey = token ? [STUDENT_COURSES_KEY, token] : null;

    try {
      await mutate(
        cacheKey,
        async (current: { courses: StudentCourse[] } | undefined) => {
          const res = await fetch(STUDENT_COURSES_KEY, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ code: trimmed }),
          });

          if (!res.ok) {
            throw new Error("not_found");
          }

          const { course } = (await res.json()) as { course: StudentCourse };
          const existing = current?.courses ?? [];
          const alreadyEnrolled = existing.some((c) => c.id === course.id);
          const courses = alreadyEnrolled
            ? existing
            : [...existing, course];

          onJoined?.(course);
          setCode("");
          onClose();
          return { courses };
        },
        {
          optimisticData: (current) => {
            const placeholder: StudentCourse = {
              id: `optimistic-${Date.now()}`,
              name: trimmed,
              teacherName: "…",
              code: trimmed.toUpperCase(),
              nextDeadline: null,
              recentContent: null,
            };
            return {
              courses: [...(current?.courses ?? []), placeholder],
            };
          },
          rollbackOnError: true,
          revalidate: true,
        },
      );
    } catch {
      setError(t("student.joinError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("student.joinClassModalTitle")}
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
            form="join-class-form"
            disabled={submitting || !code.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? t("common.loading") : t("student.joinSubmit")}
          </button>
        </>
      }
    >
      <form id="join-class-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="join-code"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            {t("student.courseCodeLabel")}
          </label>
          <input
            id="join-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
            placeholder={t("student.courseCodePlaceholder")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
            autoComplete="off"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
