"use client";

import { useTranslation } from "@/lib/i18n/useTranslation";
import type { RubricCriterion } from "@/types/assignment";

interface RubricDisplayProps {
  criteria: RubricCriterion[];
}

export function RubricDisplay({ criteria }: RubricDisplayProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
        {t("assignments.rubric.title")}
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
            <th className="px-4 py-2 font-medium">{t("assignments.rubric.criterion")}</th>
            <th className="px-4 py-2 font-medium">{t("assignments.rubric.descriptor")}</th>
            <th className="px-4 py-2 font-medium text-right">{t("assignments.rubric.maxMarks")}</th>
          </tr>
        </thead>
        <tbody>
          {criteria.map((c) => (
            <tr key={c.id} className="border-b border-slate-50 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-800">{c.title}</td>
              <td className="px-4 py-3 text-slate-600">{c.descriptor}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                {c.maxMarks}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
