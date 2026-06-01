"use client";

import { useTranslation } from "@/lib/i18n/useTranslation";
import type { ContentStatus } from "@/types/content";

interface StatusChipProps {
  status: ContentStatus;
  uploadProgress?: number;
  onRetry?: () => void;
}

export function StatusChip({ status, uploadProgress, onRetry }: StatusChipProps) {
  const { t } = useTranslation();

  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        <CheckIcon />
        {t("contentLibrary.status.ready")}
      </span>
    );
  }

  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        <SpinnerIcon />
        {t("contentLibrary.status.processing")}
      </span>
    );
  }

  if (status === "uploading") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
        <SpinnerIcon />
        {t("contentLibrary.status.uploading")}
        {typeof uploadProgress === "number" && (
          <span className="tabular-nums">{uploadProgress}%</span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
        {t("contentLibrary.status.failed")}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          {t("contentLibrary.status.retry")}
        </button>
      )}
    </span>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
