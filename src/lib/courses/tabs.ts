import type { CourseTabId } from "@/types/course";
import { COURSE_TAB_IDS, PHASE2_TABS } from "@/types/course";

export const DEFAULT_TAB: CourseTabId = "content-library";

export function isValidTab(tab: string | null): tab is CourseTabId {
  return tab !== null && COURSE_TAB_IDS.includes(tab as CourseTabId);
}

export function isPhase2Tab(tab: CourseTabId): boolean {
  return PHASE2_TABS.includes(tab);
}

export const TAB_I18N_KEYS: Record<CourseTabId, string> = {
  "content-library": "courseShell.tabs.contentLibrary",
  assignments: "courseShell.tabs.assignments",
  quizzes: "courseShell.tabs.quizzes",
  "live-session": "courseShell.tabs.liveSession",
  "group-rooms": "courseShell.tabs.groupRooms",
  "ai-assistant": "courseShell.tabs.aiAssistant",
};
