"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCatalog } from "@/contexts/CatalogContext";
import { ADMIN_PANEL_PATH } from "@/lib/admin/panel-path";

export function AdminViewBadge() {
  const { isAdmin } = useCatalog();
  const pathname = usePathname();

  if (!isAdmin) return null;
  if (pathname?.startsWith(`/${ADMIN_PANEL_PATH}`)) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-1.5 pointer-events-none"
      aria-live="polite"
    >
      <span className="pointer-events-auto text-[10px] font-mono uppercase tracking-wider px-2.5 py-1.5 rounded-full border border-violet-200 bg-violet-50/95 text-violet-800 shadow-sm backdrop-blur-sm">
        Просмотр: админ-доступ
      </span>
      <Link
        href={`/${ADMIN_PANEL_PATH}`}
        className="pointer-events-auto text-[10px] font-medium px-2.5 py-1 rounded-full border border-gray-200 bg-white/95 text-gray-600 hover:text-gray-900 shadow-sm backdrop-blur-sm"
      >
        Админ-панель
      </Link>
    </div>
  );
}
