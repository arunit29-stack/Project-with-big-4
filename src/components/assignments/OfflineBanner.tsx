"use client";

import { useTranslation } from "@/lib/i18n/useTranslation";

interface OfflineBannerProps {
  show: boolean;
  syncing?: boolean;
}

export function OfflineBanner({ show, syncing }: OfflineBannerProps) {
  const { t } = useTranslation();

  if (!show && !syncing) return null;

  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      {syncing
        ? t("assignments.offline.syncing")
        : t("assignments.offline.banner")}
    </div>
  );
}
