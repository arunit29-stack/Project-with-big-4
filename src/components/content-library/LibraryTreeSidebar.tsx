"use client";

import { StatusChip } from "@/components/content-library/StatusChip";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { LibraryItem, LibraryWeek } from "@/types/content";
import { useState } from "react";

interface LibraryTreeSidebarProps {
  weeks: LibraryWeek[];
  selectedId: string | null;
  onSelect: (item: LibraryItem) => void;
  isTeacher: boolean;
  onRetry?: (itemId: string) => void;
}

export function LibraryTreeSidebar({
  weeks,
  selectedId,
  onSelect,
  isTeacher,
  onRetry,
}: LibraryTreeSidebarProps) {
  const { t } = useTranslation();
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(
    () => new Set(weeks.map((w) => w.id)),
  );
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    weeks.forEach((w) => w.topics.forEach((tp) => ids.add(tp.id)));
    return ids;
  });

  function toggleWeek(id: string) {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTopic(id: string) {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (weeks.length === 0) {
    return (
      <p className="p-4 text-sm text-slate-500">{t("contentLibrary.tree.empty")}</p>
    );
  }

  return (
    <nav
      aria-label={t("contentLibrary.tree.label")}
      className="h-full overflow-y-auto border-r border-slate-200 bg-white"
    >
      <ul className="py-2">
        {weeks.map((week) => (
          <li key={week.id}>
            <button
              type="button"
              onClick={() => toggleWeek(week.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Chevron open={expandedWeeks.has(week.id)} />
              {week.title}
            </button>
            {expandedWeeks.has(week.id) && (
              <ul className="ml-2 border-l border-slate-100">
                {week.topics.map((topic) => (
                  <li key={topic.id}>
                    <button
                      type="button"
                      onClick={() => toggleTopic(topic.id)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Chevron open={expandedTopics.has(topic.id)} />
                      {topic.title}
                    </button>
                    {expandedTopics.has(topic.id) && (
                      <ul className="pb-1">
                        {topic.items.map((item) => {
                          const clickable =
                            isTeacher || item.status === "ready";

                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                disabled={!clickable}
                                onClick={() => clickable && onSelect(item)}
                                className={`flex w-full flex-col gap-1 px-4 py-2 text-left text-sm transition ${
                                  selectedId === item.id
                                    ? "bg-brand-50 text-brand-800"
                                    : clickable
                                      ? "text-slate-600 hover:bg-slate-50"
                                      : "cursor-not-allowed text-slate-400"
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  <FileIcon type={item.type} />
                                  <span className="flex-1 truncate">{item.title}</span>
                                </span>
                                {isTeacher && (
                                  <StatusChip
                                    status={item.status}
                                    uploadProgress={
                                      item.type === "video"
                                        ? item.uploadProgress
                                        : undefined
                                    }
                                    onRetry={
                                      item.status === "failed" && onRetry
                                        ? () => onRetry(item.id)
                                        : undefined
                                    }
                                  />
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function FileIcon({ type }: { type: "pdf" | "video" }) {
  if (type === "pdf") {
    return (
      <svg className="h-4 w-4 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path d="M4 2h8l4 4v12H4V2zm7 1v3h3" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 shrink-0 text-violet-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M3 5a2 2 0 012-2h6l4 4v8a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
    </svg>
  );
}
