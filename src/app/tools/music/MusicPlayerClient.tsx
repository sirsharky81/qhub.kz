"use client";

import { useEffect, useState } from "react";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { ImportScreen } from "./components/ImportScreen";
import { LibraryPanel } from "./components/LibraryPanel";
import { PlaylistsPanel } from "./components/PlaylistsPanel";
import { PlayerView } from "./components/PlayerView";
import { QueuePanel } from "./components/QueuePanel";
import { RemoteLibraryPanel } from "./components/RemoteLibraryPanel";

type Tab = "player" | "library" | "playlists" | "queue" | "nas";

const TABS: { id: Tab; label: string }[] = [
  { id: "player", label: "Плеер" },
  { id: "library", label: "Медиатека" },
  { id: "playlists", label: "Плейлисты" },
  { id: "queue", label: "Очередь" },
];

const tabBtn = (active: boolean) =>
  `px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
    active
      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
  }`;

const actionBtn =
  "px-2 py-1 rounded-lg text-[11px] font-medium border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors";

export default function MusicPlayerClient() {
  const { tracks, isLibraryLoading, pickFiles, importDirectory, queue } = useMusicPlayer();
  const [tab, setTab] = useState<Tab>("player");
  const [nasAllowed, setNasAllowed] = useState(false);
  const [showNasOnly, setShowNasOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/music/remote/status");
        if (!res.ok) return;
        const data = (await res.json()) as { allowed?: boolean };
        if (!cancelled) setNasAllowed(Boolean(data.allowed));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLibraryLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (tracks.length === 0 && !showNasOnly) {
    return (
      <ImportScreen
        nasAvailable={nasAllowed}
        onOpenNas={() => {
          setShowNasOnly(true);
          setTab("nas");
        }}
      />
    );
  }

  if (tracks.length === 0 && showNasOnly) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-900">
        <RemoteLibraryPanel onClose={() => setShowNasOnly(false)} />
      </div>
    );
  }

  const mobileTabs = nasAllowed
    ? [...TABS, { id: "nas" as const, label: "NAS" }]
    : TABS;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50 dark:bg-gray-950">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 print:hidden">
        <button
          type="button"
          onClick={pickFiles}
          className={`${actionBtn} bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent`}
        >
          + Файлы
        </button>
        <button
          type="button"
          onClick={() => void importDirectory()}
          className={`${actionBtn} hidden sm:inline-flex`}
        >
          Папка
        </button>
        {nasAllowed && (
          <button
            type="button"
            onClick={() => setTab("nas")}
            className={`${actionBtn} border-emerald-300 text-emerald-800 dark:text-emerald-300`}
          >
            NAS
          </button>
        )}

        <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 md:hidden" />

        <div className="flex gap-0.5 flex-1 overflow-x-auto md:hidden">
          {mobileTabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={tabBtn(tab === t.id)}>
              {t.label}
              {t.id === "queue" && queue.length > 0 && (
                <span className="ml-1 text-[9px] opacity-70">{queue.length}</span>
              )}
            </button>
          ))}
        </div>

        <span className="hidden md:block text-[11px] text-gray-400 ml-auto">
          {tracks.length} треков
        </span>
      </div>

      <div className="flex-1 flex min-h-0">
        <div
          className={`${
            tab === "player" ? "flex" : "hidden"
          } md:flex flex-col w-full md:w-72 lg:w-80 flex-shrink-0 min-h-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900`}
        >
          <PlayerView />
        </div>

        {tab === "nas" ? (
          <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-white dark:bg-gray-900">
            <RemoteLibraryPanel onClose={() => setTab("library")} />
          </div>
        ) : (
          <>
            <div
              className={`${
                tab === "library" ? "flex" : "hidden"
              } md:flex flex-col flex-1 min-w-0 min-h-0 bg-white dark:bg-gray-900`}
            >
              <LibraryPanel />
            </div>

            <div
              className={`${
                tab === "playlists" ? "flex" : "hidden"
              } md:flex flex-col w-full md:w-52 lg:w-60 flex-shrink-0 min-h-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900`}
            >
              <PlaylistsPanel />
            </div>

            <div
              className={`${
                tab === "queue" ? "flex" : "hidden"
              } md:flex flex-col w-full md:w-52 lg:w-60 flex-shrink-0 min-h-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900`}
            >
              <QueuePanel
                onNavigate={(target) => {
                  setTab(target === "library" ? "library" : "playlists");
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
