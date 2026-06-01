"use client";

import { useTranslation } from "@/lib/i18n/useTranslation";
import type { StudentSubmissionStatus } from "@/types/assignment";

interface SubmissionStatusChipProps {
  status: StudentSubmissionStatus;
  version: number | null;
}

export function SubmissionStatusChip({
  status,
  version,
}: SubmissionStatusChipProps) {
  const { t } = useTranslation();

  const styles: Record<StudentSubmissionStatus, string> = {
    not_submitted: "bg-slate-100 text-slate-700",
    submitted: "bg-blue-100 text-blue-800",
    pending_review: "bg-blue-100 text-blue-800",
    late: "bg-amber-100 text-amber-900",
    assessed: "bg-emerald-100 text-emerald-800",
  };

  const label =
    (status === "submitted" || status === "pending_review") && version != null
      ? t("assignments.status.submittedVersion", { version })
      : t(`assignments.status.${status}`);

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {label}
    </span>
  );
}
