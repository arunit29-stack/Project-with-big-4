"use client";

import { useTranslation } from "@/lib/i18n/useTranslation";
import type {
  Assessment,
  CriterionScore,
  RubricCriterion,
  TeacherSubmissionRow,
} from "@/types/assignment";
import { useMemo, useState } from "react";

interface RubricScoringFormProps {
  criteria: RubricCriterion[];
  submission: TeacherSubmissionRow;
  onAssess: (assessment: Assessment, waiveLatePenalty: boolean) => Promise<void>;
}

export function RubricScoringForm({
  criteria,
  submission,
  onAssess,
}: RubricScoringFormProps) {
  const { t } = useTranslation();
  const [scores, setScores] = useState<Record<string, CriterionScore>>(() => {
    const init: Record<string, CriterionScore> = {};
    criteria.forEach((c) => {
      init[c.id] = {
        criterionId: c.id,
        score: submission.assessment?.criteriaScores.find(
          (s) => s.criterionId === c.id,
        )?.score ?? 0,
        comment:
          submission.assessment?.criteriaScores.find(
            (s) => s.criterionId === c.id,
          )?.comment ?? "",
      };
    });
    return init;
  });
  const [overallFeedback, setOverallFeedback] = useState(
    submission.assessment?.overallFeedback ?? "",
  );
  const [waiveLate, setWaiveLate] = useState(submission.latePenaltyWaived);
  const [submitting, setSubmitting] = useState(false);

  const allScored = useMemo(
    () =>
      criteria.every((c) => {
        const s = scores[c.id];
        return (
          s &&
          s.score >= 0 &&
          s.score <= c.maxMarks &&
          Number.isFinite(s.score)
        );
      }),
    [criteria, scores],
  );

  const totalMarks = useMemo(
    () => Object.values(scores).reduce((sum, s) => sum + (s?.score ?? 0), 0),
    [scores],
  );

  const maxMarks = criteria.reduce((s, c) => s + c.maxMarks, 0);

  const effectivePenalty =
    submission.isLate && !waiveLate
      ? submission.latePenaltyPercent
      : 0;

  async function handleSubmit() {
    if (!allScored) return;
    setSubmitting(true);
    try {
      const assessment: Assessment = {
        criteriaScores: criteria.map((c) => scores[c.id]),
        overallFeedback,
        totalMarks: Math.round(totalMarks * (1 - effectivePenalty / 100)),
        maxMarks,
        assessedAt: new Date().toISOString(),
      };
      await onAssess(assessment, waiveLate);
    } finally {
      setSubmitting(false);
    }
  }

  if (submission.status === "assessed" && submission.assessment) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
        <p className="font-semibold text-emerald-900">
          {t("assignments.teacher.alreadyAssessed", {
            marks: submission.assessment.totalMarks,
            max: submission.assessment.maxMarks,
          })}
        </p>
        <p className="mt-2 text-emerald-800">
          {submission.assessment.overallFeedback}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-semibold text-slate-900">
        {t("assignments.teacher.scoringTitle")}
      </h4>

      {criteria.map((c) => (
        <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-medium text-slate-800">
            {c.title}{" "}
            <span className="text-slate-500">
              ({t("assignments.rubric.maxMarks")}: {c.maxMarks})
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{c.descriptor}</p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min={0}
              max={c.maxMarks}
              value={scores[c.id]?.score ?? ""}
              onChange={(e) =>
                setScores((prev) => ({
                  ...prev,
                  [c.id]: {
                    ...prev[c.id],
                    criterionId: c.id,
                    score: Number(e.target.value),
                    comment: prev[c.id]?.comment ?? "",
                  },
                }))
              }
              className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
              aria-label={t("assignments.teacher.scoreFor", { title: c.title })}
            />
          </div>
          <textarea
            value={scores[c.id]?.comment ?? ""}
            onChange={(e) =>
              setScores((prev) => ({
                ...prev,
                [c.id]: {
                  ...prev[c.id],
                  criterionId: c.id,
                  score: prev[c.id]?.score ?? 0,
                  comment: e.target.value,
                },
              }))
            }
            placeholder={t("assignments.teacher.criterionComment")}
            className="mt-2 w-full resize-none rounded border border-slate-200 p-2 text-sm"
            rows={2}
          />
        </div>
      ))}

      <div>
        <label className="text-sm font-medium text-slate-700">
          {t("assignments.teacher.overallFeedback")}
        </label>
        <textarea
          value={overallFeedback}
          onChange={(e) => setOverallFeedback(e.target.value)}
          className="mt-1 w-full resize-none rounded-lg border border-slate-300 p-2 text-sm"
          rows={3}
        />
      </div>

      {submission.isLate && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={waiveLate}
            onChange={(e) => setWaiveLate(e.target.checked)}
            className="rounded border-slate-300"
          />
          {t("assignments.teacher.waiveLatePenalty", {
            percent: submission.latePenaltyPercent,
          })}
        </label>
      )}

      {submission.isLate && !waiveLate && (
        <p className="text-xs text-amber-700">
          {t("assignments.teacher.latePenaltyApplied", {
            percent: submission.latePenaltyPercent,
          })}
        </p>
      )}

      <button
        type="button"
        disabled={!allScored || submitting}
        onClick={() => void handleSubmit()}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitting
          ? t("common.loading")
          : t("assignments.teacher.markAssessed")}
      </button>
    </div>
  );
}
