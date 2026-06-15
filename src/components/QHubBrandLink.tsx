import Link from "next/link";

interface QHubBrandLinkProps {
  className?: string;
}

export default function QHubBrandLink({ className = "" }: QHubBrandLinkProps) {
  return (
    <Link href="/" className={`flex items-center gap-2 group shrink-0 ${className}`.trim()}>
      <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png?v=4" alt="QHub" className="w-full h-full object-cover" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-semibold text-gray-900 tracking-tight text-sm">
          QHub<span className="text-gray-400">.kz</span>
        </span>
        <span className="text-[9px] text-gray-400 tracking-wide hidden sm:block">
          Первый казахский хаб полезных приложений
        </span>
      </div>
    </Link>
  );
}
