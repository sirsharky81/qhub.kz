import Link from "next/link";
import type { ReactNode } from "react";

interface PdfToolLayoutProps {
  title: string;
  icon?: string;
  /** PNG/SVG app icon (preferred over emoji) */
  iconSrc?: string;
  children: ReactNode;
  badge?: ReactNode | false;
  /** Корневой контейнер страницы */
  shellClassName?: string;
}

export function PdfToolLayout({
  title,
  icon = "📄",
  iconSrc,
  children,
  badge,
  shellClassName = "min-h-screen bg-white",
}: PdfToolLayoutProps) {
  return (
    <div className={`flex flex-col ${shellClassName}`}>
      <div className="flex-shrink-0 min-h-11 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 print:hidden">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors shrink-0"
        >
          <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png?v=4" alt="QHub" className="w-full h-full object-cover" />
          </div>
          <span className="font-medium sm:hidden">QHub</span>
          <span className="font-medium hidden sm:inline">QHub.kz</span>
        </Link>

        <span className="text-gray-300 select-none shrink-0">/</span>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {iconSrc ? (
            <div className="w-5 h-5 rounded-[22%] overflow-hidden flex-shrink-0 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconSrc} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <span className="text-base shrink-0" aria-hidden>
              {icon}
            </span>
          )}
          <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
            {title}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {badge === false
            ? null
            : (badge ?? (
                <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-emerald-200 text-emerald-600 bg-emerald-50">
                  live
                </span>
              ))}
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
