"use client";

import { useAuth } from "@/contexts/AuthContext";
import { authFetcher } from "@/lib/api/fetcher";
import type { PdfAnnotation } from "@/types/content";
import { useCallback } from "react";
import useSWR from "swr";

export function usePdfAnnotations(courseId: string, fileId: string | null) {
  const { token } = useAuth();
  const key =
    token && fileId
      ? [`/api/courses/${courseId}/annotations?fileId=${fileId}`, token]
      : null;

  const swr = useSWR<{ annotations: PdfAnnotation[] }>(
    key,
    ([url, t]: [string, string]) =>
      authFetcher<{ annotations: PdfAnnotation[] }>(url, t),
  );

  const persist = useCallback(
    async (annotations: PdfAnnotation[]) => {
      if (!token || !fileId) return;
      await fetch(`/api/courses/${courseId}/annotations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fileId, annotations }),
      });
      await swr.mutate({ annotations }, { revalidate: false });
    },
    [courseId, fileId, token, swr],
  );

  return {
    annotations: swr.data?.annotations ?? [],
    isLoading: swr.isLoading,
    persist,
    setLocal: (annotations: PdfAnnotation[]) =>
      swr.mutate({ annotations }, { revalidate: false }),
  };
}
