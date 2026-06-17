const SESSION_BEACON_URL = "/api/auth/session-beacon";
let beaconSent = false;

/** Fire-and-forget session teardown beacon (EXIT_ON_CLOSE). */
export function sendSessionBeacon(token: string | null): void {
  if (
    process.env.NODE_ENV === "development" ||
    beaconSent ||
    !token ||
    typeof navigator === "undefined" ||
    !navigator.sendBeacon
  ) {
    return;
  }
  beaconSent = true;
  const blob = new Blob([token], { type: "text/plain" });
  navigator.sendBeacon(SESSION_BEACON_URL, blob);
}

export function registerSessionBeaconHandlers(token: string): () => void {
  beaconSent = false;
  const onBeforeUnload = () => sendSessionBeacon(token);
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      sendSessionBeacon(token);
    }
  };

  window.addEventListener("beforeunload", onBeforeUnload);
  if (process.env.NODE_ENV !== "development") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return () => {
    window.removeEventListener("beforeunload", onBeforeUnload);
    if (process.env.NODE_ENV !== "development") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}
