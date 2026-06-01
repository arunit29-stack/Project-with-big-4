"use client";

import { useAuth } from "@/contexts/AuthContext";
import { authFetcher } from "@/lib/api/fetcher";
import type { StudentCourse } from "@/types/course";
import useSWR from "swr";

const STUDENT_COURSES_KEY = "/api/students/me/courses";

interface StudentCoursesResponse {
  courses: StudentCourse[];
}

export function useStudentCourses() {
  const { token } = useAuth();

  const swr = useSWR<StudentCoursesResponse>(
    token ? [STUDENT_COURSES_KEY, token] : null,
    ([url, t]) =>
      authFetcher<StudentCoursesResponse>(url as string, t as string),
  );

  return {
    courses: swr.data?.courses ?? [],
    isLoading: swr.isLoading,
    isValidating: swr.isValidating,
    error: swr.error,
    mutate: swr.mutate,
  };
}

export { STUDENT_COURSES_KEY };
