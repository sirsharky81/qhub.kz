const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

interface IconProps {
  className?: string;
}

export function IconCamera({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M4 8h3l1.5-2h7L17 8h3a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8a2 2 0 012-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function IconGallery({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M3 16l4.5-4.5a1 1 0 011.4 0L14 17l2.3-2.3a1 1 0 011.4 0L21 18" />
    </svg>
  );
}

export function IconUpload({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" />
      <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  );
}

export function IconDocument({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

export function IconPageAdd({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h3" />
      <path d="M14 3v5h5M12 18v4M10 20h4" />
    </svg>
  );
}

export function IconLayers({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 12l9 5 9-5M3 17l9 5 9-5" />
    </svg>
  );
}

export function IconSave({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}

export function IconPrint({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M7 9V3h10v6" />
      <rect x="5" y="9" width="14" height="8" rx="2" />
      <path d="M7 14h10v7H7z" />
    </svg>
  );
}

export function IconTextRecognize({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M4 7h16M4 12h10M4 17h14" />
      <path d="M17 10l3 2-3 2" />
    </svg>
  );
}

export function IconRotate({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M21 12a9 9 0 11-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function IconChevronLeft({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function IconChevronRight({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function IconScan({ className = "w-8 h-8" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </svg>
  );
}

/** Primary CTA */
export function btnPrimary(className = "") {
  return `inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium transition-colors hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${className}`;
}

export function btnSecondary(className = "") {
  return `inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-800 text-xs font-medium transition-colors hover:border-gray-300 hover:bg-gray-100 active:scale-[0.98] disabled:opacity-50 ${className}`;
}

export function btnOutline(className = "") {
  return `inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-xs font-medium transition-colors hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50 ${className}`;
}

/** Компактная панель действий внизу — кнопки рядом по центру */
export function footerBar(className = "") {
  return `flex items-center justify-center px-4 py-2.5 border-t border-gray-100 bg-white ${className}`;
}

export function footerActions(className = "") {
  return `inline-flex items-stretch gap-2 w-full max-w-[19rem] ${className}`;
}

export function footerBtnBack(className = "") {
  return btnOutline(`flex-1 px-3 py-2 whitespace-nowrap ${className}`);
}

export function footerBtnNext(className = "") {
  return btnPrimary(`flex-1 px-3 py-2 whitespace-nowrap ${className}`);
}
