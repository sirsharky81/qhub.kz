import Link from "next/link";
import type { ReactNode } from "react";

interface PdfToolLayoutProps {
  title: string;
  icon?: string;
  children: ReactNode;
  badge?: ReactNode;
  /** Корневой контейнер страницы */
  shellClassName?: string;
}

export function PdfToolLayout({
  title,
  icon = "📄",
  children,
  badge,
  shellClassName = "min-h-screen bg-white",
}: PdfToolLayoutProps) {
  return (
    <div className={`flex flex-col ${shellClassName}`}>
      <div className="flex-shrink-0 h-11 border-b border-gray-200 bg-white flex items-center px-4 gap-3 print:hidden">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="QHub" className="w-full h-full object-cover" />
          </div>
          <span className="font-medium">QHub.kz</span>
        </Link>

        <span className="text-gray-300 select-none">/</span>

        <div className="flex items-center gap-1.5">
          <span className="text-base" aria-hidden>
            {icon}
          </span>
          <span className="text-sm font-medium text-gray-800">{title}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {badge ?? (
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-emerald-200 text-emerald-600 bg-emerald-50">
              live
            </span>
          )}
          <Link
            href="/"
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors hidden sm:block"
          >
            ← Все приложения
          </Link>
        </div>
      </div>

      {children}
    </div>
  );
}
