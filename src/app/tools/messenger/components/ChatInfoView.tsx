"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@/components/music/ConfirmDialog";
import { MessengerAvatar } from "./MessengerAvatar";
import { MessengerShell } from "./MessengerShell";
import { useMessengerUnlock } from "./MessengerUnlockProvider";
import { clearChatHistory, loadChatHistory } from "@/lib/messenger/history-db";
import {
  extractHistoryMedia,
  groupHistoryMedia,
  type HistoryMediaItem,
} from "@/lib/messenger/history-media";
import { saveBase64Media } from "@/lib/messenger/files";
import { refreshAppBadge } from "@/lib/messenger/app-badge";
import { maskPhone } from "@/lib/messenger/phone-format";
import { openExternalUrl } from "@/lib/platform/open-url";
import { useCallOptional } from "./call/CallProvider";

type TabId = "media" | "docs" | "links";

interface ParticipantRow {
  phone: string;
  label: string;
  role?: string;
  online?: boolean;
  avatarUrl?: string | null;
}

interface Props {
  kind: "dm" | "room";
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  channel: string;
  backHref: string;
  phone?: string;
  seed?: string;
  participants?: ParticipantRow[];
  adminHref?: string | null;
  onLeaveRoom?: () => void | Promise<void>;
}

function formatTs(ts: number): string {
  try {
    return new Date(ts).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function AvatarLightbox({
  src,
  label,
  onClose,
}: {
  src: string;
  label: string;
  onClose: () => void;
}) {
  const node = (
    <button
      type="button"
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      aria-label="Закрыть"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
      <span className="mt-4 text-sm text-white/80">{label}</span>
    </button>
  );
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

export function ChatInfoView({
  kind,
  title,
  subtitle,
  avatarUrl,
  channel,
  backHref,
  phone,
  seed,
  participants = [],
  adminHref,
  onLeaveRoom,
}: Props) {
  const { storageKey, isUnlocked } = useMessengerUnlock();
  const call = useCallOptional();
  const [tab, setTab] = useState<TabId>("media");
  const [items, setItems] = useState<HistoryMediaItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);

  const loadMedia = useCallback(async () => {
    if (!isUnlocked || !storageKey) {
      setItems([]);
      return;
    }
    setLoadingMedia(true);
    try {
      const history = await loadChatHistory(storageKey, channel);
      setItems(extractHistoryMedia(history));
    } catch {
      setItems([]);
    } finally {
      setLoadingMedia(false);
    }
  }, [channel, isUnlocked, storageKey]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  const grouped = useMemo(() => groupHistoryMedia(items), [items]);
  const activeList =
    tab === "media" ? grouped.media : tab === "docs" ? grouped.docs : grouped.links;

  async function handleClear() {
    setClearing(true);
    try {
      await clearChatHistory(channel);
      setItems([]);
      setShowClearConfirm(false);
      void refreshAppBadge();
    } finally {
      setClearing(false);
    }
  }

  async function handleDownload(item: HistoryMediaItem) {
    if (!item.dataBase64) return;
    const filename = item.filename || `file-${item.messageId}`;
    await saveBase64Media(item.dataBase64, item.mime || "application/octet-stream", filename);
  }

  return (
    <MessengerShell variant="app" title={kind === "room" ? "О комнате" : "Контакт"} backHref={backHref}>
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="mx-auto w-full max-w-lg">
          <section className="flex flex-col items-center gap-3 bg-gradient-to-b from-slate-100 to-white px-4 pt-6 pb-5">
            <MessengerAvatar
              src={avatarUrl}
              label={title}
              size="call"
              kind={kind === "room" ? "room" : "user"}
              seed={seed || phone || channel}
              className="!h-28 !w-28 !text-4xl shadow-md"
              onClick={avatarUrl ? () => setLightbox(avatarUrl) : undefined}
            />
            <div className="text-center min-w-0 w-full">
              <h2 className="text-xl font-semibold text-gray-900 truncate px-2">{title}</h2>
              {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
              {phone && (
                <p className="text-sm text-gray-600 mt-1 tabular-nums">{maskPhone(phone)}</p>
              )}
            </div>
            {kind === "dm" && call && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={call.startAudioCall}
                  disabled={call.isInCall}
                  className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 disabled:opacity-40"
                >
                  Аудиозвонок
                </button>
                <button
                  type="button"
                  onClick={call.startVideoCall}
                  disabled={call.isInCall}
                  className="rounded-xl bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 disabled:opacity-40"
                >
                  Видеозвонок
                </button>
              </div>
            )}
            {adminHref && (
              <Link
                href={adminHref}
                className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700"
              >
                Управление комнатой
              </Link>
            )}
          </section>

          {kind === "dm" && phone && (
            <section className="border-t border-gray-100 px-4 py-3">
              <p className="mb-2 text-xs font-semibold text-gray-500">Контакт</p>
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{maskPhone(phone)}</p>
                  <p className="text-[11px] text-gray-400">{subtitle ?? "Контакт мессенджера"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(phone)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600"
                >
                  Копировать
                </button>
              </div>
            </section>
          )}

          {kind === "room" && participants.length > 0 && (
            <section className="border-t border-gray-100 px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">
                Участники · {participants.length}
              </p>
              <ul className="space-y-2">
                {participants.map((p) => (
                  <li key={p.phone} className="flex items-center gap-3">
                    <MessengerAvatar
                      src={p.avatarUrl}
                      label={p.label}
                      size="sm"
                      seed={p.phone}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.label}</p>
                      <p className="text-[11px] text-gray-400">
                        {p.role ?? "member"}
                        {p.online ? " · в сети" : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="border-t border-gray-100 px-4 pt-3 pb-2">
            <p className="text-xs font-semibold text-gray-500 mb-2">В этом чате</p>
            <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
              {(
                [
                  ["media", `Медиа (${grouped.media.length})`],
                  ["docs", `Документы (${grouped.docs.length})`],
                  ["links", `Ссылки (${grouped.links.length})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors ${
                    tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {!isUnlocked && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Разблокируйте PIN, чтобы увидеть медиа из локальной истории.
              </p>
            )}
            {loadingMedia && <p className="mt-3 text-xs text-gray-400">Загрузка…</p>}
            {!loadingMedia && isUnlocked && activeList.length === 0 && (
              <p className="mt-3 text-xs text-gray-400 text-center py-6">Пока пусто</p>
            )}
            {!loadingMedia && activeList.length > 0 && tab === "media" && (
              <div className="mt-3 grid grid-cols-3 gap-1">
                {activeList.map((item) => (
                  <button
                    key={`${item.messageId}-${item.url ?? item.filename ?? item.ts}`}
                    type="button"
                    className="aspect-square overflow-hidden rounded-lg bg-gray-100"
                    onClick={() => {
                      if (item.mime?.startsWith("image/") && item.dataUrl) {
                        setLightbox(item.dataUrl);
                      } else if (item.dataBase64) {
                        void handleDownload(item);
                      }
                    }}
                  >
                    {item.mime?.startsWith("image/") && item.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.dataUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-[10px] text-gray-500">
                        <span>{item.mime?.startsWith("video/") ? "▶︎" : "♪"}</span>
                        <span className="truncate w-full text-center">
                          {item.filename ?? "медиа"}
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            {!loadingMedia && activeList.length > 0 && tab === "docs" && (
              <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                {activeList.map((item) => (
                  <li key={`${item.messageId}-${item.filename}`}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50"
                      onClick={() => void handleDownload(item)}
                    >
                      <p className="text-sm font-medium truncate">{item.filename ?? "Файл"}</p>
                      <p className="text-[11px] text-gray-400">{formatTs(item.ts)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!loadingMedia && activeList.length > 0 && tab === "links" && (
              <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                {activeList.map((item) => (
                  <li key={`${item.messageId}-${item.url}`}>
                    <button
                      type="button"
                      onClick={() => item.url && void openExternalUrl(item.url)}
                      className="block w-full px-3 py-2.5 text-left hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-sky-700 truncate">{item.url}</p>
                      <p className="text-[11px] text-gray-400 truncate">{item.context}</p>
                      <p className="text-[11px] text-gray-400">{formatTs(item.ts)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border-t border-gray-100 px-4 py-4 space-y-2 mb-6">
            <button
              type="button"
              disabled={!isUnlocked}
              onClick={() => setShowClearConfirm(true)}
              className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 disabled:opacity-50"
            >
              Очистить чат на этом устройстве
            </button>
            {kind === "room" && onLeaveRoom && (
              <button
                type="button"
                disabled={leaveBusy}
                onClick={() => {
                  setLeaveBusy(true);
                  void Promise.resolve(onLeaveRoom()).finally(() => setLeaveBusy(false));
                }}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 disabled:opacity-50"
              >
                {leaveBusy ? "Выход…" : "Покинуть комнату"}
              </button>
            )}
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Медиа и документы берутся из локальной истории на этом устройстве. Удалённые сообщения
              здесь не показываются.
            </p>
          </section>
        </div>
      </div>

      {lightbox && (
        <AvatarLightbox src={lightbox} label={title} onClose={() => setLightbox(null)} />
      )}

      <ConfirmDialog
        open={showClearConfirm}
        title="Очистить локальную историю? У собеседника переписка останется."
        confirmLabel={clearing ? "Очистка…" : "Очистить"}
        cancelLabel="Отмена"
        destructive
        onConfirm={() => void handleClear()}
        onCancel={() => setShowClearConfirm(false)}
      />
    </MessengerShell>
  );
}
