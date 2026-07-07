"use client";

import { LibraryTreeSidebar } from "@/components/content-library/LibraryTreeSidebar";
import { PdfViewerPanel } from "@/components/content-library/pdf/PdfViewerPanel";
import { VideoUploadZone } from "@/components/content-library/upload/VideoUploadZone";
import { VideoPlayerPanel } from "@/components/content-library/video/VideoPlayerPanel";
import { ChalkboardIllustration } from "@/components/illustrations/EmptyIllustrations";
import { CourseGridSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { useContentLibrary } from "@/hooks/useContentLibrary";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { LibraryItem, LibraryPdfItem, LibraryVideoItem } from "@/types/content";
import { useCallback, useState } from "react";

interface ContentLibraryProps {
  courseId: string;
  role: "student" | "teacher";
}

export function ContentLibrary({ courseId, role }: ContentLibraryProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const isTeacher = role === "teacher";
  const { library, isLoading, mutate } = useContentLibrary(courseId, isTeacher);
  const [selected, setSelected] = useState<LibraryItem | null>(null);

  const handleRetry = useCallback(
    async (itemId: string) => {
      if (!token) return;
      await fetch(`/api/courses/${courseId}/library/${itemId}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await mutate();
    },
    [courseId, token, mutate],
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <CourseGridSkeleton count={3} />
      </div>
    );
  }

  const hasContent = library.weeks.length > 0;

  if (!hasContent) {
    return (
      <EmptyState
        illustration={<ChalkboardIllustration />}
        title={t("courseShell.empty.contentTitle")}
        description={isTeacher ? t("courseShell.empty.contentDescription") : t("courseShell.empty.contentStudentDescription")}
      />
    );
  }

  return (
    <div className="flex h-[min(720px,calc(100vh-12rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="w-full shrink-0 lg:w-64 lg:max-w-xs">
          <LibraryTreeSidebar
            weeks={library.weeks}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            isTeacher={isTeacher}
            onRetry={isTeacher ? handleRetry : undefined}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
              {t("contentLibrary.selectItem")}
            </div>
          ) : selected.type === "pdf" ? (
            <PdfViewerPanel
              courseId={courseId}
              item={selected as LibraryPdfItem}
              canAnnotate={!isTeacher}
            />
          ) : (
            <VideoPlayerPanel
              courseId={courseId}
              item={selected as LibraryVideoItem}
              canTakeNotes={!isTeacher}
            />
          )}
        </div>
      </div>

      {isTeacher && (
        <VideoUploadZone
          courseId={courseId}
          onUploadComplete={() => void mutate()}
        />
      )}
    </div>
  );
}
