"use client";

import {
  DEFAULT_TAB,
  isPhase2Tab,
  isValidTab,
  TAB_I18N_KEYS,
} from "@/lib/courses/tabs";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { COURSE_TAB_IDS, type CourseTabId } from "@/types/course";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CourseSidebarInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get("tab");
  const activeTab: CourseTabId = isValidTab(rawTab) ? rawTab : DEFAULT_TAB;

  function setTab(tab: CourseTabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <nav aria-label="Course sections" className="w-full shrink-0 lg:w-56">
      <ul className="space-y-1">
        {COURSE_TAB_IDS.map((tab) => {
          const disabled = isPhase2Tab(tab);
          const isActive = activeTab === tab;

          return (
            <li key={tab}>
              <button
                type="button"
                disabled={disabled}
                title={disabled ? t("common.comingSoonTooltip") : undefined}
                onClick={() => setTab(tab)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                  disabled
                    ? "cursor-not-allowed text-slate-400"
                    : isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  {t(TAB_I18N_KEYS[tab])}
                  {disabled && (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {t("common.comingSoon")}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function CourseSidebar() {
  return (
    <Suspense
      fallback={
        <div className="w-full space-y-2 lg:w-56">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      }
    >
      <CourseSidebarInner />
    </Suspense>
  );
}
