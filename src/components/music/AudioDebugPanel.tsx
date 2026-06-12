"use client";

import { useCallback, useEffect, useState } from "react";
import { clearAudioLog, getAudioLog, isAudioDebugEnabled } from "@/lib/audioDebug";

export function AudioDebugPanel() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ReturnType<typeof getAudioLog>>([]);

  useEffect(() => {
    setEnabled(isAudioDebugEnabled());
  }, []);

  useEffect(() => {
    if (!enabled || !open) return;
    const refresh = () => setEvents(getAudioLog().slice(0, 20));
    refresh();
    const id = window.setInterval(refresh, 1000);
    return () => window.clearInterval(id);
  }, [enabled, open]);

  const handleClear = useCallback(() => {
    clearAudioLog();
    setEvents([]);
  }, []);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 right-2 z-[9998] rounded bg-gray-800 px-2 py-1 text-[10px] text-white shadow"
        aria-label="Audio debug log"
      >
        Debug
      </button>
      {open && (
        <div className="fixed bottom-28 right-2 left-2 z-[9998] max-h-64 overflow-auto rounded border border-gray-300 bg-white p-2 text-[10px] shadow-lg dark:border-gray-600 dark:bg-gray-900">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold">Audio events (last 20)</span>
            <button type="button" onClick={handleClear} className="text-blue-600">
              Clear
            </button>
          </div>
          {events.length === 0 ? (
            <p className="text-gray-500">No events yet</p>
          ) : (
            <ul className="space-y-1 font-mono">
              {events.map((entry, i) => (
                <li key={`${entry.time}-${entry.event}-${i}`} className="border-b border-gray-100 pb-1">
                  <span className="text-gray-500">{entry.time}</span>{" "}
                  <span className="font-semibold">{entry.event}</span>{" "}
                  paused={String(entry.state.paused)} t={entry.state.currentTime} rs=
                  {entry.state.readyState} ns={entry.state.networkState}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
