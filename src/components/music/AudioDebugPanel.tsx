"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clearAudioLog, getAudioLog } from "@/lib/audioDebug";

function isDebugQuery(search: string): boolean {
  return search.includes("debug=1");
}

export function AudioDebugPanel() {
  const searchParams = useSearchParams();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ReturnType<typeof getAudioLog>>([]);

  useEffect(() => {
    const fromParams = searchParams.get("debug") === "1";
    const fromUrl =
      typeof window !== "undefined" && isDebugQuery(window.location.search);
    setEnabled(fromParams || fromUrl || process.env.NODE_ENV === "development");
  }, [searchParams]);

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
    <div className="mt-2 shrink-0 border-t border-dashed border-amber-300 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded bg-gray-800 px-2 py-1 text-[10px] text-white"
        aria-label="Audio debug log"
      >
        Debug {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mt-2 max-h-40 overflow-auto rounded border border-amber-200 bg-amber-50 p-2 text-[10px] dark:border-amber-800 dark:bg-amber-950/40">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-amber-900 dark:text-amber-100">
              Audio events (last 20)
            </span>
            <button type="button" onClick={handleClear} className="text-blue-600">
              Clear
            </button>
          </div>
          {events.length === 0 ? (
            <p className="text-gray-500">No events yet</p>
          ) : (
            <ul className="space-y-1 font-mono">
              {events.map((entry, i) => (
                <li
                  key={`${entry.time}-${entry.event}-${i}`}
                  className="border-b border-amber-100 pb-1 dark:border-amber-900"
                >
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
    </div>
  );
}
