"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { closeShareRoomApi, pollShareRoomApi } from "@/lib/share/client";
import { clearShareSession, loadShareSession } from "@/lib/share/session";
import type { ShareSession } from "@/lib/share/types";
import {
  ShareTransferManager,
  type TransferProgress,
  type TransferQueueItem,
} from "@/lib/share/transfer-manager";
import { SharePeerConnection, type ShareConnectionState } from "@/lib/share/webrtc-session";
import { FileTransferPanel } from "../components/FileTransferPanel";
import { RoomInvitePanel } from "../components/RoomInvitePanel";
import { ShareShell } from "../components/ShareShell";

export function ShareRoomClient() {
  const router = useRouter();
  const [session, setSession] = useState<ShareSession | null>(null);
  const [connectionState, setConnectionState] = useState<ShareConnectionState>("idle");
  const [peerName, setPeerName] = useState<string | null>(null);
  const [queue, setQueue] = useState<TransferQueueItem[]>([]);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<{ transferId: string; fileCount: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const peerRef = useRef<SharePeerConnection | null>(null);
  const transferRef = useRef<ShareTransferManager | null>(null);

  useEffect(() => {
    const loaded = loadShareSession();
    if (!loaded) {
      router.replace("/share");
      return;
    }
    setSession(loaded);
  }, [router]);

  useEffect(() => {
    if (!session) return;

    const polite = session.role === "guest";
    const peer = new SharePeerConnection(session, polite, {
      onConnectionState: setConnectionState,
      onPeerDeviceName: setPeerName,
      onError: (err) => setError(err.message),
    });
    peerRef.current = peer;

    const transfer = new ShareTransferManager(peer, {
      onQueueUpdate: setQueue,
      onProgress: setProgress,
      onIncomingOffer: (transferId, files) => {
        setIncomingOffer({ transferId, fileCount: files.length });
      },
      onTransferComplete: () => setProgress(null),
      onError: (err) => setError(err.message),
    });
    transferRef.current = transfer;

    void peer.start();

    const pollPeer = setInterval(() => {
      void pollShareRoomApi(session, 0)
        .then((snap) => {
          if (snap.peer?.deviceName) setPeerName(snap.peer.deviceName);
        })
        .catch(() => {});
    }, 3000);

    return () => {
      clearInterval(pollPeer);
      transfer.destroy();
      peer.close();
    };
  }, [session]);

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
        </p>
      </div>

      <FileTransferPanel
        queue={queue}
        progress={progress}
        canSend={connectionState === "connected"}
        incomingOffer={incomingOffer}
        onPickFiles={(files: FileList | File[]) => transferRef.current?.setFiles(Array.from(files))}
        onStartSend={() => void transferRef.current?.startSend()}
        onCancel={() => transferRef.current?.cancel()}
        onAcceptIncoming={() => {
          transferRef.current?.acceptIncoming();
          setIncomingOffer(null);
        }}
        onRejectIncoming={() => {
          transferRef.current?.rejectIncoming();
          setIncomingOffer(null);
        }}
      />
    </ShareShell>
  );
}
