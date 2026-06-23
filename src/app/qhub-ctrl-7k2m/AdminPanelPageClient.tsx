"use client";

import dynamic from "next/dynamic";

const AdminDashboard = dynamic(
  () => import("@/components/admin/AdminDashboard").then((m) => m.AdminDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Загрузка…
      </div>
    ),
  },
);

export default function AdminPanelPageClient() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <AdminDashboard />
      </div>
    </div>
  );
}
