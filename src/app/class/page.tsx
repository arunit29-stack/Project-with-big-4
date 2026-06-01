"use client";

import { withAuth } from "@/components/auth/withAuth";
import { withRole } from "@/components/auth/withRole";
import { AuthenticatedShell } from "@/components/layout/AuthenticatedShell";
import { StudentClassView } from "@/components/student/StudentClassView";

function ClassPage() {
  return (
    <AuthenticatedShell>
      <StudentClassView />
    </AuthenticatedShell>
  );
}

export default withAuth(withRole(["student"], ClassPage));
