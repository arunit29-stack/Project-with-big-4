"use client";

import { RubricScoringForm } from "@/components/assignments/RubricScoringForm";
import { useAuth } from "@/contexts/AuthContext";
import { authFetcher } from "@/lib/api/fetcher";
import {
  formatSubmittedAtLocal,
  getUserTimeZone,
} from "@/lib/assignments/formatDeadline";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type {
  Assessment,
  Assignment,
  TeacherSubmissionRow,
} from "@/types/assignment";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

interface TeacherSubmissionInboxProps {
  courseId: string;
  assignment: Assignment;
  basePath: string;
}

export function TeacherSubmissionInbox({
  courseId,
  assignment,
  basePath,
}: TeacherSubmissionInboxProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tz = getUserTimeZone();
  const [pendingOnly, setPendingOnly] = useState(false);

  const swrKey = token
    ? [
        `/api/courses/${courseId}/assignments/${assignment.id}/submissions?pendingOnly=${pendingOnly}`,
        token,
      ]
    : null;

  const { data, isLoading, mutate } = useSWR<{
    submissions: TeacherSubmissionRow[];
  }>(swrKey, ([url, tk]: [string, string]) =>
    authFetcher<{ submissions: TeacherSubmissionRow[] }>(url, tk),
  );

  const submissions = data?.submissions ?? [];

  function goBack() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "assignments");
    params.delete("assignmentId");
    router.push(`/${basePath}/${courseId}?${params.toString()}`);
  }

  async function handleAssess(
    submissionId: string,
    assessment: Assessment,
    waiveLatePenalty: boolean,
  ) {
    if (!token) return;
    await fetch(
      `/api/courses/${courseId}/assignments/${assignment.id}/submissions/${submissionId}/assess`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assessment, waiveLatePenalty }),
      },
    );
    await mutate();
  }

  return (
    <div>
      <button
        type="button"
        onClick={goBack}
        className="mb-4 text-sm font-medium text-brand-600 hover:underline"
      >
        {t("assignments.backToList")}
      </button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-900">
          {assignment.title}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPendingOnly(true)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              pendingOnly
                ? "bg-brand-600 text-white"
                : "border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t("assignments.teacher.pendingOnly")}
          </button>
          <button
            type="button"
            onClick={() => setPendingOnly(false)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              !pendingOnly
                ? "bg-slate-800 text-white"
                : "border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t("assignments.teacher.showAll")}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">{t("common.loading")}</p>
      ) : submissions.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t("assignments.teacher.noSubmissions")}
        </p>
      ) : (
        <ul className="space-y-6">
          {submissions.map((sub) => {
            const penalty =
              sub.isLate && !sub.latePenaltyWaived
                ? sub.latePenaltyPercent
                : 0;
            return (
              <li
                key={sub.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {sub.studentName}
                    </p>
                    <p className="text-sm text-slate-600">
                      {t("assignments.teacher.submittedAt", {
                        time: formatSubmittedAtLocal(sub.submittedAt, tz),
                      })}
                    </p>
                    <p className="text-sm text-slate-500">
                      {t("assignments.student.version", { n: sub.version })}
                      {sub.isLate && (
                        <span className="ml-2 text-amber-700">
                          {penalty > 0
                            ? t("assignments.teacher.lateWithPenalty", {
                                percent: penalty,
                              })
                            : t("assignments.status.late")}
                        </span>
                      )}
                    </p>
                  </div>
                  <a
                    href={sub.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-slate-50"
                  >
                    {t("assignments.teacher.downloadPdf")}
                  </a>
                </div>

                <RubricScoringForm
                  criteria={assignment.rubric}
                  submission={sub}
                  onAssess={(assessment, waive) =>
                    handleAssess(sub.id, assessment, waive)
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
