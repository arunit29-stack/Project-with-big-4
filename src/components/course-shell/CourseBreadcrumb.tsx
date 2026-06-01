"use client";

import { TAB_I18N_KEYS } from "@/lib/courses/tabs";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { CourseTabId } from "@/types/course";
import Link from "next/link";

interface CourseBreadcrumbProps {
  homeHref: string;
  courseName: string;
  activeTab: CourseTabId;
}

export function CourseBreadcrumb({
  homeHref,
  courseName,
  activeTab,
}: CourseBreadcrumbProps) {
  const { t } = useTranslation();

  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-600">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href={homeHref} className="hover:text-brand-700">
            {t("platform.name")}
          </Link>
        </li>
        <li aria-hidden className="text-slate-400">
          /
        </li>
        <li className="font-medium text-slate-800">{courseName}</li>
        <li aria-hidden className="text-slate-400">
          /
        </li>
        <li className="text-slate-500">{t(TAB_I18N_KEYS[activeTab])}</li>
      </ol>
    </nav>
  );
}
