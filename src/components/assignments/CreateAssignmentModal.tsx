/* eslint-disable */
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useState, type FormEvent } from "react";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface CreateAssignmentModalProps {
  courseId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface CriterionInput {
  criterion: string;
  descriptor: string;
  maxMarks: number;
}

export function CreateAssignmentModal({
  courseId,
  open,
  onClose,
  onCreated,
}: CreateAssignmentModalProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [latePolicyType, setLatePolicyType] = useState<"percentage_per_day" | "hard_cutoff">("percentage_per_day");
  const [deductionPercent, setDeductionPercent] = useState(10);
  const [rubric, setRubric] = useState<CriterionInput[]>([
    { criterion: "Accuracy", descriptor: "Correctness of the work", maxMarks: 10 },
  ]);
  const [file, setFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const addCriterion = () => {
    setRubric([...rubric, { criterion: "", descriptor: "", maxMarks: 5 }]);
  };

  const removeCriterion = (index: number) => {
    setRubric(rubric.filter((_, i) => i !== index));
  };

  const updateCriterion = (index: number, field: keyof CriterionInput, value: any) => {
    const updated = [...rubric];
    updated[index] = { ...updated[index], [field]: value };
    setRubric(updated);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      let fileKey: string | null = null;
      let fileName: string | null = null;

      if (file) {
        setUploadingFile(true);
        setUploadProgress(0);

        const presignFd = new FormData();
        presignFd.append("file", file);
        const presignRes = await fetch(`/api/courses/${courseId}/assignments/presign`, {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: presignFd,
        });

        if (!presignRes.ok) {
          throw new Error("Failed to get upload URL");
        }

        const presignData = await presignRes.json();

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", presignData.uploadUrl);
          xhr.setRequestHeader("Content-Type", "application/pdf");
          xhr.upload.onprogress = (progressEvent) => {
            if (progressEvent.lengthComputable) {
              setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error("File upload failed"));
          };
          xhr.onerror = () => reject(new Error("File upload failed"));
          xhr.send(file);
        });

        fileKey = presignData.fileKey;
        fileName = presignData.fileName;
        setUploadingFile(false);
        setUploadProgress(null);
      }

      const deadlineUtc = new Date(deadline).toISOString();
      const payload = {
        title,
        description,
        deadlineUtc,
        fileKey,
        fileName,
        rubric,
        latePolicy: {
          type: latePolicyType,
          deductionPercent: latePolicyType === "percentage_per_day" ? deductionPercent : 100,
        },
      };

      const res = await fetch(`/api/courses/${courseId}/assignments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await res.text() || "Failed to create assignment");
      }

      onCreated();
      onClose();
      // Reset form
      setTitle("");
      setDescription("");
      setDeadline("");
      setFile(null);
      setLatePolicyType("percentage_per_day");
      setDeductionPercent(10);
      setRubric([{ criterion: "Accuracy", descriptor: "Correctness of the work", maxMarks: 10 }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
      setUploadingFile(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-2xl overflow-y-auto max-h-[90vh] rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Create New Assignment</h2>
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-slate-700">Assignment Title</label>
            <input
              id="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-slate-700">Description / Instructions</label>
            <textarea
              id="description"
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Attach Assignment PDF (Optional)</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={submitting}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 file:cursor-pointer hover:file:bg-brand-100"
              />
              {file && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            {uploadProgress !== null && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-slate-600 mb-1">
                  <span>Uploading attachment...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-600" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="deadline" className="block text-sm font-medium text-slate-700">Deadline (Local Time)</label>
              <input
                id="deadline"
                type="datetime-local"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="policy" className="block text-sm font-medium text-slate-700">Late Submission Policy</label>
              <select
                id="policy"
                value={latePolicyType}
                onChange={(e) => setLatePolicyType(e.target.value as any)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="percentage_per_day">Deduct percentage per day late</option>
                <option value="hard_cutoff">Hard cutoff (No late submissions)</option>
              </select>
            </div>
          </div>

          {latePolicyType === "percentage_per_day" && (
            <div>
              <label htmlFor="deduction" className="block text-sm font-medium text-slate-700">Deduction % per day late</label>
              <input
                id="deduction"
                type="number"
                min={0}
                max={100}
                required
                value={deductionPercent}
                onChange={(e) => setDeductionPercent(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-slate-700">Grading Rubric</h3>
              <button
                type="button"
                onClick={addCriterion}
                className="text-xs font-semibold text-brand-600 hover:underline"
              >
                + Add Criterion
              </button>
            </div>

            <div className="space-y-3">
              {rubric.map((item, index) => (
                <div key={index} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-500">Criterion #{index + 1}</span>
                    {rubric.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCriterion(index)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
                    <input
                      type="text"
                      placeholder="Criterion (e.g. Structure)"
                      required
                      value={item.criterion}
                      onChange={(e) => updateCriterion(index, "criterion", e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Max Marks"
                      required
                      min={1}
                      value={item.maxMarks}
                      onChange={(e) => updateCriterion(index, "maxMarks", Number(e.target.value))}
                      className="rounded border border-slate-300 px-2 py-1 text-sm text-center"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Criterion Description (e.g. Followed layout guidelines)"
                    required
                    value={item.descriptor}
                    onChange={(e) => updateCriterion(index, "descriptor", e.target.value)}
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Assignment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
