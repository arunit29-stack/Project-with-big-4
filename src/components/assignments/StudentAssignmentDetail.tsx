"use client";

import { OfflineBanner } from "@/components/assignments/OfflineBanner";
import { PdfSubmitZone } from "@/components/assignments/PdfSubmitZone";
import { RubricDisplay } from "@/components/assignments/RubricDisplay";
import { SubmissionStatusChip } from "@/components/assignments/SubmissionStatusChip";
import { useAuth } from "@/contexts/AuthContext";
import { authFetcher } from "@/lib/api/fetcher";
import {
  formatAssignmentDeadline,
  formatSubmittedAtLocal,
  getUserTimeZone,
  isPastDeadline,
} from "@/lib/assignments/formatDeadline";
import { saveOfflineSubmission } from "@/lib/assignments/offlineSubmissions";
import {
  confirmSubmission,
  presignSubmission,
  uploadToS3,
} from "@/lib/assignments/submitPdf";
import { useOfflineSubmissionSync } from "@/hooks/useOfflineSubmissionSync";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { StudentAssignmentListItem } from "@/types/assignment";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import useSWR from "swr";

interface StudentAssignmentDetailProps {
  courseId: string;
  assignmentId: string;
  basePath: string;
}

export function StudentAssignmentDetail({
  courseId,
  assignmentId,
  basePath,
}: StudentAssignmentDetailProps) {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const online = useOnlineStatus();
  const tz = getUserTimeZone();

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const { data, isLoading, mutate } = useSWR<StudentAssignmentListItem>(
    token
      ? [`/api/courses/${courseId}/assignments/${assignmentId}`, token]
      : null,
    ([url, tk]: [string, string]) =>
      authFetcher<StudentAssignmentListItem>(url, tk),
  );

  const { syncing, hasPending, refreshPending } = useOfflineSubmissionSync(
    courseId,
    () => void mutate(),
  );

  const goBack = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "assignments");
    params.delete("assignmentId");
    router.push(`/${basePath}/${courseId}?${params.toString()}`);
  }, [basePath, courseId, router, searchParams]);

  const handleSubmit = useCallback(
    async (file: File) => {
      if (!token || !data) return;

      if (!online) {
        const id = `offline-${Date.now()}`;
        const buffer = await file.arrayBuffer();
        await saveOfflineSubmission({
          id,
          courseId,
          assignmentId,
          fileName: file.name,
          fileData: buffer,
          mimeType: "application/pdf",
          createdAt: new Date().toISOString(),
        });
        await refreshPending();
        return;
      }

      setUploading(true);
      setProgress(0);
      try {
        const presign = await presignSubmission(
          courseId,
          assignmentId,
          file,
          token,
        );
        await uploadToS3(presign.uploadUrl, file, setProgress);
        await confirmSubmission(
          courseId,
          assignmentId,
          file.name,
          presign.submissionToken,
          token,
          user?.email ?? "Student",
        );
        await mutate();
      } finally {
        setUploading(false);
        setProgress(null);
      }
    },
    [
      token,
      data,
      online,
      courseId,
      assignmentId,
      user,
      mutate,
      refreshPending,
    ],
  );

  if (isLoading || !data) {
    return <p className="text-sm text-slate-500">{t("common.loading")}</p>;
  }

  const { assignment, status, versions } = data;
  const locked = isPastDeadline(assignment.deadline);
  const due = formatAssignmentDeadline(
    assignment.deadline,
    t("assignments.duePrefix"),
    t("assignments.yourTime"),
    tz,
  );
  const latest = versions[versions.length - 1];

  return (
    <div>
      <button
        type="button"
        onClick={goBack}
        className="mb-4 text-sm font-medium text-brand-600 hover:underline"
      >
        {t("assignments.backToList")}
      </button>

      <OfflineBanner show={!online || hasPending} syncing={syncing} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {assignment.title}
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-700">{due.label}</p>
        </div>
        <SubmissionStatusChip status={status} version={latest?.version ?? null} />
      </div>

      <div className="prose prose-sm mb-6 max-w-none text-slate-700">
        <p>{assignment.description}</p>
      </div>

      <div className="mb-8">
        <RubricDisplay criteria={assignment.rubric} />
      </div>

      {locked && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {t("assignments.student.deadlinePassed")}
        </div>
      )}

      {status === "pending_review" && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {t("assignments.student.awaitingReview")}
        </div>
      )}

      {(status === "late" || status === "submitted") && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {t("assignments.student.resultsPending")}
        </div>
      )}

      {status === "assessed" && latest?.assessment && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="font-semibold text-emerald-900">
            {t("assignments.student.gradeTitle")}
          </h3>
          <p className="mt-1 text-2xl font-bold text-emerald-800">
            {latest.assessment.totalMarks} / {latest.assessment.maxMarks}
          </p>
          <p className="mt-2 text-sm text-emerald-900">
            {latest.assessment.overallFeedback}
          </p>
        </div>
      )}

      {!locked && (
        <section className="mb-8">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            {t("assignments.submit.title")}
          </h3>
          <PdfSubmitZone
            disabled={uploading || syncing}
            uploading={uploading || syncing}
            progress={progress}
            onFileSelected={(f) => void handleSubmit(f)}
          />
        </section>
      )}

      {versions.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            {t("assignments.student.historyTitle")}
          </h3>
          <ul className="space-y-2">
            {[...versions].reverse().map((v) => (
              <li
                key={v.version}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
              >
                <span>
                  {t("assignments.student.version", { n: v.version })}
                  <span className="ml-2 text-slate-500">
                    {formatSubmittedAtLocal(v.submittedAt, tz)}
                  </span>
                </span>
                <a
                  href={v.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 hover:underline"
                >
                  {v.fileName}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
