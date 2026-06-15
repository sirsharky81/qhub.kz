import Link from "next/link";
import type { ReactNode } from "react";
import ServicePageHeader from "@/components/ServicePageHeader";

interface PdfToolLayoutProps {
  title: string;
  icon?: string;
  /** PNG/SVG app icon (preferred over emoji) */
  iconSrc?: string;
  /** Custom title icon (overrides icon and iconSrc) */
  titleIcon?: ReactNode;
  children: ReactNode;
  badge?: ReactNode | false;
  /** Корневой контейнер страницы */
  shellClassName?: string;
}

const backLink = (
  <Link
    href="/"
    className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors hidden sm:block"
  >
    ← Все приложения
  </Link>
);

export function PdfToolLayout({
  title,
  icon = "📄",
  iconSrc,
  titleIcon,
  children,
  badge,
  shellClassName = "min-h-screen bg-white",
}: PdfToolLayoutProps) {
  return (
    <div className={`flex flex-col ${shellClassName}`}>
      <ServicePageHeader
        className="print:hidden"
        trailing={
          <>
            {badge === false
              ? null
              : (badge ?? (
                  <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-emerald-200 text-emerald-600 bg-emerald-50">
                    live
                  </span>
                ))}
            {backLink}
          </>
        }
      >
        <span className="text-gray-300 select-none shrink-0">/</span>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {titleIcon ??
            (iconSrc ? (
              <div className="w-5 h-5 rounded-[22%] overflow-hidden flex-shrink-0 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={iconSrc} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <span className="text-base shrink-0" aria-hidden>
                {icon}
              </span>
            ))}
          <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
            {title}
          </span>
        </div>
      </ServicePageHeader>

      {children}
    </div>
  );
}
