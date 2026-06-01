"use client";

import {
  ChalkboardIllustration,
  ClipboardIllustration,
  GroupsIllustration,
  QuizIllustration,
} from "@/components/illustrations/EmptyIllustrations";
import { AssignmentPortal } from "@/components/assignments/AssignmentPortal";
import { ContentLibrary } from "@/components/content-library/ContentLibrary";
import { EmptyState } from "@/components/ui/EmptyState";
import { LiveSession } from "@/components/live-session/LiveSession";
import { LiveQuiz } from "@/components/live-quiz/LiveQuiz";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { CourseTabId } from "@/types/course";

interface CourseTabPanelProps {
  tab: CourseTabId;
  courseId?: string;
  role?: "student" | "teacher";
}

export function CourseTabPanel({ tab, courseId, role }: CourseTabPanelProps) {
  const { t } = useTranslation();

  switch (tab) {
    case "content-library":
      if (courseId && role) {
        return <ContentLibrary courseId={courseId} role={role} />;
      }
      return (
        <EmptyState
          illustration={<ChalkboardIllustration />}
          title={t("courseShell.empty.contentTitle")}
          description={t("courseShell.empty.contentDescription")}
          cta={
            <span className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white opacity-60">
              {t("courseShell.empty.contentCta")}
            </span>
          }
        />
      );
    case "assignments":
      if (courseId && role) {
        return (
          <AssignmentPortal
            courseId={courseId}
            role={role}
            basePath={role === "teacher" ? "dashboard" : "class"}
          />
        );
      }
      return (
        <EmptyState
          illustration={<ClipboardIllustration />}
          title={t("courseShell.empty.assignmentsTitle")}
          description={t("courseShell.empty.assignmentsDescription")}
          cta={
            <span className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white opacity-60">
              {t("courseShell.empty.assignmentsCta")}
            </span>
          }
        />
      );
    case "quizzes":
      if (courseId && role) {
        return <LiveQuiz courseId={courseId} role={role} />;
      }
      return (
        <EmptyState
          illustration={<QuizIllustration />}
          title={t("courseShell.empty.quizzesTitle")}
          description={t("courseShell.empty.quizzesDescription")}
          cta={
            <span className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white opacity-60">
              {t("courseShell.empty.quizzesCta")}
            </span>
          }
        />
      );
    case "live-session":
      if (courseId && role) {
        return <LiveSession courseId={courseId} role={role} />;
      }
      return (
        <EmptyState
          illustration={<ChalkboardIllustration />}
          title={t("courseShell.empty.liveTitle")}
          description={t("courseShell.empty.liveDescription")}
          cta={
            <span className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white opacity-60">
              {t("courseShell.empty.liveCta")}
            </span>
          }
        />
      );
    case "group-rooms":
      return (
        <EmptyState
          illustration={<GroupsIllustration />}
          title={t("courseShell.empty.groupsTitle")}
          description={t("courseShell.empty.groupsDescription")}
          cta={
            <span className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white opacity-60">
              {t("courseShell.empty.groupsCta")}
            </span>
          }
        />
      );
    case "ai-assistant":
      return null;
    default:
      return null;
  }
}
