"use client";

import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

export default function AdminLoginPageClient() {
  return (
    <div className="min-h-[100dvh] bg-gray-50 px-4 py-8 sm:py-16">
      <div className="w-full max-w-sm mx-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900 mb-1">QHub Admin</h1>
        <p className="text-xs text-gray-500 mb-6">Вход по email и паролю</p>
        <AdminLoginForm />
      </div>
    </div>
  );
}
