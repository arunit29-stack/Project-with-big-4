"use client";

import { withAuth } from "@/components/auth/withAuth";
import { withRole } from "@/components/auth/withRole";
import { AuthenticatedShell } from "@/components/layout/AuthenticatedShell";
import { TeacherDashboardView } from "@/components/teacher/TeacherDashboardView";

function DashboardPage() {
  return (
    <AuthenticatedShell>
      <TeacherDashboardView />
    </AuthenticatedShell>
  );
}

export default withAuth(withRole(["teacher"], DashboardPage));
