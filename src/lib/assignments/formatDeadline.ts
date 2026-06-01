export interface FormattedDeadline {
  label: string;
  timeZone: string;
  offsetLabel: string;
}

export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function getTimeZoneOffsetLabel(
  date: Date,
  timeZone: string,
): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(date);
    const offset = parts.find((p) => p.type === "timeZoneName")?.value;
    if (offset) return offset;
  } catch {
    /* fall through */
  }
  return timeZone;
}

/** e.g. "Due 15 May 2026 at 11:59 PM (your time, GMT+5:30)" */
export function formatAssignmentDeadline(
  isoUtc: string,
  duePrefix: string,
  yourTimeLabel: string,
  timeZone?: string,
): FormattedDeadline {
  const tz = timeZone ?? getUserTimeZone();
  const date = new Date(isoUtc);

  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  const offsetLabel = getTimeZoneOffsetLabel(date, tz);

  return {
    label: `${duePrefix} ${datePart} at ${timePart} (${yourTimeLabel}, ${offsetLabel})`,
    timeZone: tz,
    offsetLabel,
  };
}

export function formatSubmittedAtLocal(
  isoUtc: string,
  timeZone?: string,
): string {
  const tz = timeZone ?? getUserTimeZone();
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoUtc));
}

export function isPastDeadline(deadlineIso: string): boolean {
  return Date.now() > new Date(deadlineIso).getTime();
}
