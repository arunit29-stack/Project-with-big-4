"use client";

import { useEffect, useState } from "react";
import type { ServerConfig } from "@/types/auth";

export function useServerConfig() {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/config")
      .then((res) => res.json())
      .then((data: ServerConfig) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) {
          setConfig({ institutionSSOConfigured: false });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loading };
}
