"use client";

export function ChessStartBanner({
  whiteName,
  blackName,
  subtitle,
}: {
  whiteName: string;
  blackName: string;
  subtitle: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-3">
      <div className="rounded-sm bg-[#2e9d6a] py-3 text-center text-white shadow-lg">
        <p className="text-base font-semibold tracking-wide sm:text-lg">
          {whiteName} vs {blackName}
        </p>
        <div className="mx-10 my-1.5 h-px bg-white/80" />
        <p className="text-sm font-medium text-white/95">{subtitle}</p>
      </div>
    </div>
  );
}
