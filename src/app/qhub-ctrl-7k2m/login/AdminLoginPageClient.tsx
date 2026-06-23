"use client";

import dynamic from "next/dynamic";

const AdminLoginForm = dynamic(
  () => import("@/components/admin/AdminLoginForm").then((m) => m.AdminLoginForm),
  { ssr: false },
);

export default function AdminLoginPageClient() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900 mb-1">QHub Admin</h1>
        <p className="text-xs text-gray-500 mb-6">Вход по email и паролю</p>
        <AdminLoginForm />
      </div>
    </div>
  );
}
