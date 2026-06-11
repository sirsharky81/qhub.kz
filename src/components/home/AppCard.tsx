"use client";

import Image from "next/image";
import Link from "next/link";
import { PinButton } from "@/components/favorites/PinButton";
import { MusicCardPlayer } from "@/components/music/MusicCardPlayer";
import { useMusicPlayerOptional } from "@/contexts/MusicPlayerContext";
import TestingBadge from "@/components/TestingBadge";
import { TAG_LABELS, type App } from "@/data/apps";

/** Единая высота всех карточек */
export const APP_CARD_HEIGHT = "h-[252px] sm:h-[260px]";

const iconBox =
  "w-10 h-10 flex items-center justify-center shrink-0 border border-gray-200 bg-white shadow-sm overflow-hidden";

interface AppCardProps {
  app: App;
  showPin?: boolean;
  draggable?: boolean;
}

export function AppCard({ app, showPin = true, draggable = false }: AppCardProps) {
  const player = useMusicPlayerOptional();
  const isMusicApp = app.id === "music";
  const isMusicActive = isMusicApp && !!player?.currentTrack;
  const isPlayingMusic = isMusicActive && player?.status === "playing";

  const cardClass = `app-card group relative rounded-2xl border border-gray-200 p-4 sm:p-5 flex flex-col gap-2 overflow-hidden shadow-sm ${APP_CARD_HEIGHT} ${
    app.comingSoon
      ? "opacity-50 cursor-default app-card-standard"
      : isMusicActive
        ? `music-card-active${isPlayingMusic ? " music-card-playing" : ""}`
        : "cursor-pointer app-card-standard"
  } ${draggable ? "touch-manipulation" : ""}`;

  const footer = (
    <div className="relative flex items-center justify-between gap-2 shrink-0 mt-auto pointer-events-auto z-20">
      <div className="flex gap-1.5 flex-wrap min-w-0">
        {app.tags.map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-2 py-0.5 rounded-full bg-white text-gray-500 border border-gray-200"
          >
            {TAG_LABELS[tag]}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {showPin && !app.comingSoon && (
          <PinButton appId={app.id} size="sm" alwaysVisible />
        )}
        <span className="text-xs text-gray-400 font-mono">{app.author}</span>
      </div>
    </div>
  );

  const inner = (
    <>
      <div
        className={`absolute inset-0 pointer-events-none ${
          isMusicActive ? "music-card-surface" : "app-card-surface"
        }`}
      />

      {app.comingSoon && (
        <span className="absolute top-3 right-3 z-20 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-gray-200 text-gray-400 bg-gray-50">
          Скоро
        </span>
      )}
      {!app.comingSoon && app.beta && !showPin && (
        <span className="absolute top-3 right-3 z-20">
          <TestingBadge />
        </span>
      )}
      {isMusicActive ? (
        <>
          {isPlayingMusic && (
            <div
              aria-hidden
              className="absolute inset-0 music-card-glow pointer-events-none z-[1]"
            />
          )}
          <div className="relative z-10 flex flex-col flex-1 min-h-0 gap-2 pointer-events-none">
            <div className="flex items-start gap-2.5 shrink-0">
              <div className={`${iconBox} rounded-xl text-2xl leading-none`} aria-hidden>
                {app.icon}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h3 className="font-semibold text-base text-gray-900 leading-tight tracking-tight">
                  {app.title}
                </h3>
                <p className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 mt-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isPlayingMusic ? "bg-gray-900 music-status-dot" : "bg-gray-300"
                    }`}
                    aria-hidden
                  />
                  <span className={isPlayingMusic ? "text-gray-700 font-medium" : ""}>
                    {isPlayingMusic ? "Сейчас играет" : "На паузе"}
                  </span>
                </p>
              </div>
            </div>

            <MusicCardPlayer embedded isPlaying={isPlayingMusic} />
          </div>
        </>
      ) : (
        <div className="relative z-10 flex flex-col flex-1 min-h-0 gap-2">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className={`${iconBox} rounded-[22%] shadow-[0_1px_3px_rgba(0,0,0,0.08)]`} aria-hidden>
              {app.icon.startsWith("/") ? (
                <Image
                  src={app.icon}
                  alt=""
                  width={28}
                  height={28}
                  className="object-contain"
                />
              ) : (
                <span className="text-2xl leading-none">{app.icon}</span>
              )}
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2 min-h-10">
              <h3 className="font-semibold text-base text-gray-900 leading-tight tracking-tight">
                {app.title}
              </h3>
              {app.beta && showPin && <TestingBadge />}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex items-center">
            <p className="text-sm text-gray-500 leading-snug line-clamp-4">
              {app.description}
            </p>
          </div>
        </div>
      )}

      {footer}
    </>
  );

  if (app.comingSoon) {
    return <div className={cardClass}>{inner}</div>;
  }

  if (isMusicActive) {
    return (
      <div className={cardClass}>
        <Link
          href={app.href}
          className="absolute inset-0 z-[5] rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50"
          aria-label={`Открыть ${app.title}`}
        />
        {inner}
      </div>
    );
  }

  return (
    <Link href={app.href} className={cardClass}>
      {inner}
    </Link>
  );
}
