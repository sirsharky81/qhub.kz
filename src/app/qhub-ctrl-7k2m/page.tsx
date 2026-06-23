import type { Metadata } from "next";
import AdminPanelPageClient from "./AdminPanelPageClient";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminPanelPage() {
  return <AdminPanelPageClient />;
}
