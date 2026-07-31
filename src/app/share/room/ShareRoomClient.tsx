"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { pickShareChunkSize } from "@/lib/share/chunk-size";
import {
  closeShareRoomApi,
  registerShareBeaconApi,
} from "@/lib/share/client";
import {
  collectConnectionDiagnostics,
  type ConnectionDiagnostics,
} from "@/lib/share/connection-diagnostics";
import {
  formatPendingTextAsBody,
  parseShareTargetParams,
  peekPendingFilesCount,
  peekPendingText,
  stashPendingFiles,
  stashPendingText,
  takePendingFiles,
  takePendingText,
} from "@/lib/share/pending-payload";
import { filesFromFileList, pickDirectoryFiles } from "@/lib/share/pick-files";
import { clearShareSession, loadShareSession } from "@/lib/share/session";
import type { ShareSession } from "@/lib/share/types";
import {
  ShareTransferManager,
  type IncomingTransferOffer,
  type ShareTextMessage,
  type TransferProgress,
  type TransferQueueItem,
} from "@/lib/share/transfer-manager";
import { useShareLaunchQueue } from "@/lib/share/use-share-launch-queue";
import { SharePeerConnection, type ShareConnectionState } from "@/lib/share/webrtc-session";
import { ConnectionDiagnosticsPanel } from "../components/ConnectionDiagnosticsPanel";
import { FileTransferPanel } from "../components/FileTransferPanel";
import { RoomInvitePanel } from "../components/RoomInvitePanel";
import { ShareShell } from "../components/ShareShell";
import { TextTransferPanel } from "../components/TextTransferPanel";

function buildPendingBanner(): string | null {
  const fileCount = peekPendingFilesCount();
  const text = peekPendingText();
  if (fileCount > 0 && text) {
    return `Готово к отправке: ${fileCount} файл(ов) и текст из «Поделиться»`;
  }
  if (fileCount > 0) {
    return `Добавлено ${fileCount} файл(ов) из «Поделиться»`;
  }
  if (text) {
    return "Текст из «Поделиться» готов к отправке";
  }
  return null;
}

export function ShareRoomClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<ShareSession | null>(null);
  const [connectionState, setConnectionState] = useState<ShareConnectionState>("idle");
  const [transport, setTransport] = useState<"ws" | "poll">("poll");
  const [peerName, setPeerName] = useState<string | null>(null);
  const [outboundQueue, setOutboundQueue] = useState<TransferQueueItem[]>([]);
  const [inboundOffers, setInboundOffers] = useState<IncomingTransferOffer[]>([]);
  const [inboundQueues, setInboundQueues] = useState<Map<string, TransferQueueItem[]>>(new Map());
  const [textMessages, setTextMessages] = useState<ShareTextMessage[]>([]);
  const [textDraft, setTextDraft] = useState(() => {
    const text = peekPendingText();
    return text ? formatPendingTextAsBody(text) : "";
  });
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [diagnostics, setDiagnostics] = useState<ConnectionDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingBanner, setPendingBanner] = useState<string | null>(() => buildPendingBanner());

  const peerRef = useRef<SharePeerConnection | null>(null);
  const transferRef = useRef<ShareTransferManager | null>(null);
  const shareTargetHandledRef = useRef(false);
  const pendingConsumedRef = useRef(false);

  const handleLaunchFiles = useCallback(
    (files: File[]) => {
      const activeSession = loadShareSession();
      if (!activeSession) {
        stashPendingFiles(files);
        router.replace("/share?pending=1");
        return;
      }
      transferRef.current?.setFiles(filesFromFileList(files));
      setPendingBanner(`Добавлено ${files.length} файл(ов) из «Поделиться»`);
    },
    [router],
  );

  useShareLaunchQueue(handleLaunchFiles);

  useEffect(() => {
    if (shareTargetHandledRef.current) return;

    const payload = parseShareTargetParams({
      title: searchParams.get("title"),
      text: searchParams.get("text"),
      url: searchParams.get("url"),
    });
    if (!payload) return;

    shareTargetHandledRef.current = true;
    const activeSession = loadShareSession();
    if (!activeSession) {
      stashPendingText(payload);
      router.replace("/share?pending=1");
      return;
    }

    stashPendingText(payload);
    router.replace("/share/room");
  }, [searchParams, router]);

  useEffect(() => {
    const loaded = loadShareSession();
    if (!loaded) {
      router.replace("/share");
      return;
    }
    queueMicrotask(() => setSession(loaded));
  }, [router]);

  useEffect(() => {
    if (!session) return;

    const polite = session.role === "guest";
    const peer = new SharePeerConnection(session, polite, {
      onConnectionState: setConnectionState,
      onPeerDeviceName: setPeerName,
      onTransport: setTransport,
      onError: (err) => setError(err.message),
    });
    peerRef.current = peer;

    const transfer = new ShareTransferManager(
      peer,
      session.roomId,
      {
        onOutboundUpdate: setOutboundQueue,
        onInboundUpdate: (transferId, items) => {
          setInboundQueues((prev) => {
            const next = new Map(prev);
            next.set(transferId, items);
            return next;
          });
        },
        onIncomingOffers: setInboundOffers,
        onProgress: setProgress,
        onTransferComplete: () => setProgress(null),
        onTextUpdate: setTextMessages,
        onError: (err) => setError(err.message),
      },
      pickShareChunkSize(session.lanPrefer),
    );
    transferRef.current = transfer;

    void peer.start();

    if (session.role === "host") {
      void registerShareBeaconApi(session).catch(() => {});
      const beaconTimer = setInterval(() => {
        void registerShareBeaconApi(session).catch(() => {});
      }, 20000);
      return () => {
        clearInterval(beaconTimer);
        transfer.destroy();
        peer.close();
      };
    }

    return () => {
      transfer.destroy();
      peer.close();
    };
  }, [session]);

  useEffect(() => {
    if (!session || pendingConsumedRef.current) return;
    pendingConsumedRef.current = true;

    const files = takePendingFiles();
    if (files?.length) {
      transferRef.current?.setFiles(filesFromFileList(files));
    }

    const textPayload = takePendingText();
    if (textPayload) {
      queueMicrotask(() => {
        setTextDraft(formatPendingTextAsBody(textPayload));
        setPendingBanner(buildPendingBanner() ?? "Текст из «Поделиться» готов к отправке");
      });
    } else if (files?.length) {
      queueMicrotask(() => {
        setPendingBanner(`Добавлено ${files.length} файл(ов) из «Поделиться»`);
      });
    }
  }, [session]);

  useEffect(() => {
    if (connectionState !== "connected") return;
    const timer = setInterval(() => {
      const pc = peerRef.current?.getPeerConnection() ?? null;
      void collectConnectionDiagnostics(pc).then(setDiagnostics);
    }, 4000);
    return () => clearInterval(timer);
  }, [connectionState]);

  const handleLeave = useCallback(async () => {
    if (session) {
      try {
        await closeShareRoomApi(session);
      } catch {
        /* ignore */
      }
    }
    clearShareSession();
    router.replace("/share");
  }, [session, router]);

  async function handlePickFolder() {
    try {
      const picked = await pickDirectoryFiles();
      if (picked.length) transferRef.current?.setFiles(picked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выбрать папку");
    }
  }

  function handleSendText() {
    transferRef.current?.sendText(textDraft);
    setTextDraft("");
  }

  if (!session) {
    return (
      <ShareShell title="QHub Share">
        <div className="p-4 text-sm text-gray-500">Загрузка…</div>
      </ShareShell>
    );
  }

  const connectionLabel =
    connectionState === "connected"
      ? "Подключено"
      : connectionState === "connecting"
        ? "Подключение…"
        : connectionState === "failed"
          ? "Ошибка соединения"
          : "Ожидание";

  return (
    <ShareShell
      title="QHub Share"
      subtitle={
        peerName
          ? `Собеседник: ${peerName}`
          : session.role === "host"
            ? "Ожидание второго участника"
            : connectionLabel
      }
      backHref="/share"
      trailing={
        <button
          type="button"
          onClick={() => void handleLeave()}
          className="text-xs text-red-600 px-2 py-1 rounded-lg hover:bg-red-50"
        >
          Выйти
        </button>
      }
    >
      {error && (
        <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {pendingBanner && (
        <div className="mx-4 mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          {pendingBanner}
        </div>
      )}

      {session.role === "host" && session.inviteToken && (
        <RoomInvitePanel
          roomCode={session.roomCode}
          inviteToken={session.inviteToken}
          returnTo="/share"
        />
      )}

      <div className="px-4 py-2">
        <p className="text-xs text-gray-500">
          Код: <span className="font-mono font-medium text-gray-700">{session.roomCode}</span>
          {" · "}
          {connectionLabel}
          {" · "}
          {transport === "ws" ? "WebSocket" : "Polling"}
        </p>
      </div>

      <ConnectionDiagnosticsPanel
        diagnostics={diagnostics}
        lanPrefer={session.lanPrefer}
        connectionState={connectionState}
      />

      <TextTransferPanel
        messages={textMessages}
        draft={textDraft}
        canSend={connectionState === "connected"}
        onDraftChange={setTextDraft}
        onSend={handleSendText}
      />

      <FileTransferPanel
        outboundQueue={outboundQueue}
        inboundOffers={inboundOffers}
        inboundQueues={inboundQueues}
        progress={progress}
        canSend={connectionState === "connected"}
        onPickFiles={(files) => transferRef.current?.setFiles(filesFromFileList(files))}
        onPickFolder={() => void handlePickFolder()}
        onStartSend={() => void transferRef.current?.startSend()}
        onCancelOutbound={() => transferRef.current?.cancelOutbound()}
        onCancelInbound={(id) => transferRef.current?.cancelInbound(id)}
        onAcceptIncoming={(id) => transferRef.current?.acceptIncoming(id)}
        onRejectIncoming={(id) => transferRef.current?.rejectIncoming(id)}
      />
    </ShareShell>
  );
}
