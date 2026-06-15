import type { ReactNode } from "react";
import QHubBrandLink from "./QHubBrandLink";

interface ServicePageHeaderProps {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export default function ServicePageHeader({
  children,
  trailing,
  className = "",
}: ServicePageHeaderProps) {
  return (
    <header
      className={`flex-shrink-0 border-b border-gray-200 bg-white/90 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/90 ${className}`.trim()}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center gap-2 sm:gap-3">
        <QHubBrandLink />
        {children}
        {trailing != null && (
          <div className="ml-auto flex items-center gap-2 shrink-0">{trailing}</div>
        )}
      </div>
    </header>
  );
}
