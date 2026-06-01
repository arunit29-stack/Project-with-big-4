"use client";

import {
  confirmSubmission,
  presignSubmission,
  uploadToS3,
} from "@/lib/assignments/submitPdf";
import {
  getAllOfflineSubmissions,
  removeOfflineSubmission,
} from "@/lib/assignments/offlineSubmissions";
import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useCallback, useEffect, useState } from "react";

export function useOfflineSubmissionSync(
  courseId: string,
  onSynced?: () => void,
) {
  const { token, user } = useAuth();
  const online = useOnlineStatus();
  const [syncing, setSyncing] = useState(false);
  const [hasPending, setHasPending] = useState(false);

  const refreshPending = useCallback(async () => {
    const all = await getAllOfflineSubmissions();
    setHasPending(
      all.some((s) => s.courseId === courseId),
    );
  }, [courseId]);

  const syncAll = useCallback(async () => {
    if (!token || !online) return;
    const pending = await getAllOfflineSubmissions();
    const forCourse = pending.filter((p) => p.courseId === courseId);
    if (forCourse.length === 0) return;

    setSyncing(true);
    try {
      for (const entry of forCourse) {
        const file = new File([entry.fileData], entry.fileName, {
          type: entry.mimeType,
        });
        const presign = await presignSubmission(
          entry.courseId,
          entry.assignmentId,
          entry.fileName,
          token,
        );
        await uploadToS3(presign.uploadUrl, file, () => {});
        await confirmSubmission(
          entry.courseId,
          entry.assignmentId,
          entry.fileName,
          presign.submissionToken,
          token,
          user?.email ?? "Student",
        );
        await removeOfflineSubmission(entry.id);
      }
      onSynced?.();
    } finally {
      setSyncing(false);
      await refreshPending();
    }
  }, [token, online, courseId, user, onSynced, refreshPending]);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    if (online) void syncAll();
  }, [online, syncAll]);

  return { syncing, hasPending, refreshPending, syncAll };
}
