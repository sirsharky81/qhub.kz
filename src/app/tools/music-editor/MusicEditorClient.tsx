"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UploadZone } from "@/components/music-editor/UploadZone";
import { useAudioPlayer } from "@/components/music-editor/AudioPlayer";
import { ManualEditorPanel } from "@/components/music-editor/ManualEditorPanel";
import { ProgressOverlay } from "@/components/music-editor/ProgressOverlay";
import { useEditorHistory } from "@/components/music-editor/useEditorHistory";
import { useProcessedPlayback } from "@/components/music-editor/useProcessedPlayback";
import { loadAudioTracks } from "@/lib/music-editor/load-track";
import { processSingleTrack, processProgramOutput } from "@/lib/music-editor/program";
import { exportAudioBuffer, downloadBlob, formatExportError } from "@/lib/music-editor/ffmpeg";
import type { ExportProgress } from "@/lib/music-editor/ffmpeg";
import { formatDuration, formatFileSize } from "@/lib/music-editor/format";
import {
  getTrackIndexById,
  sanitizeExportName,
  type EditorState,
} from "@/lib/music-editor/history";
import type {
  ExportFormat,
  ManualEditSettings,
  ProgramTransition,
} from "@/lib/music-editor/types";
import {
  DEFAULT_MANUAL_SETTINGS,
  DEFAULT_PROGRAM_TRANSITION,
  MAX_TRACKS,
} from "@/lib/music-editor/types";

function createEmptyEditor(): EditorState {
  return {
    tracks: [],
    manualSettings: [],
    programTrackIds: [],
    transitions: [],
    programSettings: { ...DEFAULT_MANUAL_SETTINGS },
    activeObject: { type: "track", trackId: "" },
    viewTrackId: "",
  };
}

function syncTransitions(ids: string[], existing: ProgramTransition[]): ProgramTransition[] {
  const needed = Math.max(0, ids.length - 1);
  const result = existing.slice(0, needed);
  while (result.length < needed) {
    result.push({ ...DEFAULT_PROGRAM_TRANSITION });
  }
  return result;
}

export default function MusicEditorClient() {
  const [exportFormat, setExportFormat] = useState<ExportFormat>("mp3-320");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    state: editorState,
    replaceState,
    updateState,
    beginGesture,
    endGesture,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useEditorHistory(createEmptyEditor());

  const {
    tracks,
    manualSettings,
    programTrackIds,
    transitions,
    programSettings,
    activeObject,
    viewTrackId,
  } = editorState;
  const player = useAudioPlayer();

  const viewTrackIdx = useMemo(() => {
    const idx = getTrackIndexById(tracks, viewTrackId);
    return idx >= 0 ? idx : 0;
  }, [tracks, viewTrackId]);

  const viewTrack = tracks[viewTrackIdx] ?? null;
  const viewSettings = manualSettings[viewTrackIdx] ?? DEFAULT_MANUAL_SETTINGS;

  const { resultDuration, programDuration, isRendering } = useProcessedPlayback(
    tracks,
    manualSettings,
    programTrackIds,
    transitions,
    programSettings,
    activeObject,
    player,
    tracks.length > 0,
  );

  const updateSettings = useCallback(
    (patch: Partial<ManualEditSettings>, opts?: { skipHistory?: boolean }) => {
      const idx = getTrackIndexById(tracks, viewTrackId);
      if (idx < 0) return;
      updateState(
        (prev) => ({
          ...prev,
          manualSettings: prev.manualSettings.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
        }),
        opts,
      );
    },
    [updateState, viewTrackId, tracks],
  );

  const updateProgramSettings = useCallback(
    (patch: Partial<ManualEditSettings>, opts?: { skipHistory?: boolean }) => {
      updateState(
        (prev) => ({
          ...prev,
          programSettings: { ...prev.programSettings, ...patch },
        }),
        opts,
      );
    },
    [updateState],
  );

  const handleFilesSelect = useCallback(
    async (files: File[]) => {
      const remaining = MAX_TRACKS - tracks.length;
      const toLoad = files.slice(0, remaining);
      if (toLoad.length === 0) return;

      setLoadError(null);
      setLoading(true);
      setLoadingMsg("Загрузка аудио...");
      setLoadingProgress(0);

      try {
        const loaded = await loadAudioTracks(toLoad, (pct, name) => {
          setLoadingProgress(pct);
          setLoadingMsg(`Загрузка: ${name}`);
        });

        const isFirst = tracks.length === 0;
        if (isFirst) {
          replaceState(
            {
              tracks: loaded,
              manualSettings: loaded.map(() => ({ ...DEFAULT_MANUAL_SETTINGS })),
              programTrackIds: [],
              transitions: [],
              programSettings: { ...DEFAULT_MANUAL_SETTINGS },
              activeObject: { type: "track", trackId: loaded[0].id },
              viewTrackId: loaded[0].id,
            },
            true,
          );
        } else {
          updateState((prev) => ({
            ...prev,
            tracks: [...prev.tracks, ...loaded],
            manualSettings: [
              ...prev.manualSettings,
              ...loaded.map(() => ({ ...DEFAULT_MANUAL_SETTINGS })),
            ],
          }));
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Ошибка загрузки файла");
      } finally {
        setLoading(false);
      }
    },
    [tracks.length, replaceState, updateState],
  );

  const addToProgram = useCallback(
    (trackId: string) => {
      updateState((prev) => {
        if (prev.programTrackIds.includes(trackId)) return prev;
        const newIds = [...prev.programTrackIds, trackId];
        return {
          ...prev,
          programTrackIds: newIds,
          transitions: syncTransitions(newIds, prev.transitions),
        };
      });
    },
    [updateState],
  );

  const removeFromProgram = useCallback(
    (trackId: string) => {
      updateState((prev) => {
        const newIds = prev.programTrackIds.filter((id) => id !== trackId);
        return {
          ...prev,
          programTrackIds: newIds,
          transitions: syncTransitions(newIds, prev.transitions),
        };
      });
    },
    [updateState],
  );

  const handleProgramReorder = useCallback(
    (ids: string[]) => {
      updateState((prev) => ({
        ...prev,
        programTrackIds: ids,
        transitions: ids
          .slice(0, -1)
          .map((_, i) => prev.transitions[i] ?? { ...DEFAULT_PROGRAM_TRANSITION }),
      }));
    },
    [updateState],
  );

  const handleTransitionChange = useCallback(
    (index: number, transition: ProgramTransition) => {
      updateState((prev) => ({
        ...prev,
        transitions: prev.transitions.map((t, i) => (i === index ? transition : t)),
      }));
    },
    [updateState],
  );

  const exportMeta = useMemo(() => {
    if (activeObject.type === "program") {
      return {
        label: "Программа выступления",
        filename: "Program_edit",
        disabled: programTrackIds.length === 0,
      };
    }
    const idx = getTrackIndexById(tracks, activeObject.trackId);
    const track = idx >= 0 ? tracks[idx] : viewTrack;
    if (!track) return { label: "", filename: "music", disabled: true };
    return {
      label: track.name,
      filename: `${sanitizeExportName(track.name)}_edited`,
      disabled: false,
    };
  }, [activeObject, tracks, viewTrack, programTrackIds.length]);

  const handleExport = useCallback(
    async (buffer?: AudioBuffer, name?: string, formatOverride?: ExportFormat) => {
      const format = formatOverride ?? exportFormat;
      setExportError(null);
      setExporting(true);
      setLoading(true);
      setLoadingMsg("Экспорт файла...");
      setLoadingProgress(5);

      try {
        let result = buffer;
        let exportName = name;

        if (!result) {
          if (activeObject.type === "program") {
            if (programTrackIds.length === 0) return;
            result = await processProgramOutput(
              tracks,
              manualSettings,
              programTrackIds,
              transitions,
              programSettings,
            );
            exportName = exportName ?? "Program_edit";
          } else {
            const idx = getTrackIndexById(tracks, activeObject.trackId);
            const track = idx >= 0 ? tracks[idx] : null;
            if (!track) return;
            const settings = manualSettings[idx] ?? DEFAULT_MANUAL_SETTINGS;
            result = await processSingleTrack(track.buffer, settings);
            exportName = exportName ?? `${sanitizeExportName(track.name)}_edited`;
          }
        }

        if (!result) return;

        const ext = format === "wav" ? "wav" : "mp3";
        const filename = `${exportName ?? exportMeta.filename}.${ext}`;

        const blob = await exportAudioBuffer(result, format, (p: ExportProgress) => {
          setLoadingProgress(Math.round(p.percent));
          setLoadingMsg(p.message);
        });

        downloadBlob(blob, filename);
      } catch (err) {
        const message = formatExportError(err);
        setExportError(message);
      } finally {
        setExporting(false);
        setLoading(false);
      }
    },
    [
      activeObject,
      tracks,
      manualSettings,
      programTrackIds,
      transitions,
      programSettings,
      exportFormat,
      exportMeta.filename,
    ],
  );

  const removeTrack = useCallback(
    (idx: number) => {
      updateState((prev) => {
        const removedId = prev.tracks[idx]?.id;
        const newTracks = prev.tracks.filter((_, i) => i !== idx);
        const newSettings = prev.manualSettings.filter((_, i) => i !== idx);
        const newProgramIds = removedId
          ? prev.programTrackIds.filter((id) => id !== removedId)
          : prev.programTrackIds;
        const newTransitions = syncTransitions(newProgramIds, prev.transitions);

        let newActive = prev.activeObject;
        let newViewId = prev.viewTrackId;
        if (removedId === prev.viewTrackId) {
          const fallback = newTracks[Math.max(0, idx - 1)] ?? newTracks[0];
          newViewId = fallback?.id ?? "";
        }
        if (prev.activeObject.type === "track" && prev.activeObject.trackId === removedId) {
          const fallback = newTracks[Math.max(0, idx - 1)] ?? newTracks[0];
          newActive = fallback
            ? { type: "track", trackId: fallback.id }
            : { type: "program" };
        }
        if (newTracks.length === 0) {
          newActive = { type: "track", trackId: "" };
          newViewId = "";
        }

        return {
          ...prev,
          tracks: newTracks,
          manualSettings: newSettings,
          programTrackIds: newProgramIds,
          transitions: newTransitions,
          activeObject: newActive,
          viewTrackId: newViewId,
        };
      });
    },
    [updateState],
  );

  const selectTrack = useCallback(
    (trackId: string) => {
      const switching =
        activeObject.type !== "track" || activeObject.trackId !== trackId;
      updateState(
        (prev) => ({
          ...prev,
          activeObject: { type: "track", trackId },
          viewTrackId: trackId,
        }),
        { skipHistory: true },
      );
      if (switching) player.stop();
    },
    [updateState, player, activeObject],
  );

  const selectProgram = useCallback(() => {
    updateState((prev) => ({ ...prev, activeObject: { type: "program" } }), { skipHistory: true });
    player.stop();
  }, [updateState, player]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
          player.stop();
        } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          e.preventDefault();
          redo();
          player.stop();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, player]);

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col flex-1 overflow-y-auto">
        {loading && <ProgressOverlay message={loadingMsg} progress={loadingProgress} />}
        <UploadZone onFilesSelect={handleFilesSelect} disabled={loading} />
        {loadError && (
          <div className="max-w-2xl mx-auto w-full px-4 pb-4">
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {loadError}
            </div>
          </div>
        )}
      </div>
    );
  }

  const isTrackActive = (trackId: string) =>
    activeObject.type === "track" && activeObject.trackId === trackId;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {loading && <ProgressOverlay message={loadingMsg} progress={loadingProgress} />}
      {exportError && (
        <div className="flex-shrink-0 px-4 pt-2">
          <div className="max-w-2xl mx-auto rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
            <strong>Ошибка экспорта:</strong> {exportError}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-3 space-y-3">
          <div className="space-y-1.5">
            {tracks.map((track, idx) => {
              const inProgram = programTrackIds.includes(track.id);
              return (
                <div
                  key={track.id}
                  className={`flex items-center gap-2 p-2 rounded-xl border transition-colors cursor-pointer ${
                    isTrackActive(track.id)
                      ? "border-gray-900 bg-white shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                  onClick={() => selectTrack(track.id)}
                >
                  <span className="text-sm" aria-hidden>
                    🎵
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{track.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {formatDuration(track.duration)} · {formatFileSize(track.size)}
                      {inProgram && (
                        <span className="ml-1.5 text-emerald-600 font-medium">· В программе</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (inProgram) removeFromProgram(track.id);
                      else addToProgram(track.id);
                    }}
                    className={[
                      "text-[10px] px-2 py-1 rounded-lg border whitespace-nowrap",
                      inProgram
                        ? "text-emerald-700 border-emerald-200 bg-emerald-50"
                        : "text-gray-700 border-gray-200 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {inProgram ? "В программе" : "Добавить в программу выступления"}
                  </button>
                  {tracks.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTrack(idx);
                      }}
                      className="text-[11px] text-red-500 hover:text-red-700 px-1.5"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              );
            })}
            {tracks.length < MAX_TRACKS && (
              <UploadZone onFilesSelect={handleFilesSelect} compact disabled={loading} />
            )}
          </div>

          {viewTrack && (
            <ManualEditorPanel
              track={viewTrack}
              tracks={tracks}
              manualSettings={manualSettings}
              settings={viewSettings}
              programTrackIds={programTrackIds}
              transitions={transitions}
              programSettings={programSettings}
              activeObject={activeObject}
              exportFormat={exportFormat}
              exporting={exporting}
              isRendering={isRendering}
              resultDuration={resultDuration}
              programDuration={programDuration}
              player={player}
              canUndo={canUndo}
              canRedo={canRedo}
              exportFilename={exportMeta.filename}
              saveTargetLabel={exportMeta.label}
              exportDisabled={exportMeta.disabled}
              onUndo={() => {
                undo();
                player.stop();
              }}
              onRedo={() => {
                redo();
                player.stop();
              }}
              onBeginGesture={beginGesture}
              onEndGesture={endGesture}
              onSettingsChange={updateSettings}
              onProgramSettingsChange={updateProgramSettings}
              onActivateTrack={() => selectTrack(viewTrack.id)}
              onActivateProgram={selectProgram}
              onProgramReorder={handleProgramReorder}
              onTransitionChange={handleTransitionChange}
              onRemoveFromProgram={removeFromProgram}
              onExportFormatChange={setExportFormat}
              onExport={() => handleExport()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
