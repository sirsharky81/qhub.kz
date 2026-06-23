import type { Metadata } from "next";
import AdminLoginPageClient from "./AdminLoginPageClient";

export const metadata: Metadata = {
  title: "Вход",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return <AdminLoginPageClient />;
}
