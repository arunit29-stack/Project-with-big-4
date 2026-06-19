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
  const [uploadingSol, setUploadingSol] = useState(false);
  const [solProgress, setSolProgress] = useState<number | null>(null);
  const [solError, setSolError] = useState<string | null>(null);

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

  async function handleUploadSolution(file: File) {
    if (!token) return;
    setUploadingSol(true);
    setSolProgress(0);
    setSolError(null);
    try {
      const presignFd = new FormData();
      presignFd.append("file", file);
      const presignRes = await fetch(`/api/courses/${courseId}/assignments/presign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: presignFd,
      });
      if (!presignRes.ok) throw new Error("Failed to get solution upload URL");
      const presignData = await presignRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presignData.uploadUrl);
        xhr.setRequestHeader("Content-Type", "application/pdf");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setSolProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error("Upload failed"));
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      });

      const confirmRes = await fetch(`/api/courses/${courseId}/assignments/${assignment.id}/solution`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          solutionKey: presignData.fileKey,
          solutionName: presignData.fileName,
        }),
      });
      if (!confirmRes.ok) throw new Error("Failed to save solutions file reference");

      assignment.solutionKey = presignData.fileKey;
      assignment.solutionName = presignData.fileName;
      assignment.solutionUrl = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/mock-files/${presignData.fileKey}`;
    } catch (err) {
      setSolError((err as Error).message);
    } finally {
      setUploadingSol(false);
      setSolProgress(null);
    }
  }

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

      {assignment.fileUrl && (
        <div className="mb-4 text-sm p-4 rounded-xl border border-slate-200 bg-white">
          <span className="font-semibold text-slate-700">Assignment Attachment: </span>
          <a
            href={assignment.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 hover:underline font-medium"
          >
            {assignment.fileName || "Download PDF"}
          </a>
        </div>
      )}

      <div className="mb-6 p-4 rounded-xl border border-slate-200 bg-white">
        <h3 className="text-sm font-bold text-slate-900 mb-2">Official Solutions</h3>
        {assignment.solutionUrl ? (
          <div className="mb-3 text-sm">
            <span className="font-semibold text-slate-700">Current Solutions: </span>
            <a
              href={assignment.solutionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:underline font-medium"
            >
              {assignment.solutionName || "Solutions PDF"}
            </a>
          </div>
        ) : (
          <p className="text-xs text-slate-500 mb-3">No solutions uploaded yet.</p>
        )}
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={uploadingSol}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUploadSolution(file);
            }}
            className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 file:cursor-pointer hover:file:bg-brand-100"
          />
        </div>
        {solProgress !== null && (
          <div className="mt-2 w-64">
            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span>Uploading solutions...</span>
              <span>{solProgress}%</span>
            </div>
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-600" style={{ width: `${solProgress}%` }} />
            </div>
          </div>
        )}
        {solError && (
          <p className="text-xs text-red-600 mt-1">{solError}</p>
        )}
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
