"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearAudioLog,
  getAudioAlerts,
  getAudioDiagnostics,
  getAudioLog,
} from "@/lib/audioDebug";
import { clearAgentDebugLogs, getAgentDebugLogs } from "@/lib/debug-agent-log";

type AudioDebugPanelProps = {
  enabled?: boolean;
};

export function AudioDebugPanel({ enabled = false }: AudioDebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ReturnType<typeof getAudioLog>>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState(getAudioDiagnostics());
  const [agentCount, setAgentCount] = useState(0);

  useEffect(() => {
    if (!enabled || !open) return;
    const refresh = () => {
      setEvents(getAudioLog().slice(0, 20));
      setAlerts(getAudioAlerts());
      setDiagnostics(getAudioDiagnostics());
      try {
        const logs = JSON.parse(getAgentDebugLogs());
        setAgentCount(Array.isArray(logs) ? logs.length : 0);
      } catch {
        setAgentCount(0);
      }
    };
    refresh();
    const id = window.setInterval(refresh, 1000);
    return () => window.clearInterval(id);
  }, [enabled, open]);

  const handleClear = useCallback(() => {
    clearAudioLog();
    clearAgentDebugLogs();
    setEvents([]);
    setAlerts([]);
    setAgentCount(0);
  }, []);

  const handleCopy = useCallback(async () => {
    let agentLogs: unknown[] = [];
    try {
      agentLogs = JSON.parse(getAgentDebugLogs());
    } catch {
      agentLogs = [];
    }
    const text = JSON.stringify(
      {
        session: "1c0a94",
        diagnostics: getAudioDiagnostics(),
        alerts: getAudioAlerts(),
        audioEvents: getAudioLog(),
        agentEvents: agentLogs,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(text);
      alert(`Скопировано: ${getAudioLog().length} audio + ${agentCount} agent событий`);
    } catch {
      prompt("Скопируйте логи:", text);
    }
  }, [agentCount]);

  if (!enabled) return null;

  const handlers = diagnostics.installedHandlers.join(", ") || "—";

  return (
    <div className="mt-2 shrink-0 border-t border-dashed border-amber-300 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded bg-gray-800 px-2 py-1 text-[10px] text-white"
        aria-label="Audio debug log"
      >
        Debug {open ? "▲" : "▼"}
        {alerts.length > 0 && (
          <span className="ml-1 rounded bg-red-600 px-1 text-[9px]">!</span>
        )}
      </button>
      {open && (
        <div className="mt-2 max-h-56 overflow-auto rounded border border-amber-200 bg-amber-50 p-2 text-[10px] dark:border-amber-800 dark:bg-amber-950/40">
          <div className="mb-2 space-y-1 rounded border border-amber-200 bg-white/70 p-2 dark:border-amber-900 dark:bg-black/20">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              Lock screen diag (1c0a94)
            </p>
            <p>
              iOS={String(diagnostics.ios)} PWA={String(diagnostics.pwa)} mode=
              {diagnostics.iosMode}
            </p>
            <p>handlers: {handlers}</p>
            <p>MS state: {diagnostics.mediaSessionPlaybackState}</p>
            <p className="text-gray-500">agent events: {agentCount}</p>
          </div>

          {alerts.length > 0 && (
            <div className="mb-2 rounded border border-red-300 bg-red-50 p-2 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <p className="font-semibold">Alerts</p>
              <ul className="space-y-0.5 font-mono">
                {alerts.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-semibold text-amber-900 dark:text-amber-100">
              Audio events (last 20)
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={handleCopy} className="text-blue-600">
                Copy all
              </button>
              <button type="button" onClick={handleClear} className="text-blue-600">
                Clear
              </button>
            </div>
          </div>
          {events.length === 0 ? (
            <p className="text-gray-500">No events yet — play/pause on lock screen</p>
          ) : (
            <ul className="space-y-1 font-mono">
              {events.map((entry, i) => (
                <li
                  key={`${entry.time}-${entry.event}-${i}`}
                  className="border-b border-amber-100 pb-1 dark:border-amber-900"
                >
                  <span className="text-gray-500">{entry.time}</span>{" "}
                  <span
                    className={
                      entry.event.startsWith("zombie")
                        ? "font-semibold text-red-700"
                        : "font-semibold"
                    }
                  >
                    {entry.event}
                  </span>{" "}
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
