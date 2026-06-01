"use client";

import { useTranslation } from "@/lib/i18n/useTranslation";
import { useCallback, useRef, useState } from "react";

interface PdfSubmitZoneProps {
  disabled: boolean;
  uploading: boolean;
  progress: number | null;
  onFileSelected: (file: File) => void;
}

export function PdfSubmitZone({
  disabled,
  uploading,
  progress,
  onFileSelected,
}: PdfSubmitZoneProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(
    (file: File) => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setError(t("assignments.submit.pdfOnly"));
        return false;
      }
      setError(null);
      return true;
    },
    [t],
  );

  function handleFile(file: File) {
    if (!validate(file)) return;
    onFileSelected(file);
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            inputRef.current?.click();
          }
        }}
        className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
            : dragOver
              ? "border-brand-500 bg-brand-50"
              : "cursor-pointer border-slate-300 bg-white hover:border-brand-400"
        }`}
      >
        <p className="text-sm text-slate-600">
          {uploading
            ? t("assignments.submit.uploading")
            : t("assignments.submit.dropzone")}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {progress !== null && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-600">
            <span>{t("assignments.submit.progress")}</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-brand-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
