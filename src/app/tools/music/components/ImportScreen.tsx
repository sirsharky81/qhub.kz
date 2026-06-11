"use client";

import { useMusicPlayer } from "@/contexts/MusicPlayerContext";

export function ImportScreen() {
  const { importDirectory, pickFiles, importProgress } = useMusicPlayer();

  const handlePickFolder = () => {
    if ("showDirectoryPicker" in window) {
      void importDirectory();
    } else {
      const input = document.getElementById("music-dir-input") as HTMLInputElement | null;
      input?.click();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/15 to-indigo-500/10 flex items-center justify-center text-3xl mb-4">
        🎧
      </div>

      <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">QHub Music</h1>
      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mb-6 leading-relaxed">
        Локальный плеер — файлы не покидают устройство
      </p>

      <div className="flex gap-2 w-full max-w-xs">
        <button
          type="button"
          onClick={pickFiles}
          className="flex-1 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          Добавить
        </button>
        <button
          type="button"
          onClick={handlePickFolder}
          className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Папка
        </button>
      </div>

      <p className="mt-4 text-[10px] text-gray-400">MP3 · M4A · AAC · WAV · FLAC · OGG</p>

      {importProgress && (
        <div className="mt-5 w-full max-w-xs">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>Импорт</span>
            <span>
              {importProgress.processed}/{importProgress.total}
            </span>
          </div>
          <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all"
              style={{
                width:
                  importProgress.total > 0
                    ? `${(importProgress.processed / importProgress.total) * 100}%`
                    : "0%",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
