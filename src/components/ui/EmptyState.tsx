"use client";

import type { ReactNode } from "react";

interface EmptyStateProps {
  illustration: ReactNode;
  title: string;
  description: string;
  cta?: ReactNode;
}

export function EmptyState({
  illustration,
  title,
  description,
  cta,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="mb-6 text-slate-300">{illustration}</div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-600">{description}</p>
      {cta && <div className="mt-6">{cta}</div>}
    </div>
  );
}
