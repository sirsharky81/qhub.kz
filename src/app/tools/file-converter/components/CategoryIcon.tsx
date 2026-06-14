import type { CatalogCategoryId } from "@/lib/file-converter/conversion-catalog";

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

export function CategoryIcon({
  id,
  className = "w-4 h-4",
}: {
  id: CatalogCategoryId;
  className?: string;
}) {
  switch (id) {
    case "all":
      return <IconAll className={className} />;
    case "photo":
      return <IconPhoto className={className} />;
    case "audio":
      return <IconAudio className={className} />;
    case "video":
      return <IconVideo className={className} />;
    case "data":
      return <IconData className={className} />;
    case "books":
      return <IconBooks className={className} />;
    case "documents":
      return <IconDocuments className={className} />;
    case "archive":
      return <IconArchive className={className} />;
    case "other":
      return <IconOther className={className} />;
  }
}

function IconAll({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  );
}

/** Минималистичная «картинка» — рамка + круг, без пейзажа */
function IconPhoto({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M3 16l4.5-4.5a1 1 0 011.4 0L14 17l2.3-2.3a1 1 0 011.4 0L21 18" />
    </svg>
  );
}

function IconAudio({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M9 18V6l10-2v14" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="16" r="2" />
    </svg>
  );
}

function IconVideo({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-2.5v9L16 14" />
    </svg>
  );
}

function IconData({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M4 19V5M10 19V9M16 19v-6M22 19V3" />
    </svg>
  );
}

function IconBooks({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M4 19V5a2 2 0 012-2h5v16H6a2 2 0 01-2-2zM13 5h5a2 2 0 012 2v12a2 2 0 01-2 2h-5V5z" />
    </svg>
  );
}

function IconDocuments({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

function IconArchive({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function IconOther({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
