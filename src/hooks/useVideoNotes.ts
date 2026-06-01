"use client";

import { useAuth } from "@/contexts/AuthContext";
import { authFetcher } from "@/lib/api/fetcher";
import type { VideoNote } from "@/types/content";
import { useCallback } from "react";
import useSWR from "swr";

export function useVideoNotes(courseId: string, videoId: string | null) {
  const { token } = useAuth();
  const key =
    token && videoId
      ? [`/api/courses/${courseId}/videos/${videoId}/notes`, token]
      : null;

  const swr = useSWR<{ notes: VideoNote[] }>(
    key,
    ([url, t]: [string, string]) =>
      authFetcher<{ notes: VideoNote[] }>(url, t),
  );

  const addNote = useCallback(
    async (timestamp: number, text: string) => {
      if (!token || !videoId) return;
      const res = await fetch(
        `/api/courses/${courseId}/videos/${videoId}/notes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ timestamp, text }),
        },
      );
      if (res.ok) {
        const { note } = (await res.json()) as { note: VideoNote };
        await swr.mutate(
          { notes: [...(swr.data?.notes ?? []), note] },
          { revalidate: true },
        );
      }
    },
    [courseId, videoId, token, swr],
  );

  return {
    notes: swr.data?.notes ?? [],
    isLoading: swr.isLoading,
    addNote,
  };
}
