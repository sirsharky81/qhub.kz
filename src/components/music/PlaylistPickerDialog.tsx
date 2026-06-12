"use client";

import { useState } from "react";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { NameInputDialog } from "./NameInputDialog";

interface PlaylistPickerDialogProps {
  open: boolean;
  trackIds: string[];
  onClose: () => void;
}

export function PlaylistPickerDialog({ open, trackIds, onClose }: PlaylistPickerDialogProps) {
  const { playlists, addTracksToPlaylist, createPlaylist } = useMusicPlayer();
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  if (creating) {
    return (
      <NameInputDialog
        open
        title="Новый плейлист"
        placeholder="Название плейлиста"
        confirmLabel="Создать"
        onCancel={() => {
          setCreating(false);
          onClose();
        }}
        onConfirm={async (name) => {
          await createPlaylist(name, trackIds);
          setCreating(false);
          onClose();
        }}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-xl max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Добавить в плейлист</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{trackIds.length} треков</p>
        </div>

        <div className="overflow-auto flex-1 py-1">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="w-full px-4 py-2.5 text-left text-xs font-medium text-violet-600 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            + Создать плейлист
          </button>
          {playlists.length === 0 ? (
            <p className="px-4 py-4 text-xs text-gray-400 text-center">Нет плейлистов</p>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => {
                  void addTracksToPlaylist(pl.id, trackIds);
                  onClose();
                }}
                className="w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{pl.name}</p>
                <p className="text-[10px] text-gray-400">{pl.trackIds.length} треков</p>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
