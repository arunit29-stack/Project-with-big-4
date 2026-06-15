const SESSION_BEACON_URL = "/api/auth/logout";

/** Fire-and-forget session teardown beacon (EXIT_ON_CLOSE). */
export function sendSessionBeacon(token: string | null): void {
  if (!token || typeof navigator === "undefined" || !navigator.sendBeacon) {
    return;
  }
  const blob = new Blob([token], { type: "text/plain" });
  navigator.sendBeacon(SESSION_BEACON_URL, blob);
}
