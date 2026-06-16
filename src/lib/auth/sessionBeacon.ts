const SESSION_BEACON_URL = "/api/auth/session-beacon";

/** Fire-and-forget session teardown beacon (EXIT_ON_CLOSE). */
export function sendSessionBeacon(token: string | null): void {
  if (!token || typeof navigator === "undefined" || !navigator.sendBeacon) {
    return;
  }
  const blob = new Blob([token], { type: "text/plain" });
  navigator.sendBeacon(SESSION_BEACON_URL, blob);
}

export function registerSessionBeaconHandlers(token: string): () => void {
  const onBeforeUnload = () => sendSessionBeacon(token);
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      sendSessionBeacon(token);
    }
  };

  window.addEventListener("beforeunload", onBeforeUnload);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    window.removeEventListener("beforeunload", onBeforeUnload);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
