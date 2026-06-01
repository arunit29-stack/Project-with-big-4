"use client";

import { useTranslation } from "@/lib/i18n/useTranslation";

interface PdfToolbarProps {
  page: number;
  numPages: number;
  scale: number;
  canAnnotate: boolean;
  annotateMode: "none" | "highlight" | "note";
  onPageChange: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFullscreen: () => void;
  onDownload: () => void;
  onAnnotateModeChange: (mode: "none" | "highlight" | "note") => void;
}

export function PdfToolbar({
  page,
  numPages,
  scale,
  canAnnotate,
  annotateMode,
  onPageChange,
  onZoomIn,
  onZoomOut,
  onFullscreen,
  onDownload,
  onAnnotateModeChange,
}: PdfToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-40"
          aria-label={t("contentLibrary.pdf.prevPage")}
        >
          ‹
        </button>
        <span className="min-w-[4.5rem] text-center text-sm text-slate-700">
          {t("contentLibrary.pdf.pageOf", { page, total: numPages || "—" })}
        </span>
        <button
          type="button"
          disabled={page >= numPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-40"
          aria-label={t("contentLibrary.pdf.nextPage")}
        >
          ›
        </button>
      </div>

      <div className="h-5 w-px bg-slate-200" />

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onZoomOut}
          className="rounded px-2 py-1 text-sm hover:bg-slate-100"
          aria-label={t("contentLibrary.pdf.zoomOut")}
        >
          −
        </button>
        <span className="min-w-[3rem] text-center text-xs text-slate-600">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={onZoomIn}
          className="rounded px-2 py-1 text-sm hover:bg-slate-100"
          aria-label={t("contentLibrary.pdf.zoomIn")}
        >
          +
        </button>
      </div>

      <div className="h-5 w-px bg-slate-200" />

      <button
        type="button"
        onClick={onFullscreen}
        className="rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
      >
        {t("contentLibrary.pdf.fullscreen")}
      </button>
      <button
        type="button"
        onClick={onDownload}
        className="rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
      >
        {t("contentLibrary.pdf.download")}
      </button>

      {canAnnotate && (
        <>
          <div className="h-5 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() =>
              onAnnotateModeChange(
                annotateMode === "highlight" ? "none" : "highlight",
              )
            }
            className={`rounded px-2 py-1 text-sm ${
              annotateMode === "highlight"
                ? "bg-amber-100 text-amber-900"
                : "hover:bg-slate-100"
            }`}
          >
            {t("contentLibrary.pdf.highlight")}
          </button>
          <button
            type="button"
            onClick={() =>
              onAnnotateModeChange(annotateMode === "note" ? "none" : "note")
            }
            className={`rounded px-2 py-1 text-sm ${
              annotateMode === "note"
                ? "bg-blue-100 text-blue-900"
                : "hover:bg-slate-100"
            }`}
          >
            {t("contentLibrary.pdf.addNote")}
          </button>
        </>
      )}
    </div>
  );
}
