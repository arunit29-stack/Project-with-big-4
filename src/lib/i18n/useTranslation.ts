"use client";

import en from "@/locales/en.json";
import { useCallback, useMemo } from "react";

type Messages = typeof en;

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return path;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(vars[key] ?? `{{${key}}}`),
  );
}

export function useTranslation() {
  const messages = useMemo(() => en as Messages, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = getNestedValue(
        messages as unknown as Record<string, unknown>,
        key,
      );
      return interpolate(raw, vars);
    },
    [messages],
  );

  return { t, messages };
}
