"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMusicPlayerOptional } from "@/contexts/MusicPlayerContext";

/** Мини-плеер не показываем на страницах сервисов — мешает UI (редактор, экспорт и т.д.) */
function isServicePage(pathname: string): boolean {
  return pathname.startsWith("/apps/") || pathname.startsWith("/tools/");
}

export function GlobalMiniPlayer() {
  const player = useMusicPlayerOptional();
  const pathname = usePathname();

  if (!player?.currentTrack) return null;
  if (pathname === "/" || isServicePage(pathname)) return null;

  const { currentTrack, status, togglePlay, previous, next } = player;
  const isPlaying = status === "playing";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur-md shadow-[0_-2px_16px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-6xl mx-auto px-3 py-1.5">
        <div className="flex items-center gap-2.5">
          <Link
            href="/tools/music"
            className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 hover:opacity-80 transition-opacity"
            aria-label="Открыть плеер"
          >
            {currentTrack.coverArtUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentTrack.coverArtUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm">🎵</div>
            )}
          </Link>

          <Link href="/tools/music" className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
            <p className="text-xs font-medium text-gray-900 truncate leading-tight">
              {currentTrack.title}
            </p>
            <p className="text-[10px] text-gray-500 truncate">{currentTrack.artist}</p>
          </Link>

          <div className="flex items-center gap-0.5 shrink-0 rounded-xl border border-gray-100 bg-gray-50 p-0.5">
            <button
              type="button"
              onClick={() => void previous()}
              className="w-7 h-7 rounded-full flex items-center justify-center text-gray-600 hover:bg-white transition-colors"
              aria-label="Предыдущий"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void togglePlay()}
              className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center hover:opacity-90 transition-opacity"
              aria-label={isPlaying ? "Пауза" : "Воспроизведение"}
            >
              {isPlaying ? (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => void next()}
              className="w-7 h-7 rounded-full flex items-center justify-center text-gray-600 hover:bg-white transition-colors"
              aria-label="Следующий"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
