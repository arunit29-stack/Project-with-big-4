"use client";

import { withAuth } from "@/components/auth/withAuth";
import { withRole } from "@/components/auth/withRole";
import { AuthenticatedShell } from "@/components/layout/AuthenticatedShell";

function AdminPage() {
  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold text-slate-900">Admin Console</h1>
      <p className="mt-2 text-slate-600">Institution administration.</p>
    </AuthenticatedShell>
  );
}

export default withAuth(withRole(["admin"], AdminPage));
