"use client";

import { useAuth } from "@/contexts/AuthContext";
import { authFetcher } from "@/lib/api/fetcher";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { usePathname } from "next/navigation";
import useSWR from "swr";

export function UnassessedNavBadge() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const pathname = usePathname();

  const match = pathname.match(/\/dashboard\/([^/]+)/);
  const courseId = match?.[1];

  const { data } = useSWR<{ count: number }>(
    user?.role === "teacher" && courseId && token
      ? [`/api/courses/${courseId}/assignments/unassessed-count`, token]
      : null,
    ([url, tk]: [string, string]) =>
      authFetcher<{ count: number }>(url, tk),
    { refreshInterval: 5000 },
  );

  const count = data?.count ?? 0;
  if (!courseId || count === 0) return null;

  return (
    <span
      className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white"
      title={t("assignments.teacher.unassessedBadge", { count })}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
