"use client";

import ProtectedRoute from "@/components/core/ProtectedRoute";
import DashboardClient from "@/components/dashboard/DashboardClient";

export default function DashboardPage() {
  return (
    <ProtectedRoute requiredPermission="dashboard">
      <DashboardClient />
    </ProtectedRoute>
  );
}
