"use client";

import { useAuth } from "@/contexts/AuthContext";
import { authFetcher } from "@/lib/api/fetcher";
import type { TeacherCourse } from "@/types/course";
import useSWR from "swr";

const TEACHER_COURSES_KEY = "/api/teachers/me/courses";

interface TeacherCoursesResponse {
  courses: TeacherCourse[];
}

export function useTeacherCourses() {
  const { token } = useAuth();

  const swr = useSWR<TeacherCoursesResponse>(
    token ? [TEACHER_COURSES_KEY, token] : null,
    ([url, t]) =>
      authFetcher<TeacherCoursesResponse>(url as string, t as string),
  );

  return {
    courses: swr.data?.courses ?? [],
    isLoading: swr.isLoading,
    isValidating: swr.isValidating,
    error: swr.error,
    mutate: swr.mutate,
  };
}

export { TEACHER_COURSES_KEY };
