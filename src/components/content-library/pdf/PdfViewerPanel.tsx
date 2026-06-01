"use client";

import { PdfToolbar } from "@/components/content-library/pdf/PdfToolbar";
import { StatusChip } from "@/components/content-library/StatusChip";
import { usePdfAnnotations } from "@/hooks/usePdfAnnotations";
import { setupPdfWorker } from "@/lib/pdf/setupPdfWorker";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type {
  HighlightAnnotation,
  LibraryPdfItem,
  NoteAnnotation,
  PdfAnnotation,
} from "@/types/content";
import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

interface PdfViewerPanelProps {
  courseId: string;
  item: LibraryPdfItem;
  canAnnotate: boolean;
}

export function PdfViewerPanel({
  courseId,
  item,
  canAnnotate,
}: PdfViewerPanelProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [annotateMode, setAnnotateMode] = useState<"none" | "highlight" | "note">(
    "none",
  );
  const [pendingNote, setPendingNote] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [noteText, setNoteText] = useState("");

  const { annotations, persist, setLocal } = usePdfAnnotations(
    courseId,
    item.status === "ready" ? item.id : null,
  );

  useEffect(() => {
    setupPdfWorker();
  }, []);

  const pageAnnotations = annotations.filter((a) => a.page === page);

  const saveAll = useCallback(
    async (next: PdfAnnotation[]) => {
      setLocal(next);
      await persist(next);
    },
    [persist, setLocal],
  );

  function handleHighlightFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !pageWrapRef.current) return;

    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    const pageRect = pageWrapRef.current.getBoundingClientRect();

    const normalized = rects.map((r) => ({
      x: ((r.left - pageRect.left) / pageRect.width) * 100,
      y: ((r.top - pageRect.top) / pageRect.height) * 100,
      width: (r.width / pageRect.width) * 100,
      height: (r.height / pageRect.height) * 100,
    }));

    const highlight: HighlightAnnotation = {
      id: `hl-${Date.now()}`,
      fileId: item.id,
      page,
      type: "highlight",
      color: "#fde047",
      text,
      rects: normalized,
      createdAt: new Date().toISOString(),
    };

    void saveAll([...annotations, highlight]);
    sel.removeAllRanges();
    setAnnotateMode("none");
  }

  function handlePageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (annotateMode !== "note" || !pageWrapRef.current) return;
    const rect = pageWrapRef.current.getBoundingClientRect();
    setPendingNote({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }

  function submitNote() {
    if (!pendingNote || !noteText.trim()) return;
    const note: NoteAnnotation = {
      id: `note-${Date.now()}`,
      fileId: item.id,
      page,
      type: "note",
      x: pendingNote.x,
      y: pendingNote.y,
      text: noteText.trim(),
      createdAt: new Date().toISOString(),
    };
    void saveAll([...annotations, note]);
    setPendingNote(null);
    setNoteText("");
    setAnnotateMode("none");
  }

  function toggleFullscreen() {
    containerRef.current?.requestFullscreen?.();
  }

  function handleDownload() {
    window.open(item.downloadUrl, "_blank", "noopener,noreferrer");
  }

  if (item.status !== "ready") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <StatusChip status={item.status} />
        <p className="text-sm text-slate-500">
          {t("contentLibrary.pdf.notReady")}
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-[480px] flex-1 flex-col bg-slate-100">
      <PdfToolbar
        page={page}
        numPages={numPages}
        scale={scale}
        canAnnotate={canAnnotate}
        annotateMode={annotateMode}
        onPageChange={setPage}
        onZoomIn={() => setScale((s) => Math.min(s + 0.2, 3))}
        onZoomOut={() => setScale((s) => Math.max(s - 0.2, 0.5))}
        onFullscreen={toggleFullscreen}
        onDownload={handleDownload}
        onAnnotateModeChange={setAnnotateMode}
      />

      {annotateMode === "highlight" && (
        <div className="bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          {t("contentLibrary.pdf.highlightHint")}
          <button
            type="button"
            className="ml-2 font-medium underline"
            onClick={handleHighlightFromSelection}
          >
            {t("contentLibrary.pdf.saveHighlight")}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        <div
          ref={pageWrapRef}
          className="relative mx-auto w-fit shadow-lg"
          onMouseUp={() => {
            if (annotateMode === "highlight") handleHighlightFromSelection();
          }}
          onClick={handlePageClick}
        >
          <Document
            file={item.pdfUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            loading={
              <p className="p-8 text-sm text-slate-500">{t("common.loading")}</p>
            }
          >
            <Page pageNumber={page} scale={scale} className="bg-white" />
          </Document>

          <div className="pointer-events-none absolute inset-0">
            {pageAnnotations.map((ann) =>
              ann.type === "highlight" ? (
                ann.rects.map((rect, i) => (
                  <div
                    key={`${ann.id}-${i}`}
                    className="absolute rounded-sm"
                    style={{
                      left: `${rect.x}%`,
                      top: `${rect.y}%`,
                      width: `${rect.width}%`,
                      height: `${rect.height}%`,
                      backgroundColor: ann.color,
                      opacity: 0.45,
                    }}
                  />
                ))
              ) : (
                <div
                  key={ann.id}
                  className="absolute max-w-[200px] rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-900 shadow-sm"
                  style={{ left: `${ann.x}%`, top: `${ann.y}%` }}
                >
                  {ann.text}
                </div>
              ),
            )}
          </div>

          {pendingNote && (
            <div
              className="absolute z-10 w-48 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
              style={{ left: `${pendingNote.x}%`, top: `${pendingNote.y}%` }}
              onClick={(e) => e.stopPropagation()}
            >
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t("contentLibrary.pdf.notePlaceholder")}
                className="w-full resize-none rounded border border-slate-200 p-1 text-xs"
                rows={3}
                autoFocus
              />
              <div className="mt-1 flex justify-end gap-1">
                <button
                  type="button"
                  className="text-xs text-slate-500"
                  onClick={() => setPendingNote(null)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-brand-600"
                  onClick={submitNote}
                >
                  {t("common.save")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
