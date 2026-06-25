"use client";

import { useCallback, useRef, useState } from "react";
import { MAX_AUDIO_BLOB_BYTES, MAX_TEXT_LENGTH, MAX_VIDEO_BLOB_BYTES, MIN_MEDIA_DURATION_MS } from "@/lib/messenger/constants";
import { compressVideoIfNeeded } from "@/lib/messenger/media-compress";
import { extractWaveformPeaks, type MediaRecorderSession } from "@/lib/messenger/media-recorder";
import type { DisplayMessage } from "./MessageBubble";
import { MediaRecordBar } from "./MediaRecordBar";

export interface MediaSendPayload {
  blob: Blob;
  type: "audio" | "video";
  durationMs: number;
  mime: string;
  waveformPeaks?: number[];
}

interface Props {
  text: string;
  onTextChange: (value: string) => void;
  onSend: () => void;
  onFile: (file: File) => void;
  onSendMedia: (payload: MediaSendPayload) => void | Promise<void>;
  canSend: boolean;
  replyTo: DisplayMessage | null;
  onCancelReply: () => void;
  onFocus?: () => void;
}

type RecordMode = "audio" | "video" | null;

function replyPreviewText(replyTo: DisplayMessage): string {
  if (replyTo.plain?.text) return replyTo.plain.text;
  if (replyTo.type === "image") return "Фото";
  if (replyTo.type === "audio") return "Голосовое";
  if (replyTo.type === "video") return "Видео";
  return replyTo.plain?.filename ?? "Сообщение";
}

export function ChatComposer({
  text,
  onTextChange,
  onSend,
  onFile,
  onSendMedia,
  canSend,
  replyTo,
  onCancelReply,
  onFocus,
}: Props) {
  const [recordMode, setRecordMode] = useState<RecordMode>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const sessionRef = useRef<MediaRecorderSession | null>(null);
  const trimmed = text.trim();
  const showMediaButtons = !trimmed && !recordMode;

  const exitRecording = useCallback(() => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setRecordMode(null);
    setMediaError(null);
  }, []);

  const handleSessionReady = useCallback((session: MediaRecorderSession) => {
    sessionRef.current = session;
  }, []);

  const handleSendRecording = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !recordMode) return;
    setMediaError(null);
    try {
      const { blob, durationMs, mime } = await session.stop();
      if (durationMs < MIN_MEDIA_DURATION_MS) {
        setMediaError("Слишком короткая запись");
        await session.start();
        return;
      }
      let finalBlob = blob;
      if (recordMode === "video") {
        finalBlob = await compressVideoIfNeeded(blob);
      }
      const maxBytes = recordMode === "audio" ? MAX_AUDIO_BLOB_BYTES : MAX_VIDEO_BLOB_BYTES;
      if (finalBlob.size > maxBytes) {
        setMediaError(
          recordMode === "audio"
            ? "Голосовое слишком длинное"
            : "Видео слишком большое — запишите короче",
        );
        await session.start();
        return;
      }
      const waveformPeaks =
        recordMode === "audio" ? await extractWaveformPeaks(finalBlob) : undefined;
      sessionRef.current?.dispose();
      sessionRef.current = null;
      setRecordMode(null);
      await onSendMedia({
        blob: finalBlob,
        type: recordMode,
        durationMs,
        mime: finalBlob.type || mime,
        waveformPeaks,
      });
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Не удалось отправить");
    }
  }, [onSendMedia, recordMode]);

  return (
    <div
      className="shrink-0 border-t border-gray-200 bg-white/95 backdrop-blur"
      style={{
        paddingTop: "0.625rem",
        paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
      }}
    >
      {replyTo && !recordMode && (
        <div className="flex items-start gap-2 mb-2 px-1 rounded-xl bg-gray-50 border border-gray-200 py-2">
          <div className="flex-1 min-w-0 border-l-2 border-sky-500 pl-2">
            <p className="text-[11px] font-medium text-sky-700">Ответ</p>
            <p className="text-xs text-gray-600 truncate">{replyPreviewText(replyTo)}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="shrink-0 h-7 w-7 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            aria-label="Отменить цитирование"
          >
            ×
          </button>
        </div>
      )}
      {text.length > 3500 && !recordMode && (
        <p className="text-xs text-amber-600 px-1 mb-1.5">
          {text.length}/{MAX_TEXT_LENGTH}
        </p>
      )}

      {recordMode ? (
        <MediaRecordBar
          mode={recordMode}
          onDiscard={exitRecording}
          onSend={() => void handleSendRecording()}
          onSessionReady={handleSessionReady}
          error={mediaError}
        />
      ) : (
        <div className="flex items-end gap-2 min-w-0 max-w-full">
          <label
            className="mb-0.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Прикрепить файл"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
              />
            </svg>
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </label>

          {showMediaButtons && (
            <>
              <button
                type="button"
                onClick={() => setRecordMode("audio")}
                className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-sky-600"
                aria-label="Голосовое сообщение"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 9a7 7 0 007-7h-2a5 5 0 01-10 0H5a7 7 0 007 7z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setRecordMode("video")}
                className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-sky-600"
                aria-label="Видеосообщение"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="6" width="13" height="12" rx="2" />
                  <path d="M16 10l5-3v10l-5-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}

          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value.slice(0, MAX_TEXT_LENGTH))}
            rows={1}
            placeholder="Сообщение"
            className="min-w-0 flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-base leading-snug max-h-32 focus:outline-none focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
            style={{ fontSize: "16px" }}
            onFocus={onFocus}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
          />
          <button
            type="button"
            disabled={!canSend}
            onClick={onSend}
            aria-label="Отправить"
            className={`mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
              canSend ? "bg-sky-600 text-white hover:bg-sky-700" : "bg-gray-200 text-gray-400"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M3.4 20.4 21 12 3.4 3.6 3 11l8 1-8 1z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
