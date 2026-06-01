"use client";

import { useAuth } from "@/contexts/AuthContext";
import { authFetcher } from "@/lib/api/fetcher";
import { filterLibraryForStudent } from "@/lib/content/filterLibrary";
import type { ContentLibraryResponse } from "@/types/content";
import useSWR from "swr";

export function useContentLibrary(
  courseId: string,
  isTeacher: boolean,
) {
  const { token } = useAuth();

  const swr = useSWR<ContentLibraryResponse>(
    token ? [`/api/courses/${courseId}/library`, token] : null,
    ([url, t]) => authFetcher<ContentLibraryResponse>(url as string, t as string),
    { refreshInterval: isTeacher ? 2000 : 0 },
  );

  const raw = swr.data ?? { weeks: [] };
  const library = isTeacher ? raw : filterLibraryForStudent(raw);

  return {
    library,
    isLoading: swr.isLoading,
    mutate: swr.mutate,
  };
}
